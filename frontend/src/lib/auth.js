const USER_KEY = "conf_user";
export const AUTH_CHANGED_EVENT = "conf:auth-changed";

function notifyAuthChanged() {
  if (typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
}

export const getToken = () => null;
export const setToken = () => {};

export const clearAuth = () => {
  localStorage.removeItem(USER_KEY);
  notifyAuthChanged();
};

export const clearToken = clearAuth;

export const getUser = () => {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

export const setUser = (user) => {
  if (!user) {
    localStorage.removeItem(USER_KEY);
  } else {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  }
  notifyAuthChanged();
};

export const isAuthenticated = () => Boolean(getUser());
