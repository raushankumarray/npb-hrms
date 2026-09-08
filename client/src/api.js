// Centralized HTTP client for NPB HRMS
const API_BASE = import.meta.env.VITE_API_BASE || '/api';

export function getToken() {
  return localStorage.getItem('npb_hrms_token');
}

export function setToken(token) {
  localStorage.setItem('npb_hrms_token', token);
}

export function removeToken() {
  localStorage.removeItem('npb_hrms_token');
}

export async function apiRequest(endpoint, options = {}) {
  const token = getToken();
  const headers = { ...options.headers };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // If body is FormData, let the browser set the boundary header automatically
  if (!(options.body instanceof FormData) && options.body && typeof options.body === 'object') {
    headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(options.body);
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers
  });

  if (response.status === 401) {
    // If not on login endpoint, token might be expired
    if (!endpoint.includes('/auth/login')) {
      removeToken();
      window.dispatchEvent(new Event('auth-expired'));
    }
  }

  // Handle binary downloads (Excel / PDF)
  const contentType = response.headers.get('content-type');
  if (contentType && (contentType.includes('application/vnd.openxmlformats') || contentType.includes('application/octet-stream') || contentType.includes('text/html'))) {
    if (contentType.includes('text/html') && options.method === 'POST') {
      const htmlText = await response.text();
      return { isHtmlReport: true, htmlText };
    }
    const blob = await response.blob();
    return { isBlob: true, blob };
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `Request failed with status ${response.status}`);
  }

  return data;
}
