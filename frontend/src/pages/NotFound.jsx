import { Link } from "react-router-dom";
import { buttonClassName } from "../components/ui/buttonClass.js";
import "./status-page.css";

export default function NotFound() {
  return (
    <section className="status-page">
      <div className="status-code">404</div>
      <h1>Страница не найдена</h1>
      <p>
        Возможно, ссылка устарела или страница была перемещена. Проверьте адрес или вернитесь на
        главную страницу конференции.
      </p>
      <div className="status-actions">
        <Link className={buttonClassName("primary")} to="/">
          На главную
        </Link>
        <Link className={buttonClassName("ghost")} to="/register">
          Регистрация
        </Link>
      </div>
    </section>
  );
}
