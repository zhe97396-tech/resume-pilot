/**
 * api.js - API 调用封装（resume-pilot 版）
 *
 * 后端：scripts/server.py（Python 标准库本地服务）
 * 简历路径：output/<公司>/<岗位>/resume.md
 */

const API_BASE = '';

const api = {
  /** 列出所有简历 */
  async listResumes() {
    try {
      const res = await fetch(`${API_BASE}/api/resumes`);
      return await res.json();
    } catch (e) {
      return { success: false, error: e.message };
    }
  },

  /** 读取某份简历 md */
  async getMarkdown(company, position) {
    try {
      const res = await fetch(`${API_BASE}/api/resume/${encodeURIComponent(company)}/${encodeURIComponent(position)}`);
      return await res.json();
    } catch (e) {
      return { success: false, error: e.message };
    }
  },

  /** 保存某份简历 md */
  async saveMarkdown(company, position, markdown) {
    try {
      const res = await fetch(`${API_BASE}/api/resume/${encodeURIComponent(company)}/${encodeURIComponent(position)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markdown })
      });
      return await res.json();
    } catch (e) {
      return { success: false, error: e.message };
    }
  },

  /** 列出样式模板 */
  async getTemplates() {
    try {
      const res = await fetch(`${API_BASE}/api/templates`);
      return await res.json();
    } catch (e) {
      return { success: false, error: e.message };
    }
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
} else {
  window.api = api;
}
