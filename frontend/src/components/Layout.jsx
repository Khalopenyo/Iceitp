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
import { fetchBranding } from "../lib/org.js";
import StatusPlaceholder from "./StatusPlaceholder.jsx";

// Нейтральное имя платформы для тенант-фолбэков (как в AuthLayout) — без привязки
// к конкретному вузу/подразделению.
const PLATFORM_NAME = "КонференцХаб";

// Утилитарные публичные маршруты, доступные независимо от статуса публикации
// конференции (QR-чек-ин, вопросы со сцены, проверка сертификата, правовые
// документы, форбидден). Контентные маршруты (лендинг/программа/секции/спикеры/
// площадка/трансляции) гейтятся по статусу — см. ниже.
const PUB_UTILITY_PREFIXES = [
  "/badge", "/questions", "/verify", "/legal", "/personal-data",
  "/consent-authors", "/forbidden", "/feedback", "/map",
];

export default function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const [user, setUserState] = useState(getUser());
  const [conference, setConference] = useState(null);
  const [conferenceLoaded, setConferenceLoaded] = useState(false);
  const [branding, setBranding] = useState(null);
  const [brandingLoaded, setBrandingLoaded] = useState(false);
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    // Per-tenant header branding (logo/name + tenant status). Async setState (not
    // synchronous in the effect body), so it does not trip the set-state-in-effect
    // rule. brandingLoaded marks completion on BOTH success and failure so the
    // status gate can wait for it (and a failed /org never leaves it pending).
    fetchBranding()
      .then((value) => {
        if (value) setBranding(value);
      })
      .finally(() => setBrandingLoaded(true));
  }, []);

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
            setConferenceLoaded(true);
          }
        })
        .catch(() => {
          if (active) {
            setConference(null);
            setConferenceLoaded(true);
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
  // Фиксированная публичная навигация по реальным страницам витрины (как pubbar
  // макетов). Спикеры/Площадка добавятся, когда появятся их страницы.
  const marketingNavItems = [
    { to: "/about", label: "О конференции" },
    { to: "/program", label: "Программа" },
    { to: "/sections", label: "Секции" },
    { to: "/speakers", label: "Спикеры" },
    { to: "/venue", label: "Площадка" },
    { to: "/live", label: "Трансляции" },
  ];
  const desktopNavItems = user
    ? [
        { to: "/", label: "Главная", end: true },
        { to: "/dashboard", label: "Кабинет" },
        { to: "/documents", label: "Документы" },
        ...(showMapLink ? [{ to: "/map", label: "Карта" }] : []),
        { to: "/feedback", label: "Отзывы" },
        { to: "/chat", label: "Чат" },
        ...(["admin", "org", "staff"].includes(user.role) ? [{ to: "/console", label: "Консоль" }] : []),
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
      ]
    : [];
  // ADM-зона консолидирована в /console — старые /admin* ссылки убраны из легаси-Layout.
  const adminQuestionNavItem = null;
  const desktopNavItemsWithQuestions = adminQuestionNavItem
    ? [...desktopNavItems, adminQuestionNavItem]
    : desktopNavItems;
  const mobilePrimaryNavItemsWithQuestions = adminQuestionNavItem
    ? [...mobilePrimaryNavItems, adminQuestionNavItem]
    : mobilePrimaryNavItems;
  const conferenceTitle = getConferenceTitle(conference);
  const brandName = branding?.display_name?.trim() || conferenceTitle || PLATFORM_NAME;
  const conferenceSupportEmail = getConferenceSupportEmail(conference);
  const conferenceDateLabel = formatConferenceDateRange(conference?.starts_at, conference?.ends_at);
  const conferenceStatusLabel = getConferenceStatusLabel(conference?.status);
  const subtitle =
    [conferenceDateLabel, conferenceStatusLabel].filter(Boolean).join(" · ") ||
    "Платформа организации научной конференции";
  const outletContext = {
    conference,
    conferenceLoaded,
    conferenceTitle,
    conferenceDateLabel,
    conferenceStatusLabel,
    conferenceSupportEmail,
  };

  // ── Гейт публичной зоны по статусу (SCR-PUB-15) ──
  // Публикация в консоли (draft→live) реально управляет видимостью сайта:
  //   suspended (тенант) → ВСЯ зона заблокирована (включая утилитарные маршруты);
  //   нет конференции / черновик → «скоро откроется» (черновик команда видит как превью);
  //   finished → страница с материалами.
  // Утилитарные маршруты (PUB_UTILITY_PREFIXES) доступны при любом СТАТУСЕ ПУБЛИКАЦИИ,
  // но не у приостановленного тенанта. Гейтим только после загрузки И конференции,
  // И брендинга — иначе мелькнёт реальный контент до того, как применится статус.
  const isUtilityRoute = PUB_UTILITY_PREFIXES.some(
    (p) => location.pathname === p || location.pathname.startsWith(`${p}/`)
  );
  const isTenantStaff = Boolean(user && ["org", "admin", "staff"].includes(user.role));
  const draftHiddenFromPublic = conference?.status === "draft" && !isTenantStaff;
  const pubLoaded = conferenceLoaded && brandingLoaded;

  // Оболочка с минимальным брендом для заглушек/загрузки публичной зоны.
  const pubShell = (children) => (
    <div className="app">
      <header className="header">
        <Link className="brand" to="/">
          {branding?.logo_url ? (
            <div className="logo" aria-label={`Логотип ${brandName}`}>
              <img src={branding.logo_url} alt={`Логотип ${brandName}`} />
            </div>
          ) : null}
          <div className="brand-copy">
            <div className="title">{brandName}</div>
          </div>
        </Link>
      </header>
      <main className="main">{children}</main>
    </div>
  );

  // 1. Приостановленный тенант — вся зона тёмная (раньше allowlist'а утилитарных).
  if (pubLoaded && branding?.status === "suspended") {
    return pubShell(<StatusPlaceholder variant="suspended" supportEmail={conferenceSupportEmail} />);
  }
  // 2. Контентные маршруты: пока грузимся — нейтральный экран (без мигания контентом),
  //    затем заглушка по статусу публикации; live / превью-черновик → обычный сайт.
  if (!isUtilityRoute) {
    if (!pubLoaded) {
      return pubShell(<div role="status" aria-busy="true" aria-label="Загрузка" style={{ minHeight: "40vh" }} />);
    }
    if (!conference || draftHiddenFromPublic) {
      return pubShell(
        <StatusPlaceholder
          variant="not-published"
          title={conference ? conferenceTitle : undefined}
          dateLabel={conference ? conferenceDateLabel : undefined}
        />
      );
    }
    if (conference.status === "finished") {
      return pubShell(
        <StatusPlaceholder variant="finished" title={conferenceTitle} dateLabel={conferenceDateLabel} supportEmail={conferenceSupportEmail} />
      );
    }
  }

  return (
    <div className="app">
      {conference?.status === "draft" && isTenantStaff ? (
        <div
          role="status"
          style={{
            background: "#fef3c7", color: "#92400e", textAlign: "center",
            padding: "8px 16px", fontSize: 13.5, fontWeight: 500,
          }}
        >
          Черновик — сайт виден только команде. Опубликуйте его в консоли, чтобы открыть регистрацию.{" "}
          <Link to="/console" style={{ color: "#7c2d12", fontWeight: 600, textDecoration: "underline" }}>
            Перейти в консоль →
          </Link>
        </div>
      ) : null}
      <header className="header">
        <Link
          className="brand"
          to="/"
          onClick={() => {
            setNavOpen(false);
          }}
        >
          {branding?.logo_url ? (
            <div className="logo" aria-label={`Логотип ${brandName}`}>
              <img src={branding.logo_url} alt={`Логотип ${brandName}`} />
            </div>
          ) : null}
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
                  <NavLink key={item.to} to={item.to}>
                    {item.label}
                  </NavLink>
                ))}
              </nav>
              <nav className="nav mobile-menu-nav marketing-nav" aria-label="Основные разделы">
                {marketingNavItems.map((item) => (
                  <NavLink key={item.to} to={item.to} onClick={() => setNavOpen(false)}>
                    {item.label}
                  </NavLink>
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
                <Link key={item.to} to={item.to}>
                  {item.label}
                </Link>
              ))
            : null}
          {conferenceSupportEmail ? (
            <a href={`mailto:${conferenceSupportEmail}`}>Email: {conferenceSupportEmail}</a>
          ) : null}
          {conference?.support_phone ? (
            <a href={`tel:${conference.support_phone}`}>Телефон: {conference.support_phone}</a>
          ) : null}
          <Link to="/personal-data">Политика обработки данных</Link>
          <Link to="/consent-authors">Согласие авторов</Link>
          <span className="footer-legal">© 2026 {conferenceTitle}</span>
        </div>
      </footer>
    </div>
  );
}
