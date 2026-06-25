import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { apiGet } from "../lib/api.js";
import { Card } from "../components/ui/index.jsx";
import { buttonClassName } from "../components/ui/buttonClass.js";
import "./kiosk.css";

const emptyState = {
  conference: null,
  items: [],
};

export default function ApprovedQuestions() {
  const { token = "" } = useParams();
  const [data, setData] = useState(emptyState);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadApprovedQuestions(silent = false) {
      if (!token) {
        if (!cancelled) {
          setLoading(false);
          setErrorMessage("Ссылка на страницу вопросов недействительна.");
        }
        return;
      }

      if (!silent && !cancelled) {
        setLoading(true);
      }

      try {
        const response = await apiGet(`/questions/approved?token=${encodeURIComponent(token)}`, {
          suppressAuthRedirect: true,
        });
        if (!cancelled) {
          setData({
            conference: response?.conference || null,
            items: Array.isArray(response?.items) ? response.items : [],
          });
          setErrorMessage("");
        }
      } catch (error) {
        if (!cancelled) {
          if (!silent) {
            setData(emptyState);
          }
          setErrorMessage(error.message || "Не удалось загрузить одобренные вопросы.");
        }
      } finally {
        if (!cancelled && !silent) {
          setLoading(false);
        }
      }
    }

    loadApprovedQuestions();
    const timer = window.setInterval(() => {
      loadApprovedQuestions(true);
    }, 4000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [token]);

  if (!token) {
    return (
      <section className="kiosk">
        <Card>
          <h1>Одобренные вопросы</h1>
          <div className="kiosk-status kiosk-status-error" role="alert">
            Ссылка на страницу вопросов недействительна.
          </div>
        </Card>
      </section>
    );
  }

  return (
    <section className="kiosk kiosk-wide">
      <Card>
        <h1>Одобренные вопросы</h1>
        {loading ? (
          <div className="kiosk-status kiosk-status-info" role="status">
            Загружаю вопросы…
          </div>
        ) : null}
        {errorMessage ? (
          <div className="kiosk-status kiosk-status-error" role="alert">
            {errorMessage}
          </div>
        ) : null}

        {!loading && !errorMessage ? (
          <>
            <div className="kiosk-context">
              <strong>{data.conference?.title || "Конференция"}</strong>
              <p>Здесь появляются только вопросы, которые уже одобрил модератор.</p>
            </div>

            <div className="qa-board" aria-live="polite">
              {data.items.length > 0 ? (
                data.items.map((question) => (
                  <article key={question.id} className="qa-item">
                    <p>{question.text}</p>
                  </article>
                ))
              ) : (
                <p className="qa-empty">Пока нет одобренных вопросов.</p>
              )}
            </div>
          </>
        ) : null}

        <div className="kiosk-actions">
          <Link className={buttonClassName("ghost")} to={`/questions/${token}`}>
            К форме вопроса
          </Link>
          <Link className={buttonClassName("ghost")} to="/">
            На главную
          </Link>
        </div>
      </Card>
    </section>
  );
}
