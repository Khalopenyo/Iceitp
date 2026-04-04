import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { clearToken, getToken, getUser, setUser } from "../lib/auth.js";
import { useEffect, useState } from "react";
import { apiGet } from "../lib/api.js";

export default function Layout() {
  const navigate = useNavigate();
  const [user, setUserState] = useState(getUser());
  const [scheduleMeta, setScheduleMeta] = useState(null);
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

  const logout = () => {
    clearToken();
    setUserState(null);
    setScheduleMeta(null);
    navigate("/");
  };

  const isPrivileged = !!user && ["admin", "org"].includes(user.role);
  const showMapLink = isPrivileged || (!!user && scheduleMeta && scheduleMeta.currentUserType !== "online");

  return (
    <div className="app">
      <header className="header">
        <Link className="brand" to="/">
          <div className="logo" aria-label="Логотип ИЦЭиТП">
            <img src="/LOGO1.svg" alt="Логотип ИЦЭиТП" />
          </div>
          <div>
            <div className="title">Научные конференции</div>
            <div className="subtitle"></div>
          </div>
        </Link>
        <nav className="nav">
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
      </header>
      <main className="main">
        <Outlet />
      </main>
      <footer className="footer">
        <div>© ИЦЭиТП · Платформа научных конференций</div>
        <div className="footer-links">
          <Link to="/personal-data">Политика обработки данных</Link>
          <Link to="/consent-authors">Согласие авторов</Link>
          <span>Поддержка: madinaborz@mail.ru</span>
        </div>
      </footer>
    </div>
  );
}
