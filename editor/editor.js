/**
 * editor.js - 编辑器核心逻辑
 * 
 * 负责 Monaco Editor 初始化和协调各模块
 */

class MdEditor {
  constructor() {
    this.editor = null;
    this.renderer = null;
    this.pager = null;
    this.toolbar = null;

    // URL 参数：/editor/?company=xx&position=yy
    this.params = new URLSearchParams(window.location.search);
    this.companyName = this.params.get('company') || '';
    this.position = this.params.get('position') || '';
  }

  /**
   * 初始化编辑器
   */
  async init() {
    try {
      // 1. 显示加载状态
      this.showLoading('正在初始化编辑器...');

      // 2. 初始化 Markdown 渲染器
      this.renderer = new MarkdownRenderer();
      this.renderer.init();

      // 3. 初始化智能分页
      const previewContainer = document.getElementById('preview-container');
      this.pager = new SmartPager(previewContainer, {
        onPageChange: (count) => {
          if (this.toolbar) {
            this.toolbar.updatePageCount(count);
          }
        }
      });

      // 4. 初始化 Monaco Editor
      await this.initMonaco();

      // 5. 初始化工具栏
      this.toolbar = new Toolbar(this.editor, this.renderer, this.pager, {
        companyName: this.companyName,
        position: this.position
      });
      this.toolbar.init();

      // 5.5 初始化简历选择器
      await this.initResumeSelector();

      // 6. 加载简历内容
      await this.loadResume();

      // 7. 隐藏加载状态
      this.hideLoading();

      console.log('Markdown 编辑器初始化完成');
    } catch (e) {
      console.error('编辑器初始化失败:', e);
      this.showError('编辑器初始化失败: ' + e.message);
    }
  }

  /**
   * 初始化 Monaco Editor
   */
  async initMonaco() {
    return new Promise((resolve, reject) => {
      // 检查 Monaco 是否已加载
      if (typeof monaco === 'undefined') {
        reject(new Error('Monaco Editor 未加载'));
        return;
      }

      const container = document.getElementById('editor-container');
      if (!container) {
        reject(new Error('找不到编辑器容器'));
        return;
      }

      // 创建编辑器
      this.editor = monaco.editor.create(container, {
        value: '',
        language: 'markdown',
        theme: 'vs-dark',
        fontSize: 14,
        lineNumbers: 'on',
        minimap: { enabled: false },
        wordWrap: 'on',
        automaticLayout: true,
        scrollBeyondLastLine: false,
        folding: true,
        renderLineHighlight: 'line',
        cursorBlinking: 'smooth',
        tabSize: 2,
        fontFamily: 'Consolas, Monaco, monospace',
        // 行号区域配置
        lineNumbersMinChars: 3,
        glyphMargin: false,
        foldingHighlight: false,
        // 确保内容不会被遮挡
        overviewRulerBorder: false,
        hideCursorInOverviewRuler: true,
        overviewRulerLanes: 0
      });

      resolve();
    });
  }

  /** 初始化简历选择器（D2：前端切换不同简历） */
  async initResumeSelector() {
    const select = document.getElementById('select-resume');
    if (!select) return;
    const res = await window.api.listResumes();
    if (!res.success) {
      // 加载失败与「确实没有简历」必须区分，否则服务器异常时用户会以为产物丢了
      const opt = document.createElement('option');
      opt.textContent = '（简历列表加载失败：' + (res.error || '未知错误') + '）';
      opt.disabled = true;
      select.appendChild(opt);
      return;
    }
    if (!res.resumes || !res.resumes.length) {
      const opt = document.createElement('option');
      opt.textContent = '（暂无可编辑简历）';
      opt.disabled = true;
      select.appendChild(opt);
      return;
    }
    res.resumes.forEach((r) => {
      const opt = document.createElement('option');
      opt.value = `${r.company}||${r.position}`;
      opt.textContent = r.title;
      if (r.company === this.companyName && r.position === this.position) {
        opt.selected = true;
      }
      select.appendChild(opt);
    });
    // 未指定则默认选第一份
    if (!this.companyName && res.resumes.length) {
      const first = res.resumes[0];
      this._applyResumeSelection(first.company, first.position);
      select.value = `${first.company}||${first.position}`;
    } else {
      // 已指定（URL 带入）也要同步给 toolbar 与 URL
      this._applyResumeSelection(this.companyName, this.position);
    }
    select.addEventListener('change', async (e) => {
      const [company, position] = e.target.value.split('||');
      // 切换前先保存当前编辑内容；保存失败则回退选择并中止切换，避免未保存内容被静默丢弃
      if (this.toolbar && !this.toolbar.saved) {
        const ok = await this.toolbar.save();
        if (!ok) {
          if (this.companyName && this.position) {
            e.target.value = `${this.companyName}||${this.position}`;
          }
          return;
        }
      }
      this._applyResumeSelection(company, position);
      await this.loadResume();
    });
  }

  /** 应用当前简历选择（同步状态 + toolbar 选项 + URL） */
  _applyResumeSelection(company, position) {
    this.companyName = company;
    this.position = position;
    if (this.toolbar) {
      this.toolbar.options.companyName = company;
      this.toolbar.options.position = position;
    }
    window.history.replaceState(
      null, '',
      `?company=${encodeURIComponent(company)}&position=${encodeURIComponent(position)}`
    );
  }

  /** 加载简历内容 */
  async loadResume() {
    if (!this.companyName || !this.position) {
      if (this.toolbar) this.toolbar.loadFailed = true;
      this.editor.setValue('# 请先在顶部选择一份简历\n');
      if (this.toolbar) this.toolbar.updateStatus();
      return;
    }
    this.showLoading('正在加载简历...');

    const result = await window.api.getMarkdown(this.companyName, this.position);

    if (result.success) {
      this.editor.setValue(result.markdown);
      this.toolbar.saved = true;
      this.toolbar.loadFailed = false;
      this.toolbar.dirty = false;
      this.toolbar.updateStatus();
      this.toolbar.renderPreview();
    } else {
      // 加载失败：编辑器内改为占位文本，并标记 loadFailed 让 save() 拒绝落盘
      // （否则切换简历的自动保存会把这段占位文本覆盖到原文件上）
      this.toolbar.loadFailed = true;
      this.editor.setValue('# 简历内容\n\n简历内容加载失败，为防覆盖原文件已禁用保存；请刷新页面或检查服务后重试。\n\n');
      this.toolbar.updateStatus();
      this.toolbar.showToast('加载失败: ' + (result.error || '未知错误'));
    }
    this.hideLoading();
  }

  /**
   * 显示加载状态
   */
  showLoading(message) {
    let loader = document.getElementById('loading-overlay');
    if (!loader) {
      loader = document.createElement('div');
      loader.id = 'loading-overlay';
      loader.className = 'fixed inset-0 bg-white bg-opacity-80 flex items-center justify-center z-50';
      loader.innerHTML = `
        <div class="text-center">
          <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p id="loading-message" class="text-gray-600"></p>
        </div>
      `;
      document.body.appendChild(loader);
    }
    
    const messageEl = loader.querySelector('#loading-message');
    if (messageEl) messageEl.textContent = message;
    loader.style.display = 'flex';
  }

  /**
   * 隐藏加载状态
   */
  hideLoading() {
    const loader = document.getElementById('loading-overlay');
    if (loader) {
      loader.style.display = 'none';
    }
  }

  /**
   * 显示错误
   */
  showError(message) {
    this.hideLoading();
    
    const container = document.getElementById('editor-container');
    if (container) {
      container.innerHTML = `
        <div class="flex items-center justify-center h-full">
          <div class="text-center text-red-600">
            <svg class="w-16 h-16 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
            </svg>
            <p class="text-lg font-medium">${message}</p>
            <button onclick="location.reload()" class="mt-4 px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700">
              重新加载
            </button>
          </div>
        </div>
      `;
    }
  }
}

// 导出 MdEditor 类（不自动初始化，由 index.html 中的 Monaco 回调初始化）
if (typeof module !== 'undefined' && module.exports) {
  module.exports = MdEditor;
} else {
  window.MdEditor = MdEditor;
}
