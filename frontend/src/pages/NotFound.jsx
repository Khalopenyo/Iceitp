import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Input } from "../components/ui/index.jsx";
import { buttonClassName } from "../components/ui/buttonClass.js";
import "./status-page.css";

export default function NotFound() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");

  // Глобального поиска по сайту нет — отправляем к программе как точке входа.
  const submit = (e) => {
    e.preventDefault();
    navigate("/program");
  };

  return (
    <section className="status-page">
      <div className="status-code">404</div>
      <h1>Страница не найдена</h1>
      <p>
        Похоже, такой страницы не существует или она была перемещена. Вернитесь на главную или
        откройте программу конференции.
      </p>
      <form className="status-subscribe" onSubmit={submit}>
        <span className="status-search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск по сайту"
            aria-label="Поиск по сайту"
          />
        </span>
      </form>
      <div className="status-actions">
        <Link className={buttonClassName("primary")} to="/">
          На главную
        </Link>
        <Link className={buttonClassName("ghost")} to="/program">
          Программа
        </Link>
      </div>
    </section>
  );
}
