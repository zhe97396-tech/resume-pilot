/**
 * toolbar.js - 工具栏逻辑
 * 
 * 借鉴：Oh My CV - site/src/components/editor/toolbar/*
 * 源码：https://github.com/Renovamen/oh-my-cv/tree/main/site/src/components/editor/toolbar
 * 
 * 功能对应：
 * - Margins.vue → 页边距调整
 * - FontSize.vue → 字号调整
 * - LineHeight.vue → 行高调整
 * - Paper.vue → 纸张大小
 * - ThemeColor.vue → 颜色设置
 * - style.ts → 样式状态管理
 */

class Toolbar {
  /**
   * @param {Object} editor - Monaco Editor 实例
   * @param {Object} renderer - MarkdownRenderer 实例
   * @param {Object} pager - SmartPager 实例
   * @param {Object} options - 配置选项
   */
  constructor(editor, renderer, pager, options = {}) {
    this.editor = editor;
    this.renderer = renderer;
    this.pager = pager;
    this.options = options;
    this.saved = true;
    // 当前简历加载失败（编辑器里是占位文本）：置 true 后 save() 拒绝落盘，
    // 否则点保存或切换简历时的自动保存会把占位文本覆盖到真实文件上。
    this.loadFailed = false;
    this.debounceTimer = null;
    this.rafId = null;       // requestAnimationFrame ID，用于批处理滑块更新
    this.cssEditor = null;
    this.originalCss = '';
    this.suppressCssApply = false;  // 同步模板 CSS 到 CSS 编辑器时，抑制“自定义样式”即时生效
    this.fitMode = 'width';  // 预览适应模式：'width' | 'height' | null（手动缩放时置 null）

    // 样式配置（参考 Oh My CV 的 style store）
    // 参考：site/src/composables/stores/style.ts + site/src/composables/constant/variables/default.ts
    // 默认值对齐 Oh My CV DEFAULT_STYLES
    // 参考：site/src/composables/constant/variables/default.ts
    this.styleConfig = {
      template: 'official',
      fontFamily: '',
      fontSize: 15,
      marginV: 50,     // 垂直页边距（上=marginV，下=marginV-10）
      marginH: 45,     // 水平页边距
      lineHeight: 1.3,
      paragraphSpacing: 5,
      paperSize: 'A4',
      primaryColor: '#000000',
      accentColor: '#000000',
      scale: 100
    };

    // 纸张尺寸定义
    // 参考：site/src/composables/constant 中的 PAPER
    this.paperSizes = {
      'A4': { width: 210, height: 297 },
      'US Letter': { width: 216, height: 279 }
    };

    // 预览容器
    this.previewContainer = document.getElementById('preview-container');
    this.previewWrapper = document.getElementById('preview-wrapper');
  }

  /**
   * 初始化工具栏
   */
  init() {
    this.initActions();
    this.initTemplate();
    this.initTheme();
    this.initCssEditor();
    this.initFont();
    this.initMargins();
    this.initLineHeight();
    this.initParagraphSpacing();
    this.initPaper();
    this.initColors();
    this.initPhoto();
    this.initZoom();
    this.initEditorSync();
    this.initResizeHandles();

    // 应用初始样式
    this.applyStyle();

    // 同步分页参数（styleConfig → pager）
    this.pager.updateOptions({
      pageSize: this.paperSizes[this.styleConfig.paperSize],
      margins: this.getMargins()
    });

    // 初始化自适应（默认适应宽度，并在容器/窗口尺寸变化时重算）
    this.initAdaptiveFit();
  }

  /**
   * 自适应预览：初始适应宽度 + 容器/窗口尺寸变化时自动重算
   */
  initAdaptiveFit() {
    // 初始适应（布局稳定后再算一次）
    requestAnimationFrame(() => this.fitWidth());
    setTimeout(() => this.fitWidth(), 300);

    // 预览容器尺寸变化 → 处于适应模式时重算
    if (this.previewWrapper && typeof ResizeObserver !== 'undefined') {
      let timer = null;
      this._fitObserver = new ResizeObserver(() => {
        if (this.fitMode !== 'width') return;
        clearTimeout(timer);
        timer = setTimeout(() => this.fitWidth(), 120);
      });
      this._fitObserver.observe(this.previewWrapper);
    }

    // 窗口尺寸变化
    window.addEventListener('resize', () => {
      if (this.fitMode !== 'width') return;
      clearTimeout(this._fitTimer);
      this._fitTimer = setTimeout(() => this.fitWidth(), 120);
    });
  }

  /**
   * 初始化主题切换
   */
  initTheme() {
    const btnTheme = document.getElementById('btn-theme');
    if (!btnTheme) return;

    // 从 localStorage 读取主题
    const savedTheme = localStorage.getItem('editor-theme') || 'dark';
    this.setTheme(savedTheme);

    btnTheme.addEventListener('click', () => {
      const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
      const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
      this.setTheme(newTheme);
      localStorage.setItem('editor-theme', newTheme);
    });
  }

  setTheme(theme) {
    const root = document.documentElement;
    root.setAttribute('data-theme', theme);

    const iconDark = document.getElementById('theme-icon-dark');
    const iconLight = document.getElementById('theme-icon-light');

    if (theme === 'light') {
      root.style.setProperty('--bg-editor', '#ffffff');
      root.style.setProperty('--bg-toolbar', '#f5f5f5');
      root.style.setProperty('--bg-statusbar', '#f0f0f0');
      root.style.setProperty('--bg-preview-pane', '#e8e8e8');
      root.style.setProperty('--text-primary', '#1a1a1a');
      root.style.setProperty('--text-secondary', '#666666');
      root.style.setProperty('--text-muted', '#999999');
      root.style.setProperty('--border', '#e0e0e0');

      if (iconDark) iconDark.style.display = 'none';
      if (iconLight) iconLight.style.display = 'block';

      // 更新 Monaco 编辑器主题
      if (this.editor && typeof monaco !== 'undefined') {
        monaco.editor.setTheme('vs');
      }
      if (this.cssEditor && typeof monaco !== 'undefined') {
        monaco.editor.setTheme('vs');
      }
    } else {
      root.style.setProperty('--bg-editor', '#1a1b1e');
      root.style.setProperty('--bg-toolbar', '#242528');
      root.style.setProperty('--bg-statusbar', '#2a2b2f');
      root.style.setProperty('--bg-preview-pane', '#3a3b3f');
      root.style.setProperty('--text-primary', '#e4e4e7');
      root.style.setProperty('--text-secondary', '#a1a1aa');
      root.style.setProperty('--text-muted', '#71717a');
      root.style.setProperty('--border', '#3f3f46');

      if (iconDark) iconDark.style.display = 'block';
      if (iconLight) iconLight.style.display = 'none';

      // 更新 Monaco 编辑器主题
      if (this.editor && typeof monaco !== 'undefined') {
        monaco.editor.setTheme('vs-dark');
      }
      if (this.cssEditor && typeof monaco !== 'undefined') {
        monaco.editor.setTheme('vs-dark');
      }
    }
  }

  /**
   * 初始化分割线拖拽
   * 只有编辑器/预览区之间的分割线可拖拽
   */
  initResizeHandles() {
    const editorPane = document.querySelector('.editor-pane');
    const previewPane = document.querySelector('.preview-pane');

    // 只有第一个分割线（编辑器/预览之间）可拖拽
    const handle = document.querySelector('.resize-handle');

    if (!handle || !editorPane || !previewPane) return;

    let isDragging = false;
    let startX = 0;

    handle.addEventListener('mousedown', (e) => {
      isDragging = true;
      startX = e.clientX;
      handle.classList.add('dragging');
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;

      const deltaX = e.clientX - startX;
      const settingsWidth = 240 + 6; // settings-pane + resize-handle
      const availableWidth = editorPane.parentElement.clientWidth - settingsWidth - 6; // minus first handle
      const newEditorWidth = editorPane.offsetWidth + deltaX;
      const minWidth = 300;
      const maxWidth = availableWidth - 300; // preview also needs min 300

      if (newEditorWidth >= minWidth && newEditorWidth <= maxWidth) {
        editorPane.style.flex = `0 0 ${newEditorWidth}px`;
        previewPane.style.flex = '1';
        startX = e.clientX;
      }
    });

    document.addEventListener('mouseup', () => {
      if (isDragging) {
        isDragging = false;
        handle.classList.remove('dragging');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    });
  }

  /**
   * 编辑器同步
   */
  initEditorSync() {
    if (!this.editor) return;

    // 编辑器变化时标记未保存 + 实时预览
    this.editor.onDidChangeModelContent(() => {
      this.saved = false;
      this.updateStatus();
      
      // 防抖渲染
      clearTimeout(this.debounceTimer);
      this.debounceTimer = setTimeout(() => {
        this.renderPreview();
      }, 300);
    });
  }

  /**
   * 渲染预览
   */
  renderPreview() {
    if (!this.editor || !this.renderer || !this.pager) return;

    // 先清空容器，避免叠层
    this.previewContainer.innerHTML = '';

    const markdown = this.editor.getValue();
    const html = this.renderer.render(markdown);
    this.pager.render(html);
    this.updateWordCount();
  }

  /**
   * 调度分页重算（仅几何属性变化时需要）
   *
   * 参考 Oh My CV：CSS 变量（行高、段距、颜色）即时生效，浏览器原地重排；
   * 只有边距、字号、纸张变化才需要重建页面分页。
   */
  scheduleRecalculate() {
    if (this.rafId) return;
    this.rafId = requestAnimationFrame(() => {
      this.rafId = null;
      this.pager.updateOptions({ margins: this.getMargins() });
      this.pager.recalculate();
    });
  }
  initActions() {
    const btnSave = document.getElementById('btn-save');
    const btnExport = document.getElementById('btn-export');
    const btnExportImage = document.getElementById('btn-export-image');

    if (btnSave) {
      btnSave.addEventListener('click', () => this.save());
    }
    if (btnExport) {
      btnExport.addEventListener('click', () => this.exportPdf());
    }
    if (btnExportImage) {
      btnExportImage.addEventListener('click', () => this.exportImage());
    }
  }

  // === 模板设置 ===
  initTemplate() {
    const select = document.getElementById('select-template');
    if (!select) return;

    select.addEventListener('change', (e) => {
      this.styleConfig.template = e.target.value;
      this.applyTemplate();
    });
  }

  // === CSS 编辑器 ===
  initCssEditor() {
    const tabMarkdown = document.getElementById('tab-markdown');
    const tabCss = document.getElementById('tab-css');
    const editorContainer = document.getElementById('editor-container');
    const cssContainer = document.getElementById('css-editor-container');

    if (tabMarkdown) {
      tabMarkdown.addEventListener('click', () => this.switchToMarkdown());
    }

    if (tabCss) {
      tabCss.addEventListener('click', () => this.switchToCss());
    }
  }

  switchToMarkdown() {
    const tabMarkdown = document.getElementById('tab-markdown');
    const tabCss = document.getElementById('tab-css');
    const editorContainer = document.getElementById('editor-container');
    const cssContainer = document.getElementById('css-editor-container');

    if (tabMarkdown) tabMarkdown.classList.add('active');
    if (tabCss) tabCss.classList.remove('active');
    if (editorContainer) editorContainer.style.display = 'block';
    if (cssContainer) cssContainer.style.display = 'none';
  }

  async switchToCss() {
    const tabMarkdown = document.getElementById('tab-markdown');
    const tabCss = document.getElementById('tab-css');
    const editorContainer = document.getElementById('editor-container');
    const cssContainer = document.getElementById('css-editor-container');

    if (tabMarkdown) tabMarkdown.classList.remove('active');
    if (tabCss) tabCss.classList.add('active');
    if (editorContainer) editorContainer.style.display = 'none';
    if (cssContainer) cssContainer.style.display = 'block';

    // 创建 CSS 编辑器
    if (!this.cssEditor && cssContainer && typeof monaco !== 'undefined') {
      // 加载当前模板的 CSS
      const cssUrl = `/editor/templates/${this.styleConfig.template}.css`;
      try {
        const response = await fetch(cssUrl);
        this.originalCss = await response.text();
      } catch (e) {
        this.originalCss = '/* 无法加载 CSS */';
      }

      // 使用当前主题
      const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
      const editorTheme = currentTheme === 'light' ? 'vs' : 'vs-dark';

      this.cssEditor = monaco.editor.create(cssContainer, {
        value: this.originalCss,
        language: 'css',
        theme: editorTheme,
        fontSize: 14,
        minimap: { enabled: false },
        wordWrap: 'on',
        automaticLayout: true,
        scrollBeyondLastLine: false,
        lineNumbers: 'on'
      });

      // CSS 编辑器内容变化时实时应用
      this.cssEditor.onDidChangeModelContent(() => {
        this.applyCustomCssFromEditor();
      });
    } else if (this.cssEditor) {
      // 刷新布局
      this.cssEditor.layout();
    }
  }

  applyCustomCssFromEditor() {
    // 同步模板 CSS 到编辑器时不应把“自定义样式”写回预览
    if (!this.cssEditor || this.suppressCssApply) return;

    const customCss = this.cssEditor.getValue();

    // 移除旧的模板样式
    const oldStyle = document.getElementById('template-style');
    if (oldStyle) oldStyle.remove();

    // 创建新的 style 标签
    const style = document.createElement('style');
    style.id = 'template-style';
    style.textContent = customCss;
    document.head.appendChild(style);
  }

  async resetCss() {
    // 重新加载原始 CSS
    const cssUrl = `/editor/templates/${this.styleConfig.template}.css`;
    try {
      const response = await fetch(cssUrl);
      const originalCss = await response.text();
      if (this.cssEditor) {
        this.cssEditor.setValue(originalCss);
      }
      this.showToast('已重置为默认 CSS');
    } catch (e) {
      this.showToast('重置失败');
    }
  }

  // === 字体设置 ===
  initFont() {
    const fontSelect = document.getElementById('select-font');
    const sizeSelect = document.getElementById('select-font-size');

    if (fontSelect) {
      fontSelect.addEventListener('change', (e) => {
        this.styleConfig.fontFamily = e.target.value;
        this.applyStyle();
        this.scheduleRecalculate();  // 字体影响元素宽高，需重建分页
      });
    }

    if (sizeSelect) {
      sizeSelect.addEventListener('change', (e) => {
        this.styleConfig.fontSize = parseInt(e.target.value);
        this.applyStyle();
        this.scheduleRecalculate();  // 字号影响元素宽高，需重建分页
      });
    }
  }

  // === 页边距设置（参考 Oh My CV：垂直/水平两个滑块） ===
  initMargins() {
    const sliderV = document.getElementById('margin-v');
    const valueVEl = document.getElementById('margin-v-value');
    const sliderH = document.getElementById('margin-h');
    const valueHEl = document.getElementById('margin-h-value');

    // 边距：input 只改 CSS（丝滑拖动），change 时一次性重建分页
    if (sliderV) {
      sliderV.addEventListener('input', (e) => {
        this.styleConfig.marginV = parseInt(e.target.value);
        if (valueVEl) valueVEl.textContent = this.styleConfig.marginV;
        this.applyStyle();
        // input 不重建分页——边距 CSS 即时生效，浏览器原地重排
      });
      sliderV.addEventListener('change', (e) => {
        this.styleConfig.marginV = parseInt(e.target.value);
        this.pager.updateOptions({ margins: this.getMargins() });
        this.pager.recalculate();
      });
    }

    if (sliderH) {
      sliderH.addEventListener('input', (e) => {
        this.styleConfig.marginH = parseInt(e.target.value);
        if (valueHEl) valueHEl.textContent = this.styleConfig.marginH;
        this.applyStyle();
      });
      sliderH.addEventListener('change', (e) => {
        this.styleConfig.marginH = parseInt(e.target.value);
        this.pager.updateOptions({ margins: this.getMargins() });
        this.pager.recalculate();
      });
    }
  }

  // === 行高设置 ===
  initLineHeight() {
    const slider = document.getElementById('line-height');
    const valueEl = document.getElementById('line-height-value');
    if (!slider) return;

    // 行高：只改 CSS（浏览器原地重排，无需重建 DOM）
    slider.addEventListener('input', (e) => {
      const value = parseFloat(e.target.value);
      this.styleConfig.lineHeight = value;
      if (valueEl) valueEl.textContent = value.toFixed(1);
      this.applyStyle();
      // 不调用 recalculate()——行高变化极少导致分页位置改变
    });
  }

  // === 段间距设置 ===
  initParagraphSpacing() {
    const slider = document.getElementById('paragraph-spacing');
    const valueEl = document.getElementById('paragraph-spacing-value');
    if (!slider) return;

    // 段距：只改 CSS（浏览器原地重排，无需重建 DOM）
    slider.addEventListener('input', (e) => {
      const value = parseInt(e.target.value);
      this.styleConfig.paragraphSpacing = value;
      if (valueEl) valueEl.textContent = value;
      this.applyStyle();
      // 不调用 recalculate()——段距变化极少导致分页位置改变
    });
  }

  // === 纸张大小 ===
  initPaper() {
    const select = document.getElementById('select-paper');
    if (!select) return;

    select.addEventListener('change', (e) => {
      this.styleConfig.paperSize = e.target.value;
      this.applyStyle();
      this.pager.updateOptions({ pageSize: this.paperSizes[e.target.value] });
      this.pager.recalculate();
    });
  }

  // === 颜色设置 ===
  initColors() {
    const primaryInput = document.getElementById('color-primary');
    const accentInput = document.getElementById('color-accent');

    if (primaryInput) {
      primaryInput.addEventListener('input', (e) => {
        this.styleConfig.primaryColor = e.target.value;
        this.applyStyle();
        this.updateColorPresets('primary', e.target.value);
      });
    }

    if (accentInput) {
      accentInput.addEventListener('input', (e) => {
        this.styleConfig.accentColor = e.target.value;
        this.applyStyle();
        this.updateColorPresets('accent', e.target.value);
      });
    }

    // 颜色预设点击
    this.initColorPresets('primary', primaryInput);
    this.initColorPresets('accent', accentInput);
  }

  initColorPresets(type, inputEl) {
    const container = document.getElementById(`${type}-presets`);
    if (!container) return;

    const presets = container.querySelectorAll('.color-preset');
    presets.forEach(preset => {
      preset.addEventListener('click', () => {
        const color = preset.dataset.color;
        if (inputEl) {
          inputEl.value = color;
        }
        if (type === 'primary') {
          this.styleConfig.primaryColor = color;
        } else {
          this.styleConfig.accentColor = color;
        }
        this.applyStyle();
        this.updateColorPresets(type, color);
      });
    });
  }

  updateColorPresets(type, activeColor) {
    const container = document.getElementById(`${type}-presets`);
    if (!container) return;

    const presets = container.querySelectorAll('.color-preset');
    presets.forEach(preset => {
      if (preset.dataset.color === activeColor) {
        preset.classList.add('active');
      } else {
        preset.classList.remove('active');
      }
    });
  }

  // === 照片 ===
  // 全站只有一张照片：config/photo.jpg。「换照片」= 直接替换它（服务端先备份旧图）。
  // 也支持直接把新文件覆盖到 config/photo.jpg（刷新即生效），或用 scripts/set_photo.py。
  initPhoto() {
    const checkbox = document.getElementById('show-photo');
    if (checkbox) {
      // 初始化：默认显示
      document.documentElement.style.setProperty('--photo-display', 'block');
      checkbox.addEventListener('change', (e) => {
        document.documentElement.style.setProperty(
          '--photo-display',
          e.target.checked ? 'block' : 'none'
        );
      });
    }

    const changeBtn = document.getElementById('btn-change-photo');
    const fileInput = document.getElementById('photo-file');
    if (changeBtn && fileInput) {
      changeBtn.addEventListener('click', () => fileInput.click());
    }
    if (fileInput) {
      fileInput.addEventListener('change', (e) => {
        const f = e.target.files && e.target.files[0];
        if (f) this.uploadPhoto(f);
        fileInput.value = '';
      });
    }
  }

  /** 换照片：替换 config/photo.jpg（服务端先备份旧图到 output/_backup/photo-prev.jpg） */
  async uploadPhoto(file) {
    if (file.type && !file.type.startsWith('image/')) {
      this.showToast('请选择图片文件（当前类型：' + file.type + '）');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      this.showToast('图片过大（上限 10MB，当前 ' + (file.size / 1024 / 1024).toFixed(1) + 'MB）');
      return;
    }
    try {
      const res = await fetch('/api/photo', {
        method: 'POST',
        headers: { 'Content-Type': file.type || 'image/jpeg' },
        body: file
      });
      const data = await res.json();
      if (data.success) {
        this.showToast(data.backup ? '照片已替换（旧图备份在 output/_backup/）' : '照片已保存');
        this.renderPreview();   // 服务端 ETag 已变，浏览器会重新取到新图
      } else {
        this.showToast('换照片失败: ' + (data.error || '未知错误'));
      }
    } catch (err) {
      this.showToast('换照片失败: ' + err.message);
    }
  }

  // === 缩放控制 ===
  initZoom() {
    const scaleSelect = document.getElementById('select-scale');
    const fitWidthBtn = document.getElementById('btn-fit-width');
    const fitHeightBtn = document.getElementById('btn-fit-height');

    if (scaleSelect) {
      scaleSelect.addEventListener('change', (e) => {
        this.styleConfig.scale = parseInt(e.target.value);
        this.fitMode = null;  // 手动缩放，退出适应模式
        this.applyScale();
      });
    }

    if (fitWidthBtn) {
      fitWidthBtn.addEventListener('click', () => this.fitWidth());
    }

    if (fitHeightBtn) {
      fitHeightBtn.addEventListener('click', () => this.fitHeight());
    }
  }

  /**
   * 应用样式配置（通过 CSS 变量）
   */
  applyStyle() {
    const root = document.documentElement;

    // 字体（空值=跟随模板，不设置内联变量，让模板 CSS 的 font-family 生效）
    if (this.styleConfig.fontFamily) {
      root.style.setProperty('--resume-font-family', `'${this.styleConfig.fontFamily}', sans-serif`);
    } else {
      root.style.removeProperty('--resume-font-family');
    }
    root.style.setProperty('--resume-font-size', `${this.styleConfig.fontSize}px`);
    root.style.setProperty('--resume-line-height', this.styleConfig.lineHeight);

    // 段间距
    root.style.setProperty('--resume-paragraph-spacing', `${this.styleConfig.paragraphSpacing}px`);

    // 页边距（参考 Oh My CV：非对称底部边距 marginV - 10）
    const margins = this.getMargins();
    root.style.setProperty('--resume-margin-top', `${margins.top}px`);
    root.style.setProperty('--resume-margin-bottom', `${margins.bottom}px`);
    root.style.setProperty('--resume-margin-left', `${margins.left}px`);
    root.style.setProperty('--resume-margin-right', `${margins.right}px`);

    // 颜色（同时设置 resume 和 template 变量，兼容模板 CSS + styles.css）
    root.style.setProperty('--resume-primary-color', this.styleConfig.primaryColor);
    root.style.setProperty('--resume-accent-color', this.styleConfig.accentColor);
    root.style.setProperty('--template-primary', this.styleConfig.primaryColor);
    root.style.setProperty('--template-accent', this.styleConfig.accentColor);

    // 纸张大小
    const paper = this.paperSizes[this.styleConfig.paperSize];
    root.style.setProperty('--resume-page-width', `${paper.width}mm`);
    root.style.setProperty('--resume-page-height', `${paper.height}mm`);
  }

  /**
   * 应用模板（加载新 CSS 后同步模板默认颜色到 toolbar）
   *
   * 关键：切换模板前先清除 --template-* 内联样式，
   * 让新 CSS 文件的 :root 变量通过 cascade 生效，
   * 读取后再同步回 styleConfig 和 color picker。
   */
  applyTemplate() {
    const oldStyle = document.getElementById('template-style');
    const prevHref = oldStyle ? oldStyle.getAttribute('href') : null;
    if (oldStyle) oldStyle.remove();

    // 清除 toolbar 此前写入的内联颜色，让新模板的 :root 变量生效
    const root = document.documentElement;
    root.style.removeProperty('--template-primary');
    root.style.removeProperty('--template-accent');

    const link = document.createElement('link');
    link.id = 'template-style';
    link.rel = 'stylesheet';
    link.href = `/editor/templates/${this.styleConfig.template}.css`;
    link.onload = () => {
      // 从新模板 CSS（cascade）读取默认颜色
      const cs = getComputedStyle(root);
      const tp = cs.getPropertyValue('--template-primary').trim();
      const ta = cs.getPropertyValue('--template-accent').trim();
      if (tp) this.styleConfig.primaryColor = tp;
      if (ta) this.styleConfig.accentColor = ta;

      // 同步 UI：颜色选择器 + 预设高亮 + CSS 变量
      const primaryInput = document.getElementById('color-primary');
      const accentInput = document.getElementById('color-accent');
      if (primaryInput) primaryInput.value = this.styleConfig.primaryColor;
      if (accentInput) accentInput.value = this.styleConfig.accentColor;
      this.updateColorPresets('primary', this.styleConfig.primaryColor);
      this.updateColorPresets('accent', this.styleConfig.accentColor);

      this.applyStyle();
      this.pager.recalculate();

      // CSS 页签已打开时同步为新模板的 CSS；
      // 否则在 CSS 编辑器里敲任意一个字符都会用旧模板的 CSS 覆盖预览
      if (this.cssEditor) {
        fetch(`/editor/templates/${this.styleConfig.template}.css`)
          .then((r) => r.text())
          .then((css) => {
            this.originalCss = css;
            this.suppressCssApply = true;
            this.cssEditor.setValue(css);
            this.suppressCssApply = false;
          })
          .catch(() => {});
      }
    };
    // 模板文件缺失时回滚，避免预览静默只剩 _base.css
    link.onerror = () => {
      this.showToast('模板加载失败：' + this.styleConfig.template + '.css 不存在（已保留原模板）');
      if (!prevHref) return;
      link.remove();
      const rollback = document.createElement('link');
      rollback.id = 'template-style';
      rollback.rel = 'stylesheet';
      rollback.href = prevHref;
      document.head.appendChild(rollback);
    };
    document.head.appendChild(link);
  }

  /**
   * 应用缩放
   */
  applyScale() {
    if (!this.previewContainer) return;
    this.previewContainer.style.transform = `scale(${this.styleConfig.scale / 100})`;
    this.previewContainer.style.transformOrigin = 'top center';
  }

  /**
   * 把当前缩放值同步到下拉框。
   * 自适应算出的值往往不在预设档位里（如 118%），直接写 value 会让下拉框显示空白；
   * 这里为非预设值动态插入一项，保证“下拉显示 = 实际缩放”。
   */
  syncScaleSelect() {
    const sel = document.getElementById('select-scale');
    if (!sel) return;
    const value = String(this.styleConfig.scale);
    const presets = Array.from(sel.options).filter((o) => !o.dataset.dynamic).map((o) => o.value);
    const dynamic = sel.querySelector('option[data-dynamic]');
    if (dynamic) dynamic.remove();
    if (!presets.includes(value)) {
      const opt = document.createElement('option');
      opt.value = value;
      opt.textContent = value + '%（自适应）';
      opt.dataset.dynamic = '1';
      sel.appendChild(opt);
    }
    sel.value = value;
  }

  /**
   * 适应宽度
   */
  fitWidth() {
    if (!this.previewWrapper) return;
    this.fitMode = 'width';
    const containerWidth = this.previewWrapper.clientWidth - 40;
    const pageWidth = this.getPageWidthPx();
    this.styleConfig.scale = Math.round(containerWidth / pageWidth * 100);
    this.styleConfig.scale = Math.min(150, Math.max(30, this.styleConfig.scale));
    
    this.syncScaleSelect();
    
    this.applyScale();
  }

  /**
   * 适应高度
   */
  fitHeight() {
    if (!this.previewWrapper) return;
    this.fitMode = 'height';
    const containerHeight = this.previewWrapper.clientHeight - 40;
    const pageHeight = this.getPageHeightPx();
    this.styleConfig.scale = Math.round(containerHeight / pageHeight * 100);
    this.styleConfig.scale = Math.min(150, Math.max(30, this.styleConfig.scale));
    
    this.syncScaleSelect();
    
    this.applyScale();
  }

  getPageWidthPx() {
    const paper = this.paperSizes[this.styleConfig.paperSize];
    return paper.width * this.mmToPx;
  }

  getPageHeightPx() {
    const paper = this.paperSizes[this.styleConfig.paperSize];
    return paper.height * this.mmToPx;
  }

  getMargins() {
    // 参考 Oh My CV：底部边距比顶部少10px，增加可用内容区域
    return {
      top: this.styleConfig.marginV,
      bottom: Math.max(this.styleConfig.marginV - 10, 10),
      left: this.styleConfig.marginH,
      right: this.styleConfig.marginH
    };
  }

  get mmToPx() {
    return 3.78;
  }

  /** 保存 Markdown
   *  返回 true = 已保存或无需保存（调用方可安全继续）；false = 保存失败（调用方应中止后续动作）
   */
  async save() {
    if (!this.editor) return true;

    // 加载失败时编辑器内是占位文本，落盘会覆盖原文件 → 直接拒绝
    if (this.loadFailed) {
      this.showToast('当前简历加载失败，已阻止保存以防覆盖原文件');
      return true;
    }

    const markdown = this.editor.getValue();
    const result = await window.api.saveMarkdown(this.options.companyName, this.options.position, markdown);

    if (result.success) {
      this.saved = true;
      this.updateStatus();
      this.showToast('已保存');
      return true;
    }
    this.showToast('保存失败: ' + (result.error || '未知错误'));
    return false;
  }

  /**
   * 导出 PDF
   */
  async exportPdf() {
    // 重置缩放为 100%（打印样式会用 transform:none 覆盖，但以防万一）
    const prevScale = this.styleConfig.scale;
    this.styleConfig.scale = 100;
    this.applyScale();

    // 使用浏览器打印
    const title = document.title;
    document.title = `简历_${this.options.companyName || ''}_${this.options.position || ''}`;
    window.print();
    document.title = title;

    // 恢复缩放
    this.styleConfig.scale = prevScale;
    this.applyScale();

    this.showToast('已打开打印对话框，请在对话框中选择「另存为 PDF」');
  }

  /**
   * 导出长图 PNG
   * 将所有 .resume-page 紧密拼接为一张长图
   * 关键：首页保留 padding-top，末页保留 padding-bottom，
   * 中间页去掉上下 padding，消除分页拼接处的空白
   */
  async exportImage() {
    // 检查 dom-to-image-more 是否可用
    if (typeof domtoimage === 'undefined') {
      this.showToast('图片导出库未加载，请检查网络');
      return;
    }

    const container = document.getElementById('preview-container');
    const pagesContainer = container.querySelector('.resume-pages');
    const pages = container.querySelectorAll('.resume-page');
    if (!pagesContainer || !pages.length) {
      this.showToast('没有可导出的内容');
      return;
    }

    this.showToast('正在生成图片...');

    // 重置缩放为 100%
    const prevScale = this.styleConfig.scale;
    this.styleConfig.scale = 100;
    this.applyScale();

    // 注入导出样式：
    // 1. min-height: 0 — 去掉每页的最小高度，让页面按内容收缩
    // 2. gap: 0 — 去掉页间距
    // 3. box-shadow/border-radius — 去掉装饰
    // 4. 中间页 padding: 0 — 消除拼接处空白（首页保留 top，末页保留 bottom）
    const exportStyle = document.createElement('style');
    exportStyle.id = 'export-image-override';
    exportStyle.textContent = `
      .resume-page { min-height: 0 !important; box-shadow: none !important; border-radius: 0 !important; margin-bottom: 0 !important; }
      .resume-pages { gap: 0 !important; padding: 0 !important; }
      /* 中间页去掉上下 padding，消除拼接空白 */
      .resume-page:not(:first-child):not(:last-child) { padding-top: 0 !important; padding-bottom: 0 !important; }
      /* 首页去掉底部 padding（与下一页紧密拼接） */
      .resume-page:first-child:not(:only-child) { padding-bottom: 0 !important; }
      /* 末页去掉顶部 padding（与上一页紧密拼接） */
      .resume-page:last-child:not(:only-child) { padding-top: 0 !important; }
    `;
    document.head.appendChild(exportStyle);

    // 保存原始 inline style，截图后恢复
    const savedInlineStyles = Array.from(pages).map(p => p.getAttribute('style') || '');

    try {
      // 等待样式生效
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

      // 对 .resume-pages 容器截图
      const dataUrl = await domtoimage.toPng(pagesContainer, {
        bgcolor: '#ffffff',
        width: pagesContainer.scrollWidth,
        height: pagesContainer.scrollHeight
      });

      // 下载
      const fileName = `简历_${this.options.companyName || ''}_${this.options.position || ''}_长图.png`;
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = fileName.replace(/_+/g, '_').replace(/^_|_$/g, '');
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      this.showToast('图片已导出');
    } catch (err) {
      console.error('图片导出失败:', err);
      this.showToast('图片导出失败: ' + err.message);
    } finally {
      // 清理：移除导出样式
      const exportStyleEl = document.getElementById('export-image-override');
      if (exportStyleEl) exportStyleEl.parentNode.removeChild(exportStyleEl);

      // 恢复缩放
      this.styleConfig.scale = prevScale;
      this.applyScale();
    }
  }

  /**
   * 更新保存状态
   */
  updateStatus() {
    const statusEl = document.getElementById('save-status');
    const dotEl = document.getElementById('save-status-dot');
    const blocked = this.loadFailed;

    if (statusEl) {
      statusEl.textContent = blocked ? '加载失败·不可保存' : (this.saved ? '已保存' : '未保存');
      statusEl.style.color = blocked ? '#ef4444' : (this.saved ? '#22c55e' : '#f59e0b');
    }

    if (dotEl) {
      if (this.saved && !blocked) {
        dotEl.classList.remove('unsaved');
      } else {
        dotEl.classList.add('unsaved');
      }
    }
  }

  /**
   * 更新字数统计
   */
  updateWordCount() {
    const countEl = document.getElementById('word-count');
    if (!countEl || !this.editor) return;
    
    const text = this.editor.getValue();
    const charCount = text.length;
    const lineCount = text.split('\n').length;
    countEl.textContent = `${charCount} 字 / ${lineCount} 行`;
  }

  /**
   * 更新页数统计
   */
  updatePageCount(count) {
    const countEl = document.getElementById('page-count');
    if (!countEl) return;
    countEl.textContent = `${count} 页`;
  }

  /**
   * 显示 Toast 提示
   */
  showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2000);
  }
}

// 导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Toolbar;
} else {
  window.Toolbar = Toolbar;
}
