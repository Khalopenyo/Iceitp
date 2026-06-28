import { useEffect, useMemo, useState } from "react";
import { Link, Outlet } from "react-router-dom";
import { fetchBranding, isPlatformHost } from "../lib/org.js";
import { eventThemeVars } from "../lib/eventTheme.js";
import "./auth-layout.css";

const PLATFORM_ACCENT = "#4f46e5"; // бренд платформы «Кворум» (indigo)

// Алиасим обобщённые токены (--bg/--surface/--text/--brand/--font...) на event-токены
// вуза, чтобы вся auth-вёрстка и UI-кит автоматически перекрасились в редизайн (--ev-*),
// без переписывания CSS. Семантические (--gr-*/--rd-*/--am-*) и радиусы оставляем как есть.
function authThemeStyle(theme, color) {
  return {
    ...eventThemeVars(theme, color),
    "--bg": "var(--ev-bg)",
    "--surface": "var(--ev-surface)",
    "--surface-2": "var(--ev-surface-2)",
    "--text": "var(--ev-ink)",
    "--text-2": "var(--ev-muted)",
    "--text-3": "var(--ev-faint)",
    "--border": "var(--ev-line)",
    "--brand": "var(--ev-accent)",
    "--brand-700": "var(--ev-accent-dk)",
    "--brand-weak": "var(--ev-accent-wash)",
    "--on-brand": "#ffffff",
    "--focus": "var(--ev-focus)",
    "--font": "'IBM Plex Sans', system-ui, sans-serif",
  };
}

// AuthLayout — изолированный каркас auth-флоу (SCR-PUB-07/08/09/10) в редизайне:
// шапка (лого/имя вуза + «на сайт»), центрированный контент, per-tenant event-тема.
export default function AuthLayout() {
  // На голом домене платформы вход/регистрация — под брендом «Кворум», а не
  // дефолтного вуза (на голом хосте /api/org резолвится в дефолтный тенант).
  const platform = isPlatformHost();
  const [branding, setBranding] = useState(null);

  useEffect(() => {
    if (platform) return undefined;
    fetchBranding().then((value) => {
      if (value) setBranding(value);
    });
    return undefined;
  }, [platform]);

  const themeStyle = useMemo(
    () => (platform ? authThemeStyle(undefined, PLATFORM_ACCENT) : authThemeStyle(branding?.theme, branding?.primary_color)),
    [platform, branding?.theme, branding?.primary_color]
  );

  const brandName = platform ? "Кворум" : branding?.display_name || "КонференцХаб";
  const brandLogo = platform ? null : branding?.logo_url;

  return (
    <div className="auth-shell" style={themeStyle}>
      <header className="auth-shell-top">
        <Link to="/" className="auth-shell-brand">
          {brandLogo ? <img src={brandLogo} alt="" /> : null}
          <span>{brandName}</span>
        </Link>
        <Link to="/" className="auth-shell-back">
          {platform ? "← На главную" : "← На сайт"}
        </Link>
      </header>
      <main className="auth-shell-main">
        <Outlet />
      </main>
    </div>
  );
}
