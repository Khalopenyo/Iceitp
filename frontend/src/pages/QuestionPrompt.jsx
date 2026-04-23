import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { apiGet, apiPost } from "../lib/api.js";

const emptyContext = {
  conference: null,
};

export default function QuestionPrompt() {
  const { token = "" } = useParams();
  const [context, setContext] = useState(emptyContext);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [authorName, setAuthorName] = useState("");
  const [questionText, setQuestionText] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadContext() {
      if (!token) {
        setLoading(false);
        setErrorMessage("В ссылке отсутствует токен формы вопросов.");
        return;
      }

      setLoading(true);
      setErrorMessage("");
      try {
        const response = await apiGet(`/questions/public?token=${encodeURIComponent(token)}`, {
          suppressAuthRedirect: true,
        });
        if (!cancelled) {
          setContext({
            conference: response?.conference || null,
          });
        }
      } catch (error) {
        if (!cancelled) {
          setContext(emptyContext);
          setErrorMessage(error.message || "Не удалось загрузить форму вопросов.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadContext();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const submitQuestion = async (event) => {
    event.preventDefault();
    const trimmedName = authorName.trim();
    const trimmedQuestion = questionText.trim();
    if (!trimmedName) {
      setErrorMessage("Укажите имя.");
      return;
    }
    if (!trimmedQuestion) {
      setErrorMessage("Введите вопрос.");
      return;
    }

    setSubmitting(true);
    setStatusMessage("");
    setErrorMessage("");
    try {
      await apiPost(
        "/questions/public",
        {
          token,
          author_name: trimmedName,
          text: trimmedQuestion,
        },
        {
          suppressAuthRedirect: true,
        }
      );
      setQuestionText("");
      setStatusMessage("Вопрос отправлен модератору.");
    } catch (error) {
      setErrorMessage(error.message || "Не удалось отправить вопрос.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!token) {
    return (
      <section className="panel narrow">
        <h2>Задать вопрос</h2>
        <p className="form-status error">В ссылке отсутствует токен формы вопросов.</p>
      </section>
    );
  }

  return (
    <section className="panel narrow">
      <h2>Задать вопрос</h2>
      {loading ? <p className="form-status info">Загружаю форму вопросов...</p> : null}
      {statusMessage ? <p className="form-status success">{statusMessage}</p> : null}
      {errorMessage ? <p className="form-status error">{errorMessage}</p> : null}

      {!loading && !errorMessage ? (
        <>
          <div className="question-badge-context">
            <strong>{context.conference?.title || "Конференция"}</strong>
            <p className="muted">
              Укажите имя и отправьте вопрос. Он сразу попадет в админскую модерацию.
            </p>
          </div>

          <form className="form-grid" onSubmit={submitQuestion}>
            <label>
              Ваше имя
              <input
                value={authorName}
                onChange={(event) => setAuthorName(event.target.value)}
                placeholder="Как к вам обращаться"
                maxLength={255}
              />
            </label>
            <label>
              Ваш вопрос
              <textarea
                rows="5"
                value={questionText}
                onChange={(event) => setQuestionText(event.target.value)}
                placeholder="Напишите вопрос для модератора"
                maxLength={1000}
              />
            </label>
            <div className="form-actions">
              <button className="btn btn-primary" type="submit" disabled={submitting}>
                {submitting ? "Отправка..." : "Отправить вопрос"}
              </button>
            </div>
          </form>
        </>
      ) : null}

      <div className="form-actions">
        <Link className="btn btn-ghost" to="/">
          На главную
        </Link>
      </div>
    </section>
  );
}
