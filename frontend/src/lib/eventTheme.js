// Токены оформления публичного сайта вуза (зона EventShell). Две ветки из прототипа
// редизайна: "academic" (Source Serif 4, светлый сайдбар) и "digital" (IBM Plex Sans,
// брендовый сайдбар). Акцент-цвет приходит ПЕР-ТЕНАНТ из org.primary_color, поэтому
// ГГНТУ-кримсон в прототипе — лишь пример одного вуза. Все переменные с префиксом
// --ev-, чтобы не конфликтовать с глобальными токенами index.css / зоны console.

const BASE = {
  academic: {
    "--ev-bg": "#f6f3ee", "--ev-surface": "#ffffff", "--ev-surface-2": "#faf8f4",
    "--ev-ink": "#23201c", "--ev-muted": "#6f665e", "--ev-faint": "#9a9189", "--ev-line": "#e4ded4",
    "--ev-chrome-bg": "#ffffff", "--ev-chrome-ink": "#23201c", "--ev-chrome-muted": "#857c73",
    "--ev-chrome-line": "#e9e3da",
    "--ev-font-head": "'Source Serif 4', Georgia, serif",
    "--ev-radius": "6px", "--ev-radius-lg": "8px", "--ev-head-weight": "600", "--ev-head-spacing": "-0.012em",
    "--ev-logo-filter": "none",
  },
  digital: {
    "--ev-bg": "#f3f3f2", "--ev-surface": "#ffffff", "--ev-surface-2": "#fafafa",
    "--ev-ink": "#191919", "--ev-muted": "#646464", "--ev-faint": "#9b9b9b", "--ev-line": "#e7e6e3",
    // chrome-bg/ink заполняются акцентом (брендовый сайдбар) в eventThemeVars.
    "--ev-chrome-muted": "rgba(255,255,255,.72)", "--ev-chrome-line": "rgba(255,255,255,.16)",
    "--ev-font-head": "'IBM Plex Sans', system-ui, sans-serif",
    "--ev-radius": "9px", "--ev-radius-lg": "11px", "--ev-head-weight": "700", "--ev-head-spacing": "-0.022em",
    "--ev-logo-filter": "brightness(0) invert(1)",
  },
};

const FALLBACK_ACCENT = "#b42318"; // дефолт, если у вуза не задан бренд-цвет
const DARK_INK = "#23201c";
const hexRe = /^#[0-9a-fA-F]{6}$/;

function clamp(n) { return Math.max(0, Math.min(255, Math.round(n))); }
function parse(hex) {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
}
function toHex(rgb) {
  return "#" + rgb.map((v) => clamp(v).toString(16).padStart(2, "0")).join("");
}
function darken(hex, amount) {
  return toHex(parse(hex).map((v) => v * (1 - amount)));
}
// Светлая «подложка» акцента: смешиваем с белым (≈92%).
function wash(hex) {
  return toHex(parse(hex).map((v) => v + (255 - v) * 0.92));
}
// WCAG относительная яркость + контраст (а не упрощённая яркость — иначе порог
// промахивается на средне-светлых цветах).
function lin(c) {
  const x = c / 255;
  return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
}
function relLum(hex) {
  const [r, g, b] = parse(hex);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
function contrast(h1, h2) {
  const a = relLum(h1), b = relLum(h2);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
// Текст на акцентном фоне: выбираем белый ИЛИ тёмный по фактическому WCAG-контрасту
// (для брендового сайдбара digital), а не по одному порогу.
function readableOn(hex) {
  return contrast("#ffffff", hex) >= contrast(DARK_INK, hex) ? "#ffffff" : DARK_INK;
}
// Гарантируем, что акцент читаем как текст/кнопка на белой поверхности: слишком
// светлый бренд-цвет затемняем, пока контраст к белому не станет приемлемым (≥4).
function usableAccent(hex) {
  let c = hex;
  for (let i = 0; i < 14 && contrast(c, "#ffffff") < 4; i++) c = darken(c, 0.1);
  return c;
}

// eventThemeVars возвращает карту CSS-переменных для направления + бренд-цвета вуза.
export function eventThemeVars(theme, accentColor) {
  const dir = theme === "digital" ? "digital" : "academic";
  const raw = accentColor && hexRe.test(accentColor) ? accentColor : FALLBACK_ACCENT;
  // Затемняем слишком светлый бренд-цвет, чтобы акцентный текст/кнопки оставались
  // читаемыми на белой поверхности (иначе near-white бренд «исчезает»).
  const accent = usableAccent(raw);
  // Текст НА акцентной заливке (карточки кабинета): выбираем белый/тёмный по факт. контрасту,
  // чтобы у любого бренд-цвета (в т.ч. светлого) текст оставался читаемым (WCAG), а не всегда #fff.
  const onAccent = readableOn(accent);
  const onAccentMuted = onAccent === "#ffffff" ? "rgba(255,255,255,.86)" : "rgba(35,32,28,.74)";
  // Видимое фокус-кольцо: полупрозрачный акцент (НЕ wash — он почти белый и невидим
  // как самостоятельное кольцо на белой поверхности).
  const [fr, fg, fb] = parse(accent);
  const vars = {
    ...BASE[dir],
    "--ev-accent": accent,
    "--ev-accent-dk": darken(accent, 0.28),
    "--ev-accent-wash": wash(accent),
    "--ev-on-accent": onAccent,
    "--ev-on-accent-muted": onAccentMuted,
    "--ev-focus": `rgba(${fr}, ${fg}, ${fb}, 0.35)`,
  };
  if (dir === "digital") {
    // Сайдбар залит брендом вуза; цвет текста — по фактическому контрасту.
    const on = readableOn(accent);
    const white = on === "#ffffff";
    vars["--ev-chrome-bg"] = accent;
    vars["--ev-chrome-ink"] = on;
    // Приглушённый текст — основной в сайдбаре, держим его читаемым (высокая alpha).
    vars["--ev-chrome-muted"] = white ? "rgba(255,255,255,.85)" : "rgba(35,32,28,.74)";
    vars["--ev-chrome-line"] = white ? "rgba(255,255,255,.20)" : "rgba(35,32,28,.14)";
    vars["--ev-chrome-active-bg"] = white ? "rgba(255,255,255,.20)" : "rgba(35,32,28,.12)";
    vars["--ev-chrome-active-ink"] = on;
    vars["--ev-logo-filter"] = white ? "brightness(0) invert(1)" : "none";
  } else {
    // Светлый сайдбар; активный пункт — брендовая подложка + брендовый текст.
    vars["--ev-chrome-active-bg"] = wash(accent);
    vars["--ev-chrome-active-ink"] = accent;
    vars["--ev-logo-filter"] = "none";
  }
  return vars;
}
