import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { AUTH_CHANGED_EVENT, clearAuth, getUser, setUser } from "../lib/auth.js";
import { useEffect, useState } from "react";
import { apiGet, apiPost } from "../lib/api.js";
import {
  CONFERENCE_UPDATED_EVENT,
  formatConferenceDateRange,
  getConferenceStatusLabel,
  getConferenceSupportEmail,
  getConferenceTitle,
} from "../lib/conference.js";

export default function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const [user, setUserState] = useState(getUser());
  const [conference, setConference] = useState(null);
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    if (!user) {
      return;
    }
    apiGet("/me")
      .then((data) => {
        setUser(data);
        setUserState(data);
      })
      .catch(() => {
        clearAuth();
        setUserState(null);
      });
  }, [user?.id]);

  useEffect(() => {
    const syncUser = () => {
      setUserState(getUser());
    };

    window.addEventListener(AUTH_CHANGED_EVENT, syncUser);
    window.addEventListener("storage", syncUser);

    return () => {
      window.removeEventListener(AUTH_CHANGED_EVENT, syncUser);
      window.removeEventListener("storage", syncUser);
    };
  }, []);

  useEffect(() => {
    let active = true;

    const loadConference = () => {
      apiGet("/conference")
        .then((data) => {
          if (active) {
            setConference(data);
          }
        })
        .catch(() => {
          if (active) {
            setConference(null);
          }
        });
    };

    loadConference();
    const handleConferenceUpdated = () => loadConference();
    window.addEventListener(CONFERENCE_UPDATED_EVENT, handleConferenceUpdated);

    return () => {
      active = false;
      window.removeEventListener(CONFERENCE_UPDATED_EVENT, handleConferenceUpdated);
    };
  }, []);

  useEffect(() => {
    setNavOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (typeof document === "undefined") {
      return undefined;
    }

    document.body.classList.toggle("nav-open", navOpen);

    return () => {
      document.body.classList.remove("nav-open");
    };
  }, [navOpen]);

  useEffect(() => {
    if (!navOpen) {
      return undefined;
    }

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setNavOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [navOpen]);

  const logout = async () => {
    try {
      await apiPost("/auth/logout", {}, { suppressAuthRedirect: true });
    } catch {
      // Session cleanup still continues locally even if backend cookie is already gone.
    }
    clearAuth();
    setUserState(null);
    setNavOpen(false);
    navigate("/");
  };

  const showMapLink = !!user;
  const marketingNavItems = [
    { href: "/#university", label: "О вузе" },
    { href: "/#iceitp", label: "Об ИЦЭиТП" },
    { href: "/#conference", label: "О конференции" },
    { href: "/#contacts", label: "Контакты" },
  ];
  const desktopNavItems = user
    ? [
        { to: "/", label: "Главная", end: true },
        { to: "/dashboard", label: "Кабинет" },
        { to: "/documents", label: "Документы" },
        ...(showMapLink ? [{ to: "/map", label: "Карта" }] : []),
        { to: "/feedback", label: "Отзывы" },
        { to: "/chat", label: "Чат" },
        ...(["admin", "org"].includes(user.role) ? [{ to: "/admin", label: "Админка" }] : []),
      ]
    : [
        { to: "/", label: "Главная", end: true },
      ];
  const mobilePrimaryNavItems = user
    ? [
        { to: "/", label: "Главная", mobileLabel: "Главная", end: true },
        { to: "/dashboard", label: "Кабинет", mobileLabel: "Кабинет" },
        { to: "/documents", label: "Документы", mobileLabel: "Док-ты" },
        ...(showMapLink ? [{ to: "/map", label: "Карта", mobileLabel: "Карта" }] : []),
      ]
    : [];
  const mobileSecondaryNavItems = user
    ? [
        { to: "/feedback", label: "Отзывы" },
        { to: "/chat", label: "Чат" },
        ...(["admin", "org"].includes(user.role) ? [{ to: "/admin", label: "Админка" }] : []),
      ]
    : [];
  const adminQuestionNavItem =
    user?.role === "admin" ? { to: "/admin/questions/approved", label: "Вопросы", mobileLabel: "Вопросы" } : null;
  const desktopNavItemsWithQuestions = adminQuestionNavItem
    ? [...desktopNavItems, adminQuestionNavItem]
    : desktopNavItems;
  const mobilePrimaryNavItemsWithQuestions = adminQuestionNavItem
    ? [...mobilePrimaryNavItems, adminQuestionNavItem]
    : mobilePrimaryNavItems;
  const conferenceTitle = getConferenceTitle(conference);
  const conferenceSupportEmail = getConferenceSupportEmail(conference);
  const conferenceDateLabel = formatConferenceDateRange(conference?.starts_at, conference?.ends_at);
  const conferenceStatusLabel = getConferenceStatusLabel(conference?.status);
  const subtitle =
    [conferenceDateLabel, conferenceStatusLabel].filter(Boolean).join(" · ") ||
    "Платформа организации научной конференции";
  const outletContext = {
    conference,
    conferenceTitle,
    conferenceDateLabel,
    conferenceStatusLabel,
    conferenceSupportEmail,
  };

  return (
    <div className="app">
      <header className="header">
        <Link
          className="brand"
          to="/"
          onClick={() => {
            setNavOpen(false);
          }}
        >
          <div className="logo" aria-label="Логотип ИЦЭиТП">
            <img src="/LOGO1.svg" alt="Логотип ИЦЭиТП" />
          </div>
          <div className="brand-copy">
            <div className="title">{conferenceTitle}</div>
            <div className="subtitle">{subtitle}</div>
          </div>
        </Link>
        <div className={`mobile-header-bar ${user ? "mobile-header-bar-auth" : "mobile-header-bar-guest"}`}>
          {user ? (
            <nav className="mobile-header-nav" aria-label="Навигация по страницам">
              {mobilePrimaryNavItemsWithQuestions.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) => `mobile-header-link${isActive ? " active" : ""}`}
                  onClick={() => setNavOpen(false)}
                >
                  {item.mobileLabel || item.label}
                </NavLink>
              ))}
              <button type="button" className="mobile-header-logout" onClick={logout}>
                Выйти
              </button>
              <button
                type="button"
                className={`nav-toggle${navOpen ? " open" : ""}`}
                aria-expanded={navOpen}
                aria-controls="site-navigation"
                aria-label={navOpen ? "Закрыть навигацию" : "Открыть навигацию"}
                onClick={() => setNavOpen((prev) => !prev)}
              >
                <span />
                <span />
                <span />
              </button>
            </nav>
          ) : (
            <div className="mobile-guest-actions">
              <Link className="btn btn-ghost header-compact-btn" to="/login">
                Войти
              </Link>
              <Link className="btn btn-primary header-compact-btn" to="/register">
                Регистрация
              </Link>
              <button
                type="button"
                className={`nav-toggle${navOpen ? " open" : ""}`}
                aria-expanded={navOpen}
                aria-controls="site-navigation"
                aria-label={navOpen ? "Закрыть навигацию" : "Открыть навигацию"}
                onClick={() => setNavOpen((prev) => !prev)}
              >
                <span />
                <span />
                <span />
              </button>
            </div>
          )}
        </div>
        <div className={`header-actions ${user ? "header-actions-auth" : "header-actions-guest"}${navOpen ? " open" : ""}`}>
          {user ? (
            <>
              <nav id="site-navigation" className="nav desktop-nav">
                {desktopNavItemsWithQuestions.map((item) => (
                  <NavLink key={item.to} to={item.to} end={item.end}>
                    {item.label}
                  </NavLink>
                ))}
              </nav>
              <nav className="nav mobile-menu-nav" aria-label="Дополнительные страницы">
                {mobileSecondaryNavItems.map((item) => (
                  <NavLink key={item.to} to={item.to} end={item.end}>
                    {item.label}
                  </NavLink>
                ))}
              </nav>
              <div className="auth-actions">
                <span className="user-chip">{user.profile?.full_name || user.email}</span>
                <button className="btn btn-ghost" onClick={logout}>
                  Выйти
                </button>
              </div>
            </>
          ) : (
            <>
              <nav id="site-navigation" className="nav desktop-nav marketing-nav" aria-label="Основные разделы">
                {marketingNavItems.map((item) => (
                  <a key={item.href} href={item.href}>
                    {item.label}
                  </a>
                ))}
              </nav>
              <nav className="nav mobile-menu-nav marketing-nav" aria-label="Основные разделы">
                {marketingNavItems.map((item) => (
                  <a key={item.href} href={item.href} onClick={() => setNavOpen(false)}>
                    {item.label}
                  </a>
                ))}
              </nav>
              <div className="auth-actions desktop-auth-actions">
                <Link className="btn btn-ghost" to="/login">
                  Войти
                </Link>
                <Link className="btn btn-primary" to="/register">
                  Регистрация
                </Link>
              </div>
            </>
          )}
        </div>
      </header>
      <main className="main">
        <Outlet context={outletContext} />
      </main>
      <footer id="contacts" className="footer">
        <div className="footer-copy">
          <strong>{conferenceTitle}</strong>
          <span>{subtitle}</span>
        </div>
        <div className="footer-links">
          {!user
            ? marketingNavItems.map((item) => (
                <a key={item.href} href={item.href}>
                  {item.label}
                </a>
              ))
            : null}
          <a href={`mailto:${conferenceSupportEmail}`}>Email: {conferenceSupportEmail}</a>
          <a href="tel:+79298920700">Телефон: 8 (929) 892-07-00</a>
          <Link to="/personal-data">Политика обработки данных</Link>
          <Link to="/consent-authors">Согласие авторов</Link>
          <span className="footer-legal">© 2026 {conferenceTitle}</span>
        </div>
      </footer>
    </div>
  );
}
