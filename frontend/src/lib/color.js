// Shared color primitives (hex ⇆ {r,g,b}, tint/shade) used by the branding
// pipeline (lib/org.js) and the per-tenant event theme (lib/eventTheme.js). Single
// source so a fix to hex parsing/rounding lands in one place.

export function clampByte(v) {
  return Math.max(0, Math.min(255, Math.round(v)));
}

// parseHex accepts "#rrggbb" or "rrggbb"; returns {r,g,b} or null on invalid input.
export function parseHex(hex) {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(String(hex || "").trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function toHex({ r, g, b }) {
  return "#" + [r, g, b].map((v) => clampByte(v).toString(16).padStart(2, "0")).join("");
}

// tint mixes toward white (amount 0..1) — light tints.
export function tint(rgb, amount) {
  return {
    r: rgb.r + (255 - rgb.r) * amount,
    g: rgb.g + (255 - rgb.g) * amount,
    b: rgb.b + (255 - rgb.b) * amount,
  };
}

// shade mixes toward black (amount 0..1) — darker accent.
export function shade(rgb, amount) {
  return { r: rgb.r * (1 - amount), g: rgb.g * (1 - amount), b: rgb.b * (1 - amount) };
}
