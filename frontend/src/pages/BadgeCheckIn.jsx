import { useEffect, useRef, useState } from "react";
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

function formatCheckInError(err) {
  if (err?.name === "AbortError") {
    return "Backend не ответил на запрос check-in за 8 секунд. Проверьте, что API запущен и доступен.";
  }
  if (err?.message === "Forbidden") {
    return "Отмечать присутствие по бейджу может только администратор или оргкомитет.";
  }
  return err?.message || "Не удалось отметить присутствие по QR.";
}

export default function BadgeCheckIn() {
  const { token = "" } = useParams();
  const attemptedRef = useRef("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [authRequired, setAuthRequired] = useState(false);

  const verifyBadge = async () => {
    setLoading(true);
    setErrorMessage("");
    setAuthRequired(false);
    const requestOptions = createCheckInRequestOptions();
    try {
      const currentUser = await apiGet("/me", {
        signal: requestOptions.signal,
        suppressAuthRedirect: true,
      });
      if (!currentUser?.role || !["admin", "org"].includes(currentUser.role)) {
        throw new Error("Forbidden");
      }
      const data = await apiPost(
        "/admin/checkin/verify",
        { token },
        {
          signal: requestOptions.signal,
          suppressAuthRedirect: true,
        }
      );
      setResult(data);
    } catch (err) {
      if (err?.message === "Request failed" || err?.message === "Unauthorized") {
        setAuthRequired(true);
      } else {
        setErrorMessage(formatCheckInError(err));
      }
    } finally {
      requestOptions.cleanup();
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!token) {
      return;
    }
    if (attemptedRef.current === token) {
      return;
    }
    attemptedRef.current = token;

    let cancelled = false;

    const verify = async () => {
      try {
        await verifyBadge();
      } catch (err) {
        if (!cancelled) {
          setErrorMessage(formatCheckInError(err));
        }
      }
    };

    verify();

    return () => {
      cancelled = true;
    };
  }, [token]);

  const retry = async () => {
    if (!token) {
      return;
    }
    attemptedRef.current = "";
    setResult(null);
    setErrorMessage("");
    try {
      await verifyBadge();
    } catch (err) {
      setErrorMessage(formatCheckInError(err));
    }
  };

  if (!token) {
    return (
      <section className="panel narrow">
        <h2>QR-код не найден</h2>
        <p className="form-status error">В ссылке отсутствует токен бейджа.</p>
        <div className="form-actions">
          <Link className="btn btn-primary" to="/">
            На главную
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="panel narrow">
      <h2>Отметка присутствия</h2>
      {loading ? <p className="form-status info">Проверяю права организатора и отмечаю участника...</p> : null}
      {authRequired ? (
        <p className="form-status info">
          Для отметки присутствия нужно войти под администратором или оргкомитетом.
        </p>
      ) : null}
      {errorMessage ? <p className="form-status error">{errorMessage}</p> : null}
      {result ? (
        <>
          <p className={`form-status ${result.already_checked_in ? "info" : "success"}`}>
            {result.already_checked_in
              ? "Присутствие уже было отмечено ранее."
              : "Присутствие успешно отмечено. Добро пожаловать на конференцию."}
          </p>
          <div className="form-grid">
            <label>
              Участник
              <input type="text" value={result.user?.full_name || ""} readOnly />
            </label>
            <label>
              Email
              <input type="text" value={result.user?.email || ""} readOnly />
            </label>
            <label>
              Конференция
              <input type="text" value={result.conference?.title || ""} readOnly />
            </label>
            <label>
              Время отметки
              <input type="text" value={formatDateTime(result.checked_in_at)} readOnly />
            </label>
          </div>
        </>
      ) : null}
      <div className="form-actions">
        {authRequired ? (
          <Link className="btn btn-primary" to={`/login?next=${encodeURIComponent(`/badge/${token}`)}`}>
            Войти как организатор
          </Link>
        ) : null}
        <button className="btn btn-primary" type="button" onClick={retry} disabled={loading}>
          {loading ? "Обработка..." : "Повторить"}
        </button>
        <Link className="btn btn-ghost" to="/">
          На главную
        </Link>
      </div>
    </section>
  );
}
