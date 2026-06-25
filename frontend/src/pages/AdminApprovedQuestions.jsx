import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiGet } from "../lib/api.js";
import { Card } from "../components/ui/index.jsx";
import "./admin.css";

const emptyPage = {
  items: [],
  total: 0,
  page: 1,
  page_size: 100,
};

function normalizePageResponse(response) {
  return {
    items: Array.isArray(response?.items) ? response.items : [],
    total: Number(response?.total) || 0,
    page: Number(response?.page) || 1,
    page_size: Number(response?.page_size) || emptyPage.page_size,
  };
}

export default function AdminApprovedQuestions() {
  const navigate = useNavigate();
  const [questionsPage, setQuestionsPage] = useState(emptyPage);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let active = true;
    // Загрузчик определён внутри эффекта (setState только в .then/await-ветках —
    // не триггерит set-state-in-effect), вызывается на маунте и каждые 4с.
    const load = async () => {
      try {
        const response = await apiGet("/admin/questions?page=1&page_size=100&status=approved");
        if (!active) return;
        setQuestionsPage(normalizePageResponse(response));
        setErrorMessage("");
      } catch (error) {
        if (!active) return;
        if (error?.status === 403) {
          navigate("/forbidden", { replace: true });
          return;
        }
        setErrorMessage(error?.message || "Не удалось загрузить одобренные вопросы.");
      }
    };
    load();
    const timer = window.setInterval(load, 4000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [navigate]);

  return (
    <section className="adm">
      <div className="adm-head">
        <h1>Одобренные вопросы</h1>
        <p>Вопросы, прошедшие модерацию. Список обновляется автоматически.</p>
      </div>
      {errorMessage ? (
        <div className="ui-status ui-status-error" role="alert">
          {errorMessage}
        </div>
      ) : null}
      <Card>
        <div className="adm-board" aria-live="polite">
          {questionsPage.items.length > 0 ? (
            questionsPage.items.map((question) => (
              <article key={question.id} className="adm-board-item">
                <p>{question.text}</p>
              </article>
            ))
          ) : (
            <p className="adm-empty">Пока нет одобренных вопросов.</p>
          )}
        </div>
      </Card>
    </section>
  );
}
