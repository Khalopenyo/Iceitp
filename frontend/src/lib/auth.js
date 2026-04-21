const USER_KEY = "conf_user";

export const getToken = () => null;
export const setToken = () => {};

export const clearAuth = () => {
  localStorage.removeItem(USER_KEY);
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
  localStorage.setItem(USER_KEY, JSON.stringify(user));
};

export const isAuthenticated = () => Boolean(getUser());
