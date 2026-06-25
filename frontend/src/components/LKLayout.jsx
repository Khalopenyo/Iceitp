import { Link, Outlet, useLocation } from "react-router-dom";
import { icons } from "./lkIcons.jsx";
import "../pages/lk.css";

const TABS = [
  { key: "home", to: "/dashboard", label: "Главная", match: ["/dashboard"] },
  { key: "calendar", to: "/schedule", label: "Программа", match: ["/schedule", "/program"] },
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
