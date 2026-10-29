const staticHost = window.location.hostname.endsWith('.github.io');
const staticPreviewRequested = new URLSearchParams(window.location.search).has('staticDemo');
const staticDemo = staticHost || staticPreviewRequested;

window.api = {
  isStaticDemo: staticDemo,
  async request(url, options = {}) {
    if (staticDemo) {
      if (!window.facultyStaticDemo) {
        throw new Error('The static demo module did not load. Check the JavaScript asset paths.');
      }
      return window.facultyStaticDemo.request(url, options);
    }

    const apiBase = window.FACULTY_API_BASE_URL || window.location.origin;
    const response = await fetch(new URL(url, apiBase), {
      credentials: 'same-origin',
      ...options,
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
    });
    const type = response.headers.get('content-type') || '';
    const payload = type.includes('application/json') ? await response.json() : await response.text();
    if (!response.ok) {
      const error = new Error(payload?.error?.message || `Request failed (${response.status}).`);
      error.status = response.status;
      error.details = payload?.error?.details;
      throw error;
    }
    return payload;
  },
  get(url) { return this.request(url); },
  post(url, data) { return this.request(url, { method: 'POST', body: JSON.stringify(data || {}) }); },
  put(url, data) { return this.request(url, { method: 'PUT', body: JSON.stringify(data || {}) }); },
  delete(url) { return this.request(url, { method: 'DELETE' }); },
  downloadCsv(type) {
    if (staticDemo) return window.facultyStaticDemo.downloadCsv(type);
    window.location.assign(`/api/reports/${encodeURIComponent(type)}.csv`);
  }
};
