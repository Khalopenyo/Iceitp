import { apiGet } from "./api.js";

// fetchBranding loads the resolved tenant's branding (slug/display_name/logo_url/
// primary_color/status). Returns null on failure so theming silently falls back
// to the academic-blue defaults in index.css.
export async function fetchBranding() {
  try {
    return await apiGet("/org", { suppressAuthRedirect: true });
  } catch {
    return null;
  }
}

// publicSiteUrl — абсолютная ссылка на публичный сайт вуза (для кнопки «Открыть сайт»
// в консоли). Кастомный домен в приоритете; иначе {slug}.{база}, где база выводится из
// текущего хоста: работает и локально (slug.localhost:port), и в проде (slug.kvorum.ru).
export function publicSiteUrl(org) {
  if (!org) return null;
  if (org.custom_domain) return `https://${org.custom_domain}`;
  if (!org.slug || typeof window === "undefined") return null;
  const { protocol, host, hostname } = window.location;
  let base = host;
  if (hostname === "localhost" || hostname.endsWith(".localhost")) {
    base = hostname.endsWith(".localhost") ? host.split(".").slice(1).join(".") : host;
  } else {
    const parts = host.split(".");
    if (parts.length > 2) base = parts.slice(1).join(".");
  }
  return `${protocol}//${org.slug}.${base}`;
}

// Голые домены платформы. Всё остальное (тенант-поддомены вуз.kvorum.ru, кастомные
// домены вуза) считаем тенантом — нельзя судить по числу меток (кастомный домен
// «misis.ru» тоже двухсоставный, но это сайт вуза, а не лендинг платформы).
const PLATFORM_HOSTS = new Set(["kvorum.ru", "www.kvorum.ru", "localhost", "127.0.0.1"]);

// isPlatformHost — true только на «голом» домене платформы: там показываем
// маркетинговый лендинг Кворума. На поддомене/кастомном домене вуза — сайт вуза.
export function isPlatformHost() {
  if (typeof window === "undefined") return false;
  return PLATFORM_HOSTS.has(window.location.hostname);
}

function clampByte(v) {
  return Math.max(0, Math.min(255, Math.round(v)));
}

function parseHex(hex) {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(String(hex || "").trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function toHex({ r, g, b }) {
  return "#" + [r, g, b].map((v) => clampByte(v).toString(16).padStart(2, "0")).join("");
}

// mix toward white (amount 0..1) — for light tints.
function tint(rgb, amount) {
  return {
    r: rgb.r + (255 - rgb.r) * amount,
    g: rgb.g + (255 - rgb.g) * amount,
    b: rgb.b + (255 - rgb.b) * amount,
  };
}

// mix toward black (amount 0..1) — for darker accent.
function shade(rgb, amount) {
  return { r: rgb.r * (1 - amount), g: rgb.g * (1 - amount), b: rgb.b * (1 - amount) };
}

// applyBranding derives the brand blue scale (--bl-*) from the tenant's
// primary_color and sets it on :root. Everything else — --brand, --link, the
// legacy --primary*/--red aliases — follows via the var() chains in index.css. A
// missing/invalid color is a no-op (keeps the academic-blue defaults).
export function applyBranding(branding) {
  const rgb = parseHex(branding?.primary_color);
  if (!rgb) return;
  const root = document.documentElement.style;
  root.setProperty("--bl-50", toHex(tint(rgb, 0.93)));
  root.setProperty("--bl-100", toHex(tint(rgb, 0.85)));
  root.setProperty("--bl-200", toHex(tint(rgb, 0.68)));
  root.setProperty("--bl-300", toHex(tint(rgb, 0.48)));
  root.setProperty("--bl-400", toHex(tint(rgb, 0.28)));
  root.setProperty("--bl-500", toHex(tint(rgb, 0.12)));
  root.setProperty("--bl-600", toHex(rgb));
  root.setProperty("--bl-700", toHex(shade(rgb, 0.2)));
  root.setProperty("--bl-800", toHex(shade(rgb, 0.4)));
  root.setProperty("--bl-900", toHex(shade(rgb, 0.55)));
  root.setProperty("--focus", `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.3)`);
}
