import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { apiGet, apiPost } from "../lib/api.js";
import { Card } from "../components/ui/index.jsx";
import { buttonClassName } from "../components/ui/buttonClass.js";
import "./kiosk.css";

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
    return "Сервер слишком долго отвечает. Попробуйте ещё раз чуть позже.";
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
      <section className="kiosk">
        <Card>
          <h1>Проверка бейджа</h1>
          <div className="kiosk-status kiosk-status-error" role="alert">
            Ссылка на бейдж недействительна.
          </div>
        </Card>
      </section>
    );
  }

  if (authRequired) {
    return (
      <section className="kiosk">
        <Card>
          <h1>Проверка бейджа</h1>
          <div className="kiosk-status kiosk-status-info" role="status">
            Для отметки участника войдите под администратором или оргкомитетом.
          </div>
          <div className="kiosk-actions">
            <Link
              className={buttonClassName("primary")}
              to={`/login?next=${encodeURIComponent(`/badge/${token}`)}`}
            >
              Войти
            </Link>
          </div>
        </Card>
      </section>
    );
  }

  return (
    <section className="kiosk">
      <Card>
        <h1>Проверка бейджа</h1>
        {loading ? (
          <div className="kiosk-status kiosk-status-info" role="status">
            Проверяю бейдж и отмечаю участника…
          </div>
        ) : null}
        {errorMessage ? (
          <div className="kiosk-status kiosk-status-error" role="alert">
            {errorMessage}
          </div>
        ) : null}

        {!loading && result ? (
          <div className="kiosk-context">
            <strong>{result.user?.full_name || "Участник"}</strong>
            <p>{result.conference?.title || "Конференция"}</p>
            <div
              className={`kiosk-status ${
                result.already_checked_in ? "kiosk-status-info" : "kiosk-status-success"
              }`}
              role="status"
            >
              {result.already_checked_in
                ? "Участник уже был отмечен ранее."
                : "Присутствие отмечено успешно."}
            </div>
            <p className="kiosk-time">Время: {formatDateTime(result.checked_in_at)}</p>
          </div>
        ) : null}
      </Card>
    </section>
  );
}
