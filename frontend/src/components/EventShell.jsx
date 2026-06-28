import { useEffect, useMemo, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { apiGet } from "../lib/api.js";
import { AUTH_CHANGED_EVENT, getUser } from "../lib/auth.js";
import { fetchBranding } from "../lib/org.js";
import { eventThemeVars } from "../lib/eventTheme.js";
import { getConferenceTitle, getConferenceSupportEmail, formatConferenceDateRange } from "../lib/conference.js";
import StatusPlaceholder from "./StatusPlaceholder.jsx";
import "../pages/event/event.css";

const PLATFORM_NAME = "Кворум";

// Личные (авторизованные) маршруты участника внутри EventShell. Только статус finished их
// не гейтит (участник должен видеть кабинет/сертификат после конференции). draft и suspended
// гейтят всё — иначе чужой/вошедший увидел бы НЕопубликованную витрину. Здесь только реально
// смонтированные под EventShell личные маршруты (по мере переноса ЛК добавлять сюда).
const AUTHED_PREFIXES = ["/dashboard", "/documents", "/chat", "/schedule", "/profile", "/feedback", "/map"];

// Навигация публичного сайта вуза. Контентные пункты видят все; кабинет/чат/
// документы — только вошедшие участники.
const PUBLIC_NAV = [
  { to: "/", end: true, label: "Главная", icon: "M3 11l9-8 9 8M5 10v10h14V10" },
  { to: "/program", label: "Программа", icon: "M4 5h16v15H4zM4 9h16M8 3v4M16 3v4" },
  { to: "/sections", label: "Секции", icon: "M4 6h16M4 12h16M4 18h16" },
  { to: "/speakers", label: "Спикеры", icon: "M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8" },
  { to: "/venue", label: "Площадка", icon: "M12 21s7-6.5 7-11a7 7 0 10-14 0c0 4.5 7 11 7 11zM12 10a2 2 0 100-4 2 2 0 000 4" },
  { to: "/live", label: "Трансляции", icon: "M23 7l-7 5 7 5zM1 5h15v14H1z" },
];
const AUTH_NAV = [
  { to: "/dashboard", label: "Кабинет", icon: "M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z" },
  { to: "/schedule", label: "Моё расписание", icon: "M4 5h16v15H4zM4 9h16M8 3v4M16 3v4M9 14l2 2 4-4" },
  { to: "/map", label: "Карта 360°", icon: "M12 21s7-6.5 7-11a7 7 0 10-14 0c0 4.5 7 11 7 11zM12 10a2 2 0 100-4 2 2 0 000 4" },
  { to: "/documents", label: "Документы", icon: "M6 3h8l4 4v14H6zM14 3v4h4" },
  { to: "/chat", label: "Чат", icon: "M4 5h16v11H9l-5 4z" },
  { to: "/feedback", label: "Обратная связь", icon: "M12 3l2.6 5.5 6 .8-4.4 4.2 1.1 6L12 16.8 6.7 19.5l1.1-6L3.4 9.3l6-.8z" },
];

function initials(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "У";
  return (parts[0][0] + (parts[1]?.[0] || "")).toUpperCase();
}
function orgMark(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  return parts.map((p) => p[0]).join("").slice(0, 3).toUpperCase() || "В";
}

// EventShell — единый каркас публичного сайта вуза на поддомене (зона Event):
// сайдбар в бренде вуза (направление academic/digital из org.theme) + контент.
// Применяет per-tenant токены и гейтит витрину по статусу публикации.
export default function EventShell() {
  const { pathname: path } = useLocation();
  const [user, setUserState] = useState(getUser());
  const [org, setOrg] = useState(null);
  const [brandingLoaded, setBrandingLoaded] = useState(false);
  const [conference, setConference] = useState(null);
  const [confLoaded, setConfLoaded] = useState(false);

  useEffect(() => {
    fetchBranding().then((b) => { if (b) setOrg(b); }).finally(() => setBrandingLoaded(true));
    apiGet("/conference").then(setConference).catch(() => setConference(null)).finally(() => setConfLoaded(true));
  }, []);

  // Сайдбар (анон-CTA vs карточка участника) должен обновляться при входе/выходе
  // без перезагрузки — слушаем смену сессии (как Layout).
  useEffect(() => {
    const sync = () => setUserState(getUser());
    window.addEventListener(AUTH_CHANGED_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(AUTH_CHANGED_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const themeVars = useMemo(() => eventThemeVars(org?.theme, org?.primary_color), [org?.theme, org?.primary_color]);

  const brandName = org?.display_name?.trim() || getConferenceTitle(conference) || PLATFORM_NAME;
  const isTenantStaff = Boolean(user && ["org", "admin", "staff"].includes(user.role));
  const isParticipant = Boolean(user);
  const pubLoaded = confLoaded && brandingLoaded;

  // Гейт по статусу публикации:
  //  • suspended → блок ВСЕМ (включая кабинет);
  //  • draft → «скоро» всем, кроме команды-превью (черновик НЕ виден ни анониму, ни вошедшему,
  //    в т.ч. на личных маршрутах — иначе кросс-тенант увидел бы неопубликованную витрину);
  //  • finished → публичная витрина показывает «материалы», но ЛИЧНЫЕ маршруты открыты
  //    (участник должен видеть свой кабинет/сертификат после конференции);
  //  • live → сайт.
  const isAuthedRoute = AUTHED_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
  let gate = null;
  if (org?.status === "suspended") gate = "suspended";
  else if (!conference || (conference.status === "draft" && !isTenantStaff)) gate = "not-published";
  else if (conference.status === "finished" && !isAuthedRoute) gate = "finished";

  const sidebar = (
    <nav className="event-sidebar" aria-label="Навигация по сайту вуза">
      <Link to="/" className="event-logo" style={{ textDecoration: "none" }}>
        {org?.logo_url ? (
          <img src={org.logo_url} alt={`Логотип ${brandName}`} />
        ) : (
          <span className="event-logo-mark" aria-hidden="true">{orgMark(brandName)}</span>
        )}
        <span className="event-logo-tx">
          <b>{brandName}</b>
          <span>{conference?.starts_at ? formatConferenceDateRange(conference.starts_at, conference.ends_at) : "конференция"}</span>
        </span>
      </Link>

      {/* Заглушки статуса (приостановлен/не опубликован/завершён) показываем без
          навигации — как минимальный shell в Layout. */}
      {gate ? null : (
        <>
          <div className="event-nav">
            {(isParticipant ? [...AUTH_NAV, ...PUBLIC_NAV] : PUBLIC_NAV).map((item) => (
              <NavLink key={item.to} to={item.to} end={item.end}
                className={({ isActive }) => `event-nav-item${isActive ? " active" : ""}`}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={item.icon} /></svg>
                <span>{item.label}</span>
              </NavLink>
            ))}
          </div>

          <div className="event-foot">
            {isParticipant ? (
              <Link to="/profile" className="event-user" style={{ textDecoration: "none" }}>
                <span className="event-user-av">{initials(user?.profile?.full_name || user?.email)}</span>
                <span className="event-user-tx">
                  <b>{user?.profile?.full_name || "Участник"}</b>
                  <span>{isTenantStaff ? "Оргкомитет" : "Участник"}</span>
                </span>
              </Link>
            ) : (
              <>
                <Link to="/register" className="event-foot-btn primary">Регистрация</Link>
                <Link to="/login" className="event-foot-btn ghost">Войти</Link>
              </>
            )}
          </div>
        </>
      )}
    </nav>
  );

  return (
    <div className="event-root" style={themeVars}>
      <div className="event-shell">
        {sidebar}
        <main className="event-main">
          {conference?.status === "draft" && isTenantStaff ? (
            <div className="event-draft-banner" role="status">
              Черновик — сайт виден только команде. Опубликуйте его в консоли, чтобы открыть регистрацию.{" "}
              <Link to="/console">Перейти в консоль →</Link>
            </div>
          ) : null}

          {!pubLoaded ? (
            <div role="status" aria-busy="true" aria-label="Загрузка" style={{ minHeight: "40vh" }} />
          ) : gate ? (
            <StatusPlaceholder
              variant={gate}
              title={conference ? getConferenceTitle(conference) : undefined}
              dateLabel={conference ? formatConferenceDateRange(conference.starts_at, conference.ends_at) : undefined}
              supportEmail={getConferenceSupportEmail(conference)}
            />
          ) : (
            <Outlet context={{ org, conference, user, isTenantStaff }} />
          )}
        </main>
      </div>
    </div>
  );
}
