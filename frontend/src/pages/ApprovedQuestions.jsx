import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { apiGet } from "../lib/api.js";

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
      <section className="panel narrow">
        <h2>Одобренные вопросы</h2>
        <p className="form-status error">Ссылка на страницу вопросов недействительна.</p>
      </section>
    );
  }

  return (
    <section className="panel">
      <h2>Одобренные вопросы</h2>
      {loading ? <p className="form-status info">Загружаю вопросы...</p> : null}
      {errorMessage ? <p className="form-status error">{errorMessage}</p> : null}

      {!loading && !errorMessage ? (
        <>
          <div className="question-badge-context">
            <strong>{data.conference?.title || "Конференция"}</strong>
            <p className="muted">Здесь появляются только вопросы, которые уже одобрил модератор.</p>
          </div>

          <div className="question-board">
            {data.items.length > 0 ? (
              data.items.map((question) => (
                <article key={question.id} className="question-board-item">
                  <p>{question.text}</p>
                </article>
              ))
            ) : (
              <p className="muted">Пока нет одобренных вопросов.</p>
            )}
          </div>
        </>
      ) : null}

      <div className="form-actions">
        <Link className="btn btn-ghost" to={`/questions/${token}`}>
          К форме вопроса
        </Link>
        <Link className="btn btn-ghost" to="/">
          На главную
        </Link>
      </div>
    </section>
  );
}
