import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { clearToken, getToken, getUser, setUser } from "../lib/auth.js";
import { useEffect, useState } from "react";
import { apiGet } from "../lib/api.js";
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
  const [scheduleMeta, setScheduleMeta] = useState(null);
  const [conference, setConference] = useState(null);
  const [navOpen, setNavOpen] = useState(false);
  const token = getToken();

  useEffect(() => {
    if (!token) {
      setScheduleMeta(null);
      return;
    }
    apiGet("/me")
      .then((data) => {
        setUser(data);
        setUserState(data);
      })
      .catch(() => {
        clearToken();
        setUserState(null);
        setScheduleMeta(null);
      });

    apiGet("/schedule")
      .then((data) => {
        setScheduleMeta({
          assignmentStatus: data?.assignment_status || "pending",
          currentUserType: data?.current_user_type || "",
        });
      })
      .catch(() => setScheduleMeta(null));
  }, [token]);

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

  const logout = () => {
    clearToken();
    setUserState(null);
    setScheduleMeta(null);
    setNavOpen(false);
    navigate("/");
  };

  const isPrivileged = !!user && ["admin", "org"].includes(user.role);
  const showMapLink = isPrivileged || (!!user && scheduleMeta && scheduleMeta.currentUserType !== "online");
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
        <div className={`header-actions${navOpen ? " open" : ""}`}>
          <nav id="site-navigation" className="nav">
            {user ? (
              <>
                <NavLink to="/" end>
                  Главная
                </NavLink>
                <NavLink to="/dashboard">Кабинет</NavLink>
                <NavLink to="/documents">Документы</NavLink>
                {showMapLink && <NavLink to="/map">Карта</NavLink>}
                <NavLink to="/feedback">Отзывы</NavLink>
                <NavLink to="/chat">Чат</NavLink>
                {["admin", "org"].includes(user.role) && <NavLink to="/admin">Админка</NavLink>}
              </>
            ) : (
              <>
                <NavLink to="/" end>
                  Главная
                </NavLink>
                <NavLink to="/login">Вход</NavLink>
                <NavLink to="/register">Регистрация</NavLink>
              </>
            )}
          </nav>
          <div className="auth-actions">
            {user ? (
              <>
                <span className="user-chip">{user.profile?.full_name || user.email}</span>
                <button className="btn btn-ghost" onClick={logout}>
                  Выйти
                </button>
              </>
            ) : (
              <Link className="btn btn-primary" to="/login">
                Войти
              </Link>
            )}
          </div>
        </div>
      </header>
      <main className="main">
        <Outlet context={outletContext} />
      </main>
      <footer className="footer">
        <div className="footer-copy">
          <strong>{conferenceTitle}</strong>
          <span>{subtitle}</span>
        </div>
        <div className="footer-links">
          <Link to="/personal-data">Политика обработки данных</Link>
          <Link to="/consent-authors">Согласие авторов</Link>
          <a href={`mailto:${conferenceSupportEmail}`}>Поддержка: {conferenceSupportEmail}</a>
        </div>
      </footer>
    </div>
  );
}
