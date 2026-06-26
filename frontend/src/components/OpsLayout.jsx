import { NavLink, Outlet } from "react-router-dom";
import { getUser } from "../lib/auth.js";
import "../pages/console/console.css";
import "../pages/ops/ops.css";

const NAV = [
  { to: "/ops", end: true, label: "Обзор", icon: "M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z" },
  { to: "/ops/tenants", label: "Тенанты", icon: "M3 21h18M5 21V7l7-4 7 4v14M9 9h.01M15 9h.01M9 13h.01M15 13h.01M9 17h.01M15 17h.01" },
];

function initials(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "О";
  return (parts[0][0] + (parts[1]?.[0] || "")).toUpperCase();
}

// OpsLayout — операторская консоль платформы (зона OPS). Тот же визуальный язык
// «Кворум» (.con-root), но с операторской меткой и тёмной плашкой-окружением,
// чтобы отличать платформенную зону от кабинета вуза.
export default function OpsLayout() {
  const user = getUser();
  return (
    <div className="con-root ops-root">
      <div className="con-shell">
        <nav className="con-sidebar" aria-label="Разделы операторской консоли">
          <div className="con-logo">
            <span className="con-logo-mark" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 7h16M4 12h11M4 17h7" /></svg>
            </span>
            <span className="con-logo-name">Кворум</span>
          </div>

          <div className="ops-env" aria-label="Операторская консоль платформы">
            <span className="ops-env-dot" aria-hidden="true" />
            <span className="ops-env-tx">
              <b>Операторская консоль</b>
              <span>Платформа · все тенанты</span>
            </span>
          </div>

          <div className="con-nav">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) => `con-nav-item${isActive ? " active" : ""}`}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d={item.icon} />
                </svg>
                <span>{item.label}</span>
              </NavLink>
            ))}
          </div>

          <div className="con-user">
            <span className="con-user-av">{initials(user?.profile?.full_name || user?.email)}</span>
            <span className="con-user-tx">
              <b>{user?.profile?.full_name || "Оператор"}</b>
              <span>Оператор платформы</span>
            </span>
          </div>
        </nav>

        <main className="con-main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
