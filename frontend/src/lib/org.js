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

// applyBranding derives a tint/shade scale from the tenant's primary_color and
// sets the --primary* CSS variables, overriding the academic-blue defaults. A
// missing/invalid color is a no-op (keeps the defaults).
export function applyBranding(branding) {
  const rgb = parseHex(branding?.primary_color);
  if (!rgb) return;
  const base = toHex(rgb);
  const dark = toHex(shade(rgb, 0.2));
  const root = document.documentElement.style;
  root.setProperty("--primary", base);
  root.setProperty("--primary-dark", dark);
  root.setProperty("--primary-50", toHex(tint(rgb, 0.93)));
  root.setProperty("--primary-100", toHex(tint(rgb, 0.85)));
  root.setProperty("--primary-200", toHex(tint(rgb, 0.68)));
  root.setProperty("--primary-300", toHex(tint(rgb, 0.48)));
  // Back-compat: legacy CSS still references --red / --red-dark as the accent.
  root.setProperty("--red", base);
  root.setProperty("--red-dark", dark);
}
