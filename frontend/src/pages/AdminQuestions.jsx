import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiDelete, apiGet, apiPatch } from "../lib/api.js";

const emptyPage = {
  items: [],
  total: 0,
  page: 1,
  page_size: 20,
};

const questionStatusLabels = {
  pending: "На модерации",
  approved: "Одобрен",
  rejected: "Отклонен",
};

function normalizePageResponse(response) {
  return {
    items: Array.isArray(response?.items) ? response.items : [],
    total: Number(response?.total) || 0,
    page: Number(response?.page) || 1,
    page_size: Number(response?.page_size) || emptyPage.page_size,
  };
}

function buildQuery(params) {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    searchParams.set(key, String(value));
  });
  const query = searchParams.toString();
  return query ? `?${query}` : "";
}

function PaginationControls({ page, pageSize, total, onPageChange }) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="row-actions">
      <span className="muted">
        Страница {page} из {totalPages} · всего {total}
      </span>
      <button
        type="button"
        className="btn btn-ghost"
        onClick={() => onPageChange(Math.max(1, page - 1))}
        disabled={page <= 1}
      >
        Назад
      </button>
      <button
        type="button"
        className="btn btn-ghost"
        onClick={() => onPageChange(Math.min(totalPages, page + 1))}
        disabled={page >= totalPages}
      >
        Вперед
      </button>
    </div>
  );
}

export default function AdminQuestions() {
  const navigate = useNavigate();
  const [questionsPage, setQuestionsPage] = useState(emptyPage);
  const [questionQr, setQuestionQr] = useState(null);
  const [questionQuery, setQuestionQuery] = useState("");
  const [questionStatusFilter, setQuestionStatusFilter] = useState("");
  const [questionActionKey, setQuestionActionKey] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const handleForbidden = () => {
    navigate("/forbidden", { replace: true });
  };

  const loadQuestions = async (page = questionsPage.page) => {
    try {
      setErrorMessage("");
      const response = await apiGet(
        `/admin/questions${buildQuery({
          page,
          page_size: questionsPage.page_size,
          q: questionQuery,
          status: questionStatusFilter,
        })}`
      );
      setQuestionsPage(normalizePageResponse(response));
    } catch (error) {
      if (error?.status === 403) {
        handleForbidden();
        return;
      }
      setErrorMessage(error?.message || "Не удалось загрузить вопросы.");
    }
  };

  const loadQuestionQR = async () => {
    try {
      setErrorMessage("");
      const response = await apiGet("/admin/questions/qr");
      setQuestionQr(response);
    } catch (error) {
      if (error?.status === 403) {
        handleForbidden();
        return;
      }
      setQuestionQr(null);
      setErrorMessage(error?.message || "Не удалось загрузить QR для вопросов.");
    }
  };

  useEffect(() => {
    loadQuestionQR();
  }, []);

  useEffect(() => {
    loadQuestions(1);
  }, [questionQuery, questionStatusFilter]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      loadQuestions(questionsPage.page);
    }, 4000);
    return () => window.clearInterval(timer);
  }, [questionsPage.page, questionQuery, questionStatusFilter]);

  const updateQuestionStatus = async (id, status) => {
    setQuestionActionKey(`${id}:${status}`);
    setErrorMessage("");
    try {
      await apiPatch(`/admin/questions/${id}`, { status });
      const statusLabels = {
        pending: "Вопрос возвращен в очередь.",
        approved: "Вопрос одобрен.",
        rejected: "Вопрос отклонен.",
      };
      setStatusMessage(statusLabels[status] || "Статус вопроса обновлен.");
      await loadQuestions(questionsPage.page);
    } catch (error) {
      setStatusMessage("");
      setErrorMessage(error.message || "Не удалось обновить статус вопроса.");
    } finally {
      setQuestionActionKey("");
    }
  };

  const deleteQuestion = async (id) => {
    if (!window.confirm("Удалить этот вопрос?")) {
      return;
    }

    setQuestionActionKey(`delete:${id}`);
    setErrorMessage("");
    try {
      await apiDelete(`/admin/questions/${id}`);
      setStatusMessage("Вопрос удален.");
      await loadQuestions(questionsPage.page);
    } catch (error) {
      setStatusMessage("");
      setErrorMessage(error.message || "Не удалось удалить вопрос.");
    } finally {
      setQuestionActionKey("");
    }
  };

  return (
    <section className="panel">
      <h2>Вопросы</h2>
      {statusMessage ? <p className="form-status success">{statusMessage}</p> : null}
      {errorMessage ? <p className="form-status error">{errorMessage}</p> : null}

      <div className="dashboard-layout">
        <aside className="dashboard-tabs">
          <button className="tab-btn" onClick={() => navigate("/admin/questions/approved")}>
            Одобренные вопросы
          </button>
          <button className="tab-btn" onClick={() => navigate("/admin")}>
            Назад в админку
          </button>
          <button className="tab-btn active" type="button">
            Модерация вопросов
          </button>
        </aside>

        <div className="dashboard-content">
          <div className="card">
            <h3>Модерация вопросов</h3>
            <p className="muted">Здесь отображаются все заданные вопросы. Новые вопросы подтягиваются автоматически.</p>

            {questionQr ? (
              <div className="question-qr-admin-card">
                <img src={questionQr.qr_data_url} alt="QR для вопросов" />
                <div className="question-qr-admin-body">
                  <strong>Отдельный QR для вопросов</strong>
                  <p className="muted">
                    Этот QR ведет только на форму вопросов и не затрагивает обычный QR бейджа.
                  </p>
                  <div className="row-actions">
                    <a className="btn btn-primary" href={questionQr.url} target="_blank" rel="noreferrer">
                      Открыть страницу вопросов
                    </a>
                    <a className="btn btn-ghost" href={questionQr.qr_data_url} download="questions-qr.png">
                      Скачать QR
                    </a>
                  </div>
                  <div className="muted question-qr-admin-link">{questionQr.url}</div>
                </div>
              </div>
            ) : null}

            <div className="form-grid">
              <label>
                Поиск
                <input
                  value={questionQuery}
                  onChange={(e) => setQuestionQuery(e.target.value)}
                  placeholder="Имя, email, текст вопроса"
                />
              </label>
              <label>
                Статус
                <select value={questionStatusFilter} onChange={(e) => setQuestionStatusFilter(e.target.value)}>
                  <option value="">Все</option>
                  <option value="pending">{questionStatusLabels.pending}</option>
                  <option value="approved">{questionStatusLabels.approved}</option>
                  <option value="rejected">{questionStatusLabels.rejected}</option>
                </select>
              </label>
            </div>

            <div className="table compact">
              {(questionsPage.items || []).map((question) => (
                <div key={question.id} className="row">
                  <div>
                    <strong>{question.author_name || question.user_email || "Участник"}</strong>
                    {question.user_email ? <div className="muted">{question.user_email}</div> : null}
                    <div className="muted">
                      {question.created_at ? new Date(question.created_at).toLocaleString() : "Дата не указана"}
                    </div>
                    <p>{question.text}</p>
                  </div>
                  <div className="row-actions">
                    <span className="pill">{questionStatusLabels[question.status] || question.status}</span>
                    <button
                      className="btn btn-ghost"
                      onClick={() => updateQuestionStatus(question.id, "approved")}
                      disabled={questionActionKey !== "" && questionActionKey !== `${question.id}:approved`}
                    >
                      {questionActionKey === `${question.id}:approved` ? "..." : "Одобрить"}
                    </button>
                    <button
                      className="btn btn-ghost"
                      onClick={() => updateQuestionStatus(question.id, "rejected")}
                      disabled={questionActionKey !== "" && questionActionKey !== `${question.id}:rejected`}
                    >
                      {questionActionKey === `${question.id}:rejected` ? "..." : "Отклонить"}
                    </button>
                    <button
                      className="btn btn-ghost"
                      onClick={() => updateQuestionStatus(question.id, "pending")}
                      disabled={questionActionKey !== "" && questionActionKey !== `${question.id}:pending`}
                    >
                      {questionActionKey === `${question.id}:pending` ? "..." : "В очередь"}
                    </button>
                    <button
                      className="btn btn-danger"
                      onClick={() => deleteQuestion(question.id)}
                      disabled={questionActionKey !== "" && questionActionKey !== `delete:${question.id}`}
                    >
                      {questionActionKey === `delete:${question.id}` ? "Удаление..." : "Удалить"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
            {questionsPage.items.length === 0 ? <p className="muted">Вопросов пока нет.</p> : null}
            <PaginationControls
              page={questionsPage.page}
              pageSize={questionsPage.page_size}
              total={questionsPage.total}
              onPageChange={loadQuestions}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
