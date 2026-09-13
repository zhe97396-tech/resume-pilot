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
   * @returns {string} HTML
   */
  render(markdown) {
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

    // 4. 渲染头部（姓名、联系方式）
    if (frontMatter) {
      html = this.renderHeader(frontMatter) + html;
    } else {
      // 无 front-matter 时自动提取 # 姓名 + 联系方式列表 → .resume-header
      html = this.autoWrapHeader(html);
    }

    return html;
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
          // 检测是否为链接（邮箱、网址等）
          const linkMatch = text.match(/^<a href="(.*?)">(.*?)<\/a>$/);
          if (linkMatch) {
            headerHtml += `<span class="resume-header-item"><a href="${linkMatch[1]}">${linkMatch[2]}</a></span>`;
          } else {
            headerHtml += `<span class="resume-header-item">${text}</span>`;
          }
        });
        headerHtml += '</div>';
      }

      rest = rest.substring(ulMatch[0].length);
    }

    headerHtml += '</div>';
    return headerHtml + rest;
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

        header += `<span class="resume-header-item ${hasSeparator ? '' : 'no-separator'}">${content}</span>`;

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