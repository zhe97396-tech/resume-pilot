/**
 * pager.js - 智能分页核心逻辑
 * 
 * 借鉴：@ohmycv/vue-smart-pages (MIT 许可)
 * 源码：https://github.com/Renovamen/oh-my-cv/tree/main/packages/vue-smart-pages
 * 
 * 核心算法参考：
 * - useSmartPages.ts: render 函数
 * - dom.ts: breakPage 函数、_elementHeight 函数
 */

class SmartPager {
  /**
   * @param {HTMLElement} container - 预览容器
   * @param {Object} options - 配置选项
   * @param {Object} options.pageSize - 页面尺寸 {width, height} mm
   * @param {Object} options.margins - 页边距 {top, bottom, left, right} px
   * @param {Function} options.onPageChange - 页数变化回调
   */
  constructor(container, options = {}) {
    this.container = container;
    this.pageSize = options.pageSize || { width: 210, height: 297 };
    this.margins = options.margins || { top: 15, bottom: 15, left: 15, right: 15 };
    this.onPageChange = options.onPageChange || (() => {});

    // 保存原始 HTML 内容，用于重新分页
    this.lastHtml = '';

    this.pageHeight = 0;
    this.updatePageHeight();
  }

  /**
   * 更新页面可用高度
   *
   * 优先从已渲染的 .resume-page 元素实测（浏览器原生像素），
   * 消除 DPI/缩放引入的 mm→px 转换误差。
   * 首次渲染前回退到精确数学换算（96/25.4）。
   */
  updatePageHeight() {
    const existingPage = this.container.querySelector('.resume-page');
    if (existingPage) {
      const style = getComputedStyle(existingPage);
      const totalH = existingPage.clientHeight;
      const padTop = parseFloat(style.paddingTop) || 0;
      const padBottom = parseFloat(style.paddingBottom) || 0;
      this.pageHeight = totalH - padTop - padBottom;
    } else {
      // 初次渲染时还没有 page 元素，用精确换算
      // 1 CSS mm = 96 / 25.4 px（≈3.7795，非 3.78）
      const pagePx = this.pageSize.height * 96 / 25.4;
      this.pageHeight = pagePx - this.margins.top - this.margins.bottom;
    }
  }

  /**
   * 分页渲染
   * 参考：useSmartPages.ts 中的 render 函数
   *
   * @param {string} html - 渲染后的 HTML 内容
   */
  async render(html) {
    this.lastHtml = html;

    // 1. 在临时容器中测量和分页（不影响可见内容，避免闪烁）
    const tempContainer = this.createTempContainer(html);
    document.body.appendChild(tempContainer);

    // 2. 等待字体加载（确保测量准确）
    await document.fonts.ready;

    // 3. 分页处理
    const pages = this.breakPages(tempContainer);

    // 4. 原子替换：清空 + 写入在同一个同步块中完成
    this.container.innerHTML = '';
    this.container.appendChild(pages);

    // 5. 清理临时容器
    document.body.removeChild(tempContainer);

    // 6. 回调通知页数变化
    this.onPageChange(this.getPageCount());
  }

  /**
   * 分页核心算法
   * 参考：dom.ts 中的 breakPage 函数
   * 
   * @param {HTMLElement} container - 临时容器
   * @returns {HTMLElement} 分页后的容器
   */
  breakPages(container) {
    const pages = document.createElement('div');
    pages.className = 'resume-pages';

    // 展开成“分页单位”：顶层块仍是一个单位；分节（.resume-section）则**展开其子块**。
    // 关键：分页粒度与改造前完全一致（仍是块级），所以单列排版的分页结果不变；
    // 同时记住每个块属于哪个分节，翻页时在新页里**重建分节包裹**，
    // 这样模板才能用 .resume-section 做卡片/部内多列，而长分节仍可跨页拆分。
    const units = [];
    const MARK = 'resume-section-mark';
    Array.from(container.children).forEach((child) => {
      if (child.classList.contains('resume-section')) {
        // 跳过占位元素：它不作为分页单位，而是由下面在**每个新建包裹**里重新注入，
        // 这样才能保证「同一分节跨页时，下一页的片段也带占位元素」——
        // 否则若某页恰好以 h2 开头，该 h2 会成为 :first-child 而被模板的上边距规则误命中。
        Array.from(child.children).forEach((sub) => {
          if (!sub.classList.contains(MARK)) units.push({ node: sub, section: child });
        });
      } else {
        units.push({ node: child, section: null });
      }
    });

    let currentPage = this.createPage();
    let accHeight = 0;
    let curWrap = null;      // 当前页里正在填充的分节容器
    let curSrc = null;       // 它对应的源分节（用于判断是否同节）

    units.forEach(({ node, section }) => {
      const childHeight = this.getElementHeight(node);

      // 超出页面高度或遇到分页符，创建新页
      // 参考：dom.ts 中的判断逻辑
      // 注意：分页符本身高度为 0，当页尚未累积内容时不应响应，
      //      否则首行/连续/末行的手动分页符会产生空白 A4 页
      const isPageBreak = node.classList.contains('md-it-newpage');

      if ((accHeight + childHeight > this.pageHeight && accHeight > 0) || (isPageBreak && accHeight > 0)) {
        pages.appendChild(currentPage);
        currentPage = this.createPage();
        accHeight = 0;
        curWrap = null;      // 翻页 → 分节在新页重新开（同一分节跨页时是新包裹）
        curSrc = null;

        // 分页符：添加到新页顶部作为视觉标记
        if (isPageBreak) {
          currentPage.appendChild(node.cloneNode(true));
          return;
        }
      }

      if (section) {
        if (curSrc !== section) {
          curWrap = section.cloneNode(false);   // 只拷分节本身（类名/属性），不带子节点
          const mark = document.createElement('i');   // 每页片段开头都补一个占位元素
          mark.className = MARK;
          mark.setAttribute('aria-hidden', 'true');
          curWrap.appendChild(mark);
          curSrc = section;
          currentPage.appendChild(curWrap);
        }
        curWrap.appendChild(node.cloneNode(true));
      } else {
        currentPage.appendChild(node.cloneNode(true));
      }
      accHeight += childHeight;
    });

    // 添加最后一页（排除只含分页符的空页）
    const hasContent = Array.from(currentPage.children).some(
      (c) => !c.classList.contains('md-it-newpage')
    );
    if (hasContent) {
      pages.appendChild(currentPage);
    }
    
    return pages;
  }

  /**
   * 创建单页容器
   * 参考：dom.ts 中的 _createPage 函数
   */
  createPage() {
    const page = document.createElement('div');
    page.className = 'resume-page';
    page.dataset.scope = 'smart-pager';
    page.dataset.part = 'page';

    // 使用 CSS 变量控制样式，不设置内联样式
    // CSS 变量在 index.html 和模板 CSS 中定义

    return page;
  }

  /**
   * 获取元素高度（包含 margin）
   * 参考：dom.ts 中的 _elementHeight 函数
   */
  getElementHeight(element) {
    const style = window.getComputedStyle(element);
    const marginTop = parseInt(style.marginTop) || 0;
    const marginBottom = parseInt(style.marginBottom) || 0;
    return element.offsetHeight + marginTop + marginBottom;
  }

  /**
   * 创建临时容器
   * 参考：useSmartPages.ts 中的 copy 逻辑
   */
  createTempContainer(html) {
    const container = document.createElement('div');
    container.className = 'resume-page';
    container.style.cssText = `
      position: absolute;
      left: -9999px;
      top: 0;
      width: var(--resume-page-width, 210mm);
      min-height: 0 !important;
      box-sizing: border-box;
      visibility: hidden;
    `;
    container.innerHTML = html;
    return container;
  }

  /**
   * 更新分页参数
   */
  updateOptions(options) {
    if (options.pageSize) {
      this.pageSize = { ...this.pageSize, ...options.pageSize };
    }
    if (options.margins) {
      this.margins = { ...this.margins, ...options.margins };
    }
    this.updatePageHeight();
  }

  /**
   * 获取页数
   */
  getPageCount() {
    return this.container.querySelectorAll('.resume-page').length;
  }

  /**
   * 重新计算分页
   */
  recalculate() {
    if (this.lastHtml) {
      this.render(this.lastHtml);
    }
  }
}

// 导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SmartPager;
} else {
  window.SmartPager = SmartPager;
}
