import { Link } from "react-router-dom";

export default function NoAccess() {
  return (
    <section className="panel narrow">
      <h2>Недостаточно прав</h2>
      <p>У вас нет доступа к админ‑панели. Если это ошибка, обратитесь в оргкомитет.</p>
      <div className="form-actions">
        <Link className="btn btn-primary" to="/dashboard">
          В кабинет
        </Link>
        <Link className="btn btn-ghost" to="/">
          На главную
        </Link>
      </div>
    </section>
  );
}
