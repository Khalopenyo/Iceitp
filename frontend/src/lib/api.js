import { clearAuth } from "./auth.js";

const rawBaseUrl = typeof import.meta.env.VITE_API_URL === "string" ? import.meta.env.VITE_API_URL.trim() : "";
const baseUrl = rawBaseUrl.replace(/\/+$/, "");

async function request(path, options = {}) {
  const { suppressAuthRedirect: suppressAuthRedirectOption, ...fetchOptions } = options;
  const headers = options.headers || {};
  if (!(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }
  const suppressAuthRedirect =
    suppressAuthRedirectOption === true ||
    path.startsWith("/auth/login") ||
    path.startsWith("/auth/register") ||
    path.startsWith("/auth/forgot-password") ||
    path.startsWith("/auth/reset-password") ||
    path.startsWith("/auth/logout");
  const res = await fetch(`${baseUrl}/api${path}`, {
    ...fetchOptions,
    headers,
    credentials: "include",
  });
  if (res.status === 401) {
    clearAuth();
    if (!suppressAuthRedirect) {
      window.location.href = "/login";
    }
  }
  if (res.status === 403) {
    throw new Error("Forbidden");
  }
  if (!res.ok) {
    const text = await res.text();
    try {
      const parsed = JSON.parse(text);
      throw new Error(parsed.details || parsed.error || text || "Request failed");
    } catch {
      throw new Error(text || "Request failed");
    }
  }
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/pdf")) {
    return res;
  }
  return res.json();
}

export const apiGet = (path, options = {}) => request(path, options);
export const apiPost = (path, data, options = {}) => request(path, { ...options, method: "POST", body: JSON.stringify(data) });
export const apiPostForm = (path, formData, options = {}) => request(path, { ...options, method: "POST", body: formData });
export const apiPatch = (path, data, options = {}) => request(path, { ...options, method: "PATCH", body: JSON.stringify(data) });
export const apiPut = (path, data, options = {}) => request(path, { ...options, method: "PUT", body: JSON.stringify(data) });
export const apiDelete = (path, options = {}) => request(path, { ...options, method: "DELETE" });
