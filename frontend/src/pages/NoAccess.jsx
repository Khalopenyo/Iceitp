import { Link } from "react-router-dom";
import { buttonClassName } from "../components/ui/buttonClass.js";
import "./status-page.css";

export default function NoAccess() {
  return (
    <section className="status-page">
      <div className="status-code">403</div>
      <h1>Недостаточно прав</h1>
      <p>
        У вас нет доступа к этому разделу. Если это ошибка, обратитесь в оргкомитет конференции.
      </p>
      <div className="status-actions">
        <Link className={buttonClassName("primary")} to="/dashboard">
          В кабинет
        </Link>
        <Link className={buttonClassName("ghost")} to="/">
          На главную
        </Link>
      </div>
    </section>
  );
}
