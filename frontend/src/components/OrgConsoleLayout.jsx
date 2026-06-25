import { useEffect, useState } from "react";
import { NavLink, Navigate, Outlet } from "react-router-dom";
import { apiGet } from "../lib/api.js";
import { getUser } from "../lib/auth.js";
import "../pages/console/console.css";

const NAV = [
  { to: "/console", end: true, label: "Обзор", icon: "M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z" },
  { to: "/console/program", label: "Программа", icon: "M4 5h16v15H4zM4 9h16M8 3v4M16 3v4" },
  { to: "/console/branding", label: "Брендинг", icon: "M12 3s6 6.5 6 11a6 6 0 01-12 0c0-4.5 6-11 6-11z" },
  { to: "/console/participants", label: "Участники", icon: "M9 11a4 4 0 100-8 4 4 0 000 8M2 21c0-3.9 3.1-7 7-7s7 3.1 7 7M17 11a3 3 0 100-6M22 21a5 5 0 00-5-5" },
  { to: "/console/checkin", label: "Регистрация на месте", icon: "M4 8V4h4M20 8V4h-4M4 16v4h4M20 16v4h-4M8 8h8v8H8z" },
  { to: "/console/moderation", label: "Модерация", icon: "M4 5h16v11H9l-5 4z" },
  { to: "/console/docs", label: "Документы", icon: "M6 3h8l4 4v14H6zM14 3v4h4" },
  { to: "/console/team", label: "Команда", icon: "M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8M19 8v6M22 11h-6" },
  { to: "/console/billing", label: "Подписка", icon: "M3 7h18v12H3zM3 11h18" },
];

function initials(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "О";
  return (parts[0][0] + (parts[1]?.[0] || "")).toUpperCase();
}
function orgMark(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  return parts.map((p) => p[0]).join("").slice(0, 3).toUpperCase() || "ВУЗ";
}

export default function OrgConsoleLayout() {
  const user = getUser();
  const [org, setOrg] = useState(null);
  const [conference, setConference] = useState(null);
  const [confLoaded, setConfLoaded] = useState(false);

  useEffect(() => {
    apiGet("/org").then(setOrg).catch(() => setOrg(null));
    apiGet("/conference")
      .then(setConference)
      .catch(() => setConference(null))
      .finally(() => setConfLoaded(true));
  }, []);

  // Конференция ещё не настроена организатором — ведём на онбординг.
  if (confLoaded && !conference?.onboarded) {
    return <Navigate to="/console/onboarding" replace />;
  }

  const orgName = org?.display_name || "Ваш вуз";
  const confTitle = conference?.title || "Конференция не создана";

  return (
    <div className="con-root">
      <div className="con-shell">
        <nav className="con-sidebar" aria-label="Разделы консоли">
          <div className="con-logo">
            <span className="con-logo-mark" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 7h16M4 12h11M4 17h7" /></svg>
            </span>
            <span className="con-logo-name">Кворум</span>
          </div>

          <div className="con-workspace">
            <span className="con-workspace-mark">{orgMark(orgName)}</span>
            <span className="con-workspace-tx">
              <b>{confTitle}</b>
              <span>{orgName}</span>
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
              <b>{user?.profile?.full_name || "Организатор"}</b>
              <span>Оргкомитет · Куратор</span>
            </span>
          </div>
        </nav>

        <main className="con-main">
          <Outlet context={{ org, setOrg, conference, setConference }} />
        </main>
      </div>
    </div>
  );
}
