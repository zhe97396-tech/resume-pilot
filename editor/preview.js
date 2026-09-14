/**
 * preview.js - Markdown 渲染服务
 * 
 * 借鉴：Oh My CV - site/src/utils/markdown.ts
 * 源码：https://github.com/Renovamen/oh-my-cv/blob/main/site/src/utils/markdown.ts
 * 
 * 核心参考：
 * - MarkdownService 类
 * - renderResume 方法
 * - _resolveDeflist 方法
 */

/** 简历照片 URL。全站只有一张 config/photo.jpg；服务端带 ETag，
 *  未变返回 304（很便宜），直接在文件系统里换照片则刷新即生效。 */
function resumePhotoUrl() {
  return '/api/photo';
}

class MarkdownRenderer {
  constructor() {
    // markdown-it 实例（通过 CDN 加载后全局可用）
    this.md = null;
  }

  /**
   * 初始化 markdown-it
   */
  init() {
    if (typeof markdownit === 'undefined') {
      console.error('markdown-it 未加载，请确保 CDN 已引入');
      return false;
    }
    
    // 参考：MarkdownService 构造函数
    this.md = markdownit({
      html: true,
      linkify: true,
      typographer: true,
      breaks: true
    });

    // 插件：定义列表
    if (typeof markdownitDeflist !== 'undefined') {
      this.md.use(markdownitDeflist);
    }

    // 自定义：\newpage 手动分页（参考 Oh My CV markdown-it-latex-cmds）
    this.md.block.ruler.after('blockquote', 'newpage', (state, start, end, silent) => {
      const bpos = state.bMarks[start];
      const epos = state.eMarks[start];
      const line = state.src.substring(bpos, epos).trim();
      if (line !== '\\newpage') return false;

      if (silent) return true;

      const token = state.push('newpage', '', 0);
      token.block = true;
      token.map = [start, start + 1];
      token.markup = '\\newpage';
      state.line = start + 1;
      return true;
    });

    this.md.renderer.rules.newpage = () =>
      '<div class="md-it-newpage" style="border-top:2px solid #e94560;margin:8px 0;color:#e94560;font-size:12px;text-align:center;" title="手动分页">—— 分页符 ——</div>';

    return true;
  }

  /**
   * 渲染 Markdown 为 HTML
   * 参考：renderResume 方法
   *
   * @param {string} markdown - Markdown 源码
   * @param {Object} [options] - 渲染选项
   * @param {string} [options.itemHeader] - 条目头骨架：'inline' | 'split' | 其他（=不改造）
   *                                        取值来自 templates/manifest.json 的 features.itemHeader
   * @returns {string} HTML
   */
  render(markdown, options = {}) {
    if (!this.md) {
      if (!this.init()) {
        return '<p style="color: red;">Markdown 渲染器初始化失败</p>';
      }
    }

    // 1. 解析 Front Matter
    const { body, frontMatter } = this.parseFrontMatter(markdown);

    // 2. 渲染正文
    let html = this.md.render(body);

    // 3. 处理定义列表（相邻的 dl 合并）
    // 参考：_resolveDeflist 方法
    html = this.resolveDeflist(html);

    // 3.5 条目头结构语义化（公司行 / 教育行）
    // 仅在模板声明了 features.itemHeader 时启用
    html = this.resolveMetaRows(html, options.itemHeader);

    // 3.6 技能块结构语义化（技能名 + 等级点阵）
    html = this.resolveSkills(html);

    // 4. 渲染头部（姓名、联系方式）
    if (frontMatter) {
      html = this.renderHeader(frontMatter) + html;
    } else {
      // 无 front-matter 时自动提取 # 姓名 + 联系方式列表 → .resume-header
      html = this.autoWrapHeader(html);
    }

    // 3.7 按 h2 包裹分节（让模板能以「分节」为单位排版；分页器已配合改造：
    //     见 pager.js 的 breakPages——它改为看进 section 内部再分页）
    html = this.wrapSections(html);

    // 3.8 按面板指定的顺序重排分节（编辑器「模块顺序」的即时预览）
    //     仅当调用方传了 order 才生效；不传则完全不动，不影响其它调用方
    html = this.orderSections(html, options.order);

    return html;
  }

  /**
   * 按给定顺序重排分节（供编辑器「模块顺序」面板做**即时预览**）
   *
   * 为什么按标题匹配就够：DOM 里分节的标识就是 data-section="标题"，
   * 而面板拿到的 sections[].title 与服务端 `_normalize_section` 同源，
   * 都来自 generate_md 的 SECTION_TITLES 或 layout 里的自定义 title → 两边一致。
   *
   * 未在 order 中出现的分节（内容为空而没出现在 md 里、或用户手工加了分节）
   * **保持原有相对顺序**，排在已指定分节之后（排序稳定 + 未命中记极大值）。
   * 非分节的顶层节点（头部块、首个 <hr>）位置不动。
   *
   * @param {string} html - 已 wrapSections 的 HTML
   * @param {string[]|undefined} order - 分节标题顺序
   * @returns {string} HTML
   */
  orderSections(html, order) {
    if (!Array.isArray(order) || !order.length) return html;

    const box = document.createElement('div');
    box.innerHTML = html;
    const nodes = Array.from(box.children);
    const isSection = (n) => n.classList && n.classList.contains('resume-section');
    const sections = nodes.filter(isSection);
    if (sections.length < 2) return html;

    const rank = new Map();
    order.forEach((t, i) => { if (!rank.has(t)) rank.set(t, i); });
    const rankOf = (n) => {
      const t = n.getAttribute('data-section');
      return rank.has(t) ? rank.get(t) : Number.MAX_SAFE_INTEGER;
    };
    const ordered = sections.slice().sort((a, b) => rankOf(a) - rankOf(b));

    let k = 0;
    for (let i = 0; i < nodes.length; i++) {
      if (isSection(nodes[i])) nodes[i] = ordered[k++];
    }

    box.textContent = '';
    nodes.forEach((n) => box.appendChild(n));
    return box.innerHTML;
  }

  /**
   * 按 h2 把正文包成 <section class="resume-section">
   *
   * 目的：让模板能用 CSS 把**一个分节当作一个整体**排版——分节卡片边框、
   * 部内多列（如技能两列）、分节内独立间距，这些此前都做不到
   * （原 DOM 是 h2 与各块平铺，CSS 无法界定“这一节到哪里结束”）。
   *
   * 边界规则：**每个 h2 开一个新分节**；h2 之前的顶层内容（头部块、首个分隔线）
   * 留在 section 之外。`<hr>`（Markdown 的 ---）**不当作边界**——它既可能是分节前的
   * 分隔线、也可能是工作经历内部公司之间的分隔线，归给“当前所在分节”。
   *
   * 同时写 data-section="<标题>"：标题可被 layout 改写，模板里需稳健定位时
   * 建议用内容选择器（如 .resume-section:has(.resume-skills)）而非标题字符串。
   *
   * 每个分节内部先放一个不可见的 .resume-section-mark：用于**保持 h2 不是 :first-child**，
   * 以免模板里已有的 `.resume-page h2:first-child { margin-top: 0 }`（原本永不命中）
   * 变成每节都命中、把所有分节上边距抹为 0。
   *
   * 注意：包裹后**顶层单位**从“块”变成了“整节”，因此分页器必须改为看进 section
   * 内部再分页（见 pager.js 的 breakPages），否则长分节会变成不可拆的原子而溢出。
   *
   * @param {string} html
   * @returns {string} HTML
   */
  wrapSections(html) {
    const box = document.createElement('div');
    box.innerHTML = html;

    const out = [];
    let cur = null;
    Array.from(box.children).forEach((node) => {
      if (node.tagName === 'H2') {
        cur = document.createElement('section');
        cur.className = 'resume-section';
        const title = (node.textContent || '').trim();
        if (title) cur.setAttribute('data-section', title);
        out.push(cur);
        // 关键：先放一个不可见的占位元素，让 h2 **不是** section 的 :first-child。
        // 否则模板里已有的 `.resume-page h2:first-child { margin-top: 0 }`
        // 会从“从不命中”（旧 DOM 里 h2 前还有头部 div 与 <hr>）变成“每节都命中”，
        // 把所有分节的上边距抹成 0——这是实测发现的回归。
        const mark = document.createElement('i');
        mark.className = 'resume-section-mark';
        mark.setAttribute('aria-hidden', 'true');
        cur.appendChild(mark);
        cur.appendChild(node);
      } else if (cur) {
        cur.appendChild(node);
      } else {
        out.push(node);
      }
    });

    box.textContent = '';
    out.forEach((node) => box.appendChild(node));
    return box.innerHTML;
  }

  /**
   * 条目头结构语义化：（工作经历）公司行 /（教育背景）教育行 → 可分别定位的槽
   *
   * 背景：generate_md.py 的 render_company_line / render_education 用**全角空格**把
   *       时间 / 岗位 / 公司撑成一行（如 `**时间　　　　岗位　　　　公司**`）。
   *       全角空格宽度 = 1em = 字号，A4 可用宽度约 704px 时，该行宽度恰好卡在临界点；
   *       字号调大或岗位 / 公司名稍长，公司名就会被挤到第二行。
   *       且 CSS **无法**修正——公司名与时间在同一个文本节点里，无法单独右对齐。
   *
   * 解法：把这类段落拆成三个槽，位置交给模板 CSS 的 flex 决定。
   *   'inline' → 三列同行 .resume-meta-row（左列与右列按内容宽度、不折行，中列吸收压缩）
   *   'split'  → 两行两列 .resume-meta-row--split（第一行 主名 + 时间，第二行 次要名）
   *
   * 语义归一是按「时间槽的位置」判定的，不依赖段数，因此学位为空等缺字段情况也能命中：
   *   公司行：时间 · 岗位 · 公司        → 时间槽在首
   *   教育行：校名 · 专业 · 学历 · 时间  → 时间槽在末
   * 认不出时间槽（periodIdx 既不在首也不在末）时**原样返回**，不做任何改动。
   *
   * 向后兼容：itemHeader 为其他值（含 undefined）时直接 return，输出与改造前逐字符一致。
   *
   * @param {string} html - markdown-it 渲染后的 HTML
   * @param {string|undefined} mode - 'inline' | 'split' | 其他
   * @returns {string} HTML
   */
  resolveMetaRows(html, mode) {
    if (mode !== 'inline' && mode !== 'split') return html;

    const FWSP_RUN = /\u3000{2,}/;      // 两个及以上全角空格 = 列分隔符
    const PERIOD = /^\d{4}\s*[.\-/年]/; // 时间槽形如 2023.10 / 2023-10 / 2023年10月

    return html.replace(/<p>([\s\S]*?)<\/p>/g, (whole, inner) => {
      if (!FWSP_RUN.test(inner)) return whole;

      // 整行加粗时（公司行）保留加粗；教育行本就不加粗
      const bold = /^\s*<strong>([\s\S]*?)<\/strong>\s*$/.exec(inner);
      const src = bold ? bold[1] : inner;

      const parts = src.split(FWSP_RUN).map((s) => s.trim()).filter(Boolean);
      if (parts.length < 3) return whole;

      const periodIdx = parts.findIndex((s) => PERIOD.test(s));
      if (periodIdx === -1) return whole;

      const isWork = periodIdx === 0;
      const isEdu = periodIdx === parts.length - 1;
      if (!isWork && !isEdu) return whole;

      const period = parts[periodIdx];
      // 主名：公司行取末段（公司），教育行取首段（校名）
      const main = isWork ? parts[parts.length - 1] : parts[0];
      // 次要名：剥掉首尾（公司行=时间与公司；教育行=校名与时间）后剩下的中间段。
      // 公司行剩 [岗位]，教育行剩 [专业, 学历]（缺学位时剩 [专业]）。
      const secondary = parts.slice(1, -1).join(' · ');

      const t = (s) => (bold ? `<strong>${s}</strong>` : s);
      const span = (cls, s) => `<span class="resume-meta-${cls}">${t(s)}</span>`;
      // 行类型标记：供 CSS 区分公司行 / 教育行。
      // 教育行的首槽是校名（长度不一），需定最小宽才能让中槽起点跨行对齐（见 _base.css）。
      const kind = isEdu ? 'resume-meta-row--edu' : 'resume-meta-row--work';

      if (mode === 'inline') {
        // 保持 Markdown 原始顺序：公司行 时间/岗位/公司，教育行 校名/专业学历/时间
        const leading = isWork ? period : main;
        const trailing = isWork ? main : period;
        return '<div class="resume-meta-row ' + kind + '">'
          + span('leading', leading)
          + span('middle', secondary)
          + span('trailing', trailing)
          + '</div>';
      }

      // split：第一行 主名（左）+ 时间（右），第二行 次要名（左）
      return '<div class="resume-meta-row resume-meta-row--split ' + kind + '">'
        + '<div class="resume-meta-line">'
        + span('leading', main)
        + span('trailing', period)
        + '</div>'
        + '<div class="resume-meta-line">'
        + span('leading', secondary)
        + '</div>'
        + '</div>';
    });
  }

  /**
   * 自动包装头部：将正文开头的 h1 + 紧跟的联系方式 ul
   * 包装为 .resume-header 结构，让模板 CSS 能命中。
   *
   * 匹配格式：
   *   # 姓名 - 职位
   *   - 电话：xxx
   *   - 邮箱：xxx
   */
  autoWrapHeader(html) {
    // 匹配开头 <h1>...</h1>
    const h1Re = /^<h1>(.*?)<\/h1>\s*/;
    const h1Match = html.match(h1Re);
    if (!h1Match) return html;

    const name = h1Match[1];
    let rest = html.substring(h1Match[0].length);

    let headerHtml = '<div class="resume-header">';
    headerHtml += '<img class="resume-photo" src="' + resumePhotoUrl() + '" alt="photo" onerror="this.style.display=\'none\'">';
    headerHtml += `<h1 class="resume-name">${name}</h1>`;

    // 匹配紧跟的 <ul><li>...</li></ul>（联系方式）
    const ulRe = /^<ul>\s*([\s\S]*?)<\/ul>\s*/;
    const ulMatch = rest.match(ulRe);

    if (ulMatch) {
      const ulInner = ulMatch[0];
      // 提取每个 <li> 内容
      const items = [];
      const liRe = /<li>(.*?)<\/li>/g;
      let m;
      while ((m = liRe.exec(ulInner)) !== null) {
        items.push(m[1]);
      }

      if (items.length > 0) {
        headerHtml += '<div class="resume-header-items">';
        items.forEach((text) => {
          const linkMatch = text.match(/^<a href="(.*?)">(.*?)<\/a>$/);
          headerHtml += this.contactItemHtml(
            linkMatch
              ? `<a href="${linkMatch[1]}">${linkMatch[2]}</a>`
              : text,
            linkMatch ? linkMatch[2] : text
          );
        });
        headerHtml += '</div>';
      }

      rest = rest.substring(ulMatch[0].length);
    }

    // 吸纳头部的「元信息行」（如「求职意向」）
    // 生成侧 render_header() 把这类标签行放在「联系方式之后、首个 --- 分隔线之前」，
    // 语义属于头部；不放进来它就会夹在头部底线与分节标题底线之间，显得割裂。
    const meta = this.absorbHeaderMeta(rest);
    if (meta.head) {
      headerHtml += '<div class="resume-header-meta">' + meta.head + '</div>';
      rest = meta.rest;
    }

    headerHtml += '</div>';
    return headerHtml + rest;
  }

  /**
   * 技能块结构语义化：「**核心工具栈**：A、B、C ｜ 能力 ｜ 认证：X」
   * → 「技能名 + 等级点阵」的网格 + 文字行
   *
   * **数据层不变**：等级写在工具项末尾的括号里（如 Python（熟练）），
   * 由 generate_md.py 的 render_skills() 原样带出（它只是用 、 拼起来），
   * 此处只做解析与呈现。约定：
   *   · 等级词：精通 / 熟练 / 熟悉 / 掌握 / 了解 / 入门 / 略懂（熟悉与掌握同为 3 档）
   *   · 也可直接写数字 1-5
   *   · 未标等级的工具项只显示名称
   *   · 括号里不是等级词（如 Figma（协作））→ 原样保留在名称里，不误判
   *
   * 之所以不动生成层：这样**已有简历文件**不用重生成，且手改 .md 也能用。
   *
   * @param {string} html
   * @returns {string} HTML
   */
  resolveSkills(html) {
    const LEVELS = { 精通: 5, 熟练: 4, 熟悉: 3, 掌握: 3, 了解: 2, 入门: 1, 略懂: 1 };
    const MARK = /^([\s\S]*?)[（(]\s*(精通|熟练|熟悉|掌握|了解|入门|略懂|[1-5])\s*[）)]$/;

    return html.replace(/<p><strong>核心工具栈<\/strong>：([\s\S]*?)<\/p>/g, (whole, body) => {
      const parts = body.split(/\s*\|\s*/);
      const tools = (parts.shift() || '').split('、').map((s) => s.trim()).filter(Boolean);
      if (!tools.length) return whole;

      const chips = tools.map((raw) => {
        const m = MARK.exec(raw);
        const name = (m ? m[1] : raw).trim();
        const level = m ? (/\d/.test(m[2]) ? Number(m[2]) : (LEVELS[m[2]] || 0)) : 0;
        let dots = '';
        if (level > 0) {
          let inner = '';
          for (let i = 1; i <= 5; i++) inner += '<i class="' + (i <= level ? 'on' : '') + '"></i>';
          dots = '<span class="resume-skill-level" role="img" aria-label="' + m[2] + '">' + inner + '</span>';
        }
        return '<span class="resume-skill"><span class="resume-skill-name">' + name + '</span>' + dots + '</span>';
      });

      // 其余分段（能力 / 认证）保持文字行，沿用模板的段落样式
      let rest = '';
      parts.forEach((seg) => {
        const s = seg.trim();
        if (s) rest += '<p class="resume-skills-line">' + s + '</p>';
      });

      return '<div class="resume-skills"><div class="resume-skills-chips">'
        + chips.join('') + '</div>' + rest + '</div>';
    });
  }

  /**
   * 联系方式图标（内联 SVG）
   *
   * 用 currentColor + 描边绘制，因此会随各模板自己的颜色走，不需要逐模板定义。
   * 用 SVG 而非 emoji：emoji 在不同系统渲染差异大、且是彩色图形，与简历排版不搭。
   */
  contactIconSvg(kind) {
    const paths = {
      email: '<path d="M2 4.5h12v7H2z"/><path d="M2 5l6 4.5L14 5"/>',
      phone: '<path d="M4.2 2.5h2.1l1.1 2.9-1.5 1.1a9 9 0 0 0 3.6 3.6l1.1-1.5 2.9 1.1v2.1c0 .6-.5 1-1 1A11.6 11.6 0 0 1 3.2 3.5c0-.6.4-1 1-1z"/>',
      web: '<circle cx="8" cy="8" r="5.6"/><path d="M2.4 8h11.2"/><path d="M8 2.4c1.9 1.7 1.9 9.5 0 11.2-1.9-1.7-1.9-9.5 0-11.2z"/>',
      exp: '<rect x="2.2" y="5" width="11.6" height="8" rx="1"/><path d="M6 5V3.2h4V5"/><path d="M2.2 8.4h11.6"/>',
      loc: '<path d="M8 13.8s4.6-4.3 4.6-7.4A4.6 4.6 0 0 0 3.4 6.4c0 3.1 4.6 7.4 4.6 7.4z"/><circle cx="8" cy="6.3" r="1.7"/>'
    };
    const d = paths[kind];
    if (!d) return '';
    return '<svg class="resume-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">' + d + '</svg>';
  }

  /**
   * 按内容识别联系方式类型 → 返回类型标识
   *
   * 不改数据模型：类型从文本本身推断，因此对现有简历（已有 .md）同样生效。
   * 顺序重要：邮箱先判（否则会被 web 的域名规则当网址）。
   */
  classifyContact(text) {
    const t = (text || '').replace(/\u3000/g, ' ').trim();
    if (!t) return '';
    if (/[\w.+-]+@[\w-]+\.[\w.-]+/.test(t)) return 'email';
    if (/^(?:https?:\/\/|www\.)/i.test(t)) return 'web';
    if (/^[\w-]+(?:\.[\w-]{2,})+\/?$/i.test(t) && !/\d{4}/.test(t)) return 'web';
    if (/^[\d\s()+-]{7,}$/.test(t)) return 'phone';
    if (/(?:年)?工作经验|工作年限|经验/.test(t)) return 'exp';
    if (/(?:市|区|省|县)$/.test(t)) return 'loc';
    // 裸城市名（无「市/区」后缀）也识别；未列出的城市只是不加图标，无副作用
    if (/^(?:北京|上海|天津|重庆|广州|深圳|杭州|成都|武汉|南京|西安|苏州|长沙|郑州|青岛|大连|厦门|福州|济南|合肥|昆明|沈阳|无锡|宁波|佛山|东莞|珠海|中山|惠州|石家庄)$/.test(t)) return 'loc';
    return '';
  }

  /**
   * 生成一个联系方式项（带类型类名与图标）
   * @param {string} contentHtml - 展示用 HTML（可能含链接）
   * @param {string} plainText - 分类用纯文本
   * @param {string} [extraClass] - 附加类名（如 no-separator）
   */
  contactItemHtml(contentHtml, plainText, extraClass = '') {
    const kind = this.classifyContact(plainText);
    const cls = ['resume-header-item', kind ? 'resume-header-item--' + kind : '', extraClass].filter(Boolean).join(' ');
    return `<span class="${cls}">${this.contactIconSvg(kind)}${contentHtml}</span>`;
  }

  /**
   * 吸纳头部的元信息行（联系方式之后、首个分隔线之前的独立段落）
   *
   * 判定从严：**仅当该区间只含注释、空白与 <p> 元素时**才吸纳；一旦出现任何结构元素
   * （h2 / ul / div / table …）就当作正文不动。这样既能自动兼容将来头部新增的标签行，
   * 又不会误吞「核心优势」那种以 **标签**：开头的正文段。
   *
   * 找不到 <hr>（分隔线）时不吸纳：没有明确的边界就不能判断哪些段属于头部。
   *
   * @param {string} rest - 已去掉 <h1> 与联系方式后的剩余 HTML
   * @returns {{head: string, rest: string}} head 为可吸纳的头部元信息块（无则空串）
   */
  absorbHeaderMeta(rest) {
    const hr = rest.search(/<hr\s*\/?\s*>/);
    if (hr < 0) return { head: '', rest };

    const head = rest.slice(0, hr);
    // 判定「区间只含段落」：整块移除注释与完整的 <p>...</p> 后应无剩余内容。
    // 注意必须整块移除 <p>...</p>（而非只去标签）——只去标签会把段落文字留下，永远判为不纯。
    const stripped = head.replace(/<!--[\s\S]*?-->/g, '').replace(/<p>[\s\S]*?<\/p>/g, '').trim();
    if (stripped) return { head: '', rest };
    if (!/<p>/.test(head)) return { head: '', rest };

    return { head: head.trim(), rest: rest.slice(hr) };
  }

  /**
   * 解析 Front Matter
   * 参考：FrontMatterParser
   */
  parseFrontMatter(markdown) {
    const match = markdown.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (match) {
      const frontMatter = this.parseYAML(match[1]);
      return { body: match[2], frontMatter };
    }
    return { body: markdown, frontMatter: null };
  }

  /**
   * 简单 YAML 解析
   * 仅支持简历中常用的简单结构
   */
  parseYAML(yaml) {
    const result = {};
    const lines = yaml.split('\n');
    let currentKey = null;
    let inArray = false;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      // 键值对
      const keyMatch = trimmed.match(/^(\w+):\s*(.*)$/);
      if (keyMatch) {
        currentKey = keyMatch[1];
        const value = keyMatch[2].trim();
        
        if (value === '') {
          // 可能是数组或对象
          result[currentKey] = [];
          inArray = true;
        } else if (value.startsWith('[') && value.endsWith(']')) {
          // 内联数组
          result[currentKey] = value.slice(1, -1).split(',').map(s => s.trim().replace(/^["']|["']$/g, ''));
          inArray = false;
        } else {
          result[currentKey] = this.parseYAMLValue(value);
          inArray = false;
        }
        continue;
      }

      // 数组项
      const arrayMatch = trimmed.match(/^-\s*(.+)$/);
      if (arrayMatch && currentKey && inArray) {
        const item = this.parseYAMLValue(arrayMatch[1]);
        if (typeof item === 'object' && item !== null) {
          result[currentKey].push(item);
        } else {
          result[currentKey].push(item);
        }
      }
    }

    return result;
  }

  /**
   * 解析 YAML 值
   */
  parseYAMLValue(value) {
    // 字符串（带引号）
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      return value.slice(1, -1);
    }
    // 布尔值
    if (value === 'true') return true;
    if (value === 'false') return false;
    // 数字
    if (!isNaN(value) && value !== '') return Number(value);
    // 对象（简化处理 {key: value}）
    if (value.startsWith('{') && value.endsWith('}')) {
      const obj = {};
      const inner = value.slice(1, -1);
      const pairs = inner.split(',').map(s => s.trim());
      for (const pair of pairs) {
        const [k, v] = pair.split(':').map(s => s.trim());
        if (k && v !== undefined) {
          obj[k] = this.parseYAMLValue(v);
        }
      }
      return obj;
    }
    return value;
  }

  /**
   * 渲染头部
   * 参考：renderHeader 方法
   */
  renderHeader(frontMatter) {
    let header = '<div class="resume-header">';
    header += '<img class="resume-photo" src="' + resumePhotoUrl() + '" alt="photo" onerror="this.style.display=\'none\'">';

    // 姓名
    if (frontMatter.name) {
      header += `<h1 class="resume-name">${this.escapeHtml(frontMatter.name)}</h1>`;
    }

    // 联系方式
    if (frontMatter.header && Array.isArray(frontMatter.header)) {
      header += '<div class="resume-header-items">';
      frontMatter.header.forEach((item, index) => {
        const hasSeparator = index < frontMatter.header.length - 1 && !item.newLine;
        let content = '';
        
        if (typeof item === 'string') {
          content = this.escapeHtml(item);
        } else if (typeof item === 'object') {
          content = item.link
            ? `<a href="${this.escapeHtml(item.link)}" target="_blank" rel="noopener noreferrer">${this.escapeHtml(item.text || '')}</a>`
            : this.escapeHtml(item.text || '');
        }

        // 分类用纯文本（content 对带链接的项是 <a> 标签）
        const plainText = typeof item === 'string' ? item : ((item && item.text) || '');
        header += this.contactItemHtml(content, plainText, hasSeparator ? '' : 'no-separator');

        if (item && item.newLine) {
          header += '<br>';
        }
      });
      header += '</div>';
    }

    header += '</div>';
    return header;
  }

  /**
   * 处理定义列表
   * 参考：_resolveDeflist 方法
   * 将相邻的定义列表合并
   */
  resolveDeflist(html) {
    // 简单处理：保持原样，markdown-it-deflist 已经处理好了
    return html;
  }

  /**
   * HTML 转义
   */
  escapeHtml(str) {
    if (typeof str !== 'string') return str;
    return str.replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}

// 导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = MarkdownRenderer;
} else {
  window.MarkdownRenderer = MarkdownRenderer;
}