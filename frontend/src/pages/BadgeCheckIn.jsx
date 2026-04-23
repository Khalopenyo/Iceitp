import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { apiGet, apiPost } from "../lib/api.js";

function formatDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function createCheckInRequestOptions() {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 8000);
  return {
    signal: controller.signal,
    cleanup() {
      window.clearTimeout(timeoutId);
    },
  };
}

function formatCheckInError(error) {
  if (error?.name === "AbortError") {
    return "Сервер слишком долго отвечает. Попробуйте еще раз чуть позже.";
  }
  if (error?.status === 403) {
    return "Отмечать присутствие могут только администратор или оргкомитет.";
  }
  return error?.message || "Не удалось проверить бейдж.";
}

export default function BadgeCheckIn() {
  const { token = "" } = useParams();
  const [loading, setLoading] = useState(true);
  const [authRequired, setAuthRequired] = useState(false);
  const [result, setResult] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function verifyBadge() {
      if (!token) {
        setErrorMessage("Ссылка на бейдж недействительна.");
        setLoading(false);
        return;
      }

      setLoading(true);
      setAuthRequired(false);
      setResult(null);
      setErrorMessage("");

      let viewer = null;
      try {
        viewer = await apiGet("/me", { suppressAuthRedirect: true });
      } catch {
        if (!cancelled) {
          setAuthRequired(true);
          setLoading(false);
        }
        return;
      }

      if (!viewer || !["admin", "org"].includes(viewer.role)) {
        if (!cancelled) {
          setErrorMessage("Отмечать присутствие могут только администратор или оргкомитет.");
          setLoading(false);
        }
        return;
      }

      const requestOptions = createCheckInRequestOptions();
      try {
        const response = await apiPost(
          "/admin/checkin/verify",
          { token },
          {
            suppressAuthRedirect: true,
            signal: requestOptions.signal,
          }
        );
        if (!cancelled) {
          setResult(response);
        }
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(formatCheckInError(error));
        }
      } finally {
        requestOptions.cleanup();
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    verifyBadge();
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (!token) {
    return (
      <section className="panel narrow">
        <h2>Проверка бейджа</h2>
        <p className="form-status error">Ссылка на бейдж недействительна.</p>
      </section>
    );
  }

  if (authRequired) {
    return (
      <section className="panel narrow">
        <h2>Проверка бейджа</h2>
        <p className="form-status info">
          Для отметки участника войдите под администратором или оргкомитетом.
        </p>
        <div className="form-actions">
          <Link className="btn btn-primary" to={`/login?next=${encodeURIComponent(`/badge/${token}`)}`}>
            Войти
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="panel narrow">
      <h2>Проверка бейджа</h2>
      {loading ? <p className="form-status info">Проверяю бейдж и отмечаю участника...</p> : null}
      {errorMessage ? <p className="form-status error">{errorMessage}</p> : null}

      {!loading && result ? (
        <div className="question-badge-context">
          <strong>{result.user?.full_name || "Участник"}</strong>
          <p className="muted">{result.conference?.title || "Конференция"}</p>
          <p className={`form-status ${result.already_checked_in ? "info" : "success"}`}>
            {result.already_checked_in
              ? "Участник уже был отмечен ранее."
              : "Присутствие отмечено успешно."}
          </p>
          <p className="muted">Время: {formatDateTime(result.checked_in_at)}</p>
        </div>
      ) : null}
    </section>
  );
}
