import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { apiGet, apiPost } from "../lib/api.js";
import { Card, Field, Textarea, Button } from "../components/ui/index.jsx";
import { buttonClassName } from "../components/ui/buttonClass.js";
import "./kiosk.css";

const emptyContext = {
  conference: null,
};

export default function QuestionPrompt() {
  const { token = "" } = useParams();
  const [context, setContext] = useState(emptyContext);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [questionText, setQuestionText] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadContext() {
      if (!token) {
        setLoading(false);
        setErrorMessage("Ссылка на форму вопросов недействительна.");
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
    const trimmedQuestion = questionText.trim();
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
      <section className="kiosk">
        <Card>
          <h1>Задать вопрос</h1>
          <div className="kiosk-status kiosk-status-error" role="alert">
            Ссылка на форму вопросов недействительна.
          </div>
        </Card>
      </section>
    );
  }

  return (
    <section className="kiosk">
      <Card>
        <h1>Задать вопрос</h1>
        {loading ? (
          <div className="kiosk-status kiosk-status-info" role="status">
            Загружаю форму вопросов…
          </div>
        ) : null}
        {statusMessage ? (
          <div className="kiosk-status kiosk-status-success" role="status">
            {statusMessage}
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
              <strong>{context.conference?.title || "Конференция"}</strong>
              <p>Введите вопрос и отправьте его. Он сразу попадёт в админскую модерацию.</p>
            </div>

            <form onSubmit={submitQuestion}>
              <Field label="Ваш вопрос" htmlFor="qp-text">
                <Textarea
                  id="qp-text"
                  rows={5}
                  value={questionText}
                  onChange={(event) => setQuestionText(event.target.value)}
                  placeholder="Напишите вопрос для модератора"
                  maxLength={1000}
                />
              </Field>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Отправка…" : "Отправить вопрос"}
              </Button>
            </form>
          </>
        ) : null}

        <div className="kiosk-actions">
          <Link className={buttonClassName("ghost")} to="/">
            На главную
          </Link>
        </div>
      </Card>
    </section>
  );
}
