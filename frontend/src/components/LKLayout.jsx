import { Link, Outlet, useLocation } from "react-router-dom";
import "../pages/lk.css";

// Иконки таб-бара (Tabler-подобные контурные).
const icons = {
  home: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M5 12 12 5l7 7M6 10v9a1 1 0 0 0 1 1h3v-5h4v5h3a1 1 0 0 0 1-1v-9" />
    </svg>
  ),
  calendar: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="4" y="5" width="16" height="16" rx="2" />
      <path d="M4 9h16M8 3v4M16 3v4" />
    </svg>
  ),
  badge: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M8 8h2v2H8zM14 8h2v2h-2zM8 14h2v2H8zM14 14h2v2h-2z" />
    </svg>
  ),
  chat: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M4 5h16v11H9l-4 4V5z" />
    </svg>
  ),
  more: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="5" cy="12" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="19" cy="12" r="1.6" />
    </svg>
  ),
};

const TABS = [
  { key: "home", to: "/dashboard", label: "Главная", match: ["/dashboard"] },
  { key: "calendar", to: "/program", label: "Программа", match: ["/program", "/schedule"] },
  { key: "badge", to: "/documents", label: "Бейдж", match: ["/documents"] },
  { key: "chat", to: "/chat", label: "Чат", match: ["/chat"] },
  { key: "more", to: "/profile", label: "Ещё", match: ["/profile", "/feedback", "/map", "/qa", "/more"] },
];

export default function LKLayout() {
  const location = useLocation();
  const path = location.pathname;
  const isActive = (tab) => tab.match.some((m) => path === m || path.startsWith(`${m}/`));

  return (
    <div className="lk-shell">
      <Outlet />
      <nav className="lk-tabbar" aria-label="Разделы кабинета">
        {TABS.map((tab) => (
          <Link
            key={tab.key}
            to={tab.to}
            className={`lk-tab ${isActive(tab) ? "active" : ""}`}
            aria-current={isActive(tab) ? "page" : undefined}
          >
            {icons[tab.key]}
            {tab.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
