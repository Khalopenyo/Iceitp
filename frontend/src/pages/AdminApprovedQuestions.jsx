import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiGet } from "../lib/api.js";

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

  const loadQuestions = async () => {
    try {
      setErrorMessage("");
      const response = await apiGet("/admin/questions?page=1&page_size=100&status=approved");
      setQuestionsPage(normalizePageResponse(response));
    } catch (error) {
      if (error?.status === 403) {
        navigate("/forbidden", { replace: true });
        return;
      }
      setErrorMessage(error?.message || "Не удалось загрузить одобренные вопросы.");
    }
  };

  useEffect(() => {
    loadQuestions();
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      loadQuestions();
    }, 4000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <section className="panel">
      <h2>Вопросы</h2>
      {errorMessage ? <p className="form-status error">{errorMessage}</p> : null}

      <div className="dashboard-layout">
        <aside className="dashboard-tabs">
          <button className="tab-btn active" type="button">
            Одобренные вопросы
          </button>
          <button className="tab-btn" onClick={() => navigate("/admin/questions")}>
            К модерации
          </button>
          <button className="tab-btn" onClick={() => navigate("/admin")}>
            Назад в админку
          </button>
        </aside>

        <div className="dashboard-content">
          <div className="card">
            <div className="question-board">
              {questionsPage.items.length > 0 ? (
                questionsPage.items.map((question) => (
                  <article key={question.id} className="question-board-item">
                    <p>{question.text}</p>
                  </article>
                ))
              ) : (
                <p className="muted">Пока нет одобренных вопросов.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
