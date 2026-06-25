import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiDelete, apiGet, apiPatch } from "../lib/api.js";
import { Card, Field, Input, Select, Button, Badge } from "../components/ui/index.jsx";
import { Pagination } from "../components/ui/Pagination.jsx";
import { buttonClassName } from "../components/ui/buttonClass.js";
import "./admin.css";

const emptyPage = {
  items: [],
  total: 0,
  page: 1,
  page_size: 20,
};

const questionStatusLabels = {
  pending: "На модерации",
  approved: "Одобрен",
  rejected: "Отклонён",
};

const questionStatusBadge = {
  pending: "warn",
  approved: "success",
  rejected: "danger",
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
      const response = await apiGet(
        `/admin/questions${buildQuery({
          page,
          page_size: questionsPage.page_size,
          q: questionQuery,
          status: questionStatusFilter,
        })}`
      );
      setQuestionsPage(normalizePageResponse(response));
      setErrorMessage("");
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
      const response = await apiGet("/admin/questions/qr");
      setQuestionQr(response);
      setErrorMessage("");
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
        pending: "Вопрос возвращён в очередь.",
        approved: "Вопрос одобрен.",
        rejected: "Вопрос отклонён.",
      };
      setStatusMessage(statusLabels[status] || "Статус вопроса обновлён.");
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
      setStatusMessage("Вопрос удалён.");
      await loadQuestions(questionsPage.page);
    } catch (error) {
      setStatusMessage("");
      setErrorMessage(error.message || "Не удалось удалить вопрос.");
    } finally {
      setQuestionActionKey("");
    }
  };

  const actionBusy = questionActionKey !== "";

  return (
    <section className="adm">
      <div className="adm-head">
        <h1>Модерация вопросов</h1>
        <p>Все заданные вопросы. Новые подтягиваются автоматически.</p>
      </div>
      {statusMessage ? (
        <div className="ui-status ui-status-success" role="status">
          {statusMessage}
        </div>
      ) : null}
      {errorMessage ? (
        <div className="ui-status ui-status-error" role="alert">
          {errorMessage}
        </div>
      ) : null}

      <div className="adm-layout">
        <aside className="adm-tabs" aria-label="Разделы админки">
          <button type="button" className="adm-tab active" aria-current="page">
            Модерация вопросов
          </button>
          <button
            type="button"
            className="adm-tab"
            onClick={() => navigate("/admin/questions/approved")}
          >
            Одобренные вопросы
          </button>
          <button type="button" className="adm-tab" onClick={() => navigate("/admin")}>
            Назад в админку
          </button>
        </aside>

        <div className="adm-content">
          <Card>
            <h2 className="adm-card-title">Модерация вопросов</h2>
            <p className="adm-card-sub">
              Подтверждайте, отклоняйте или удаляйте вопросы участников.
            </p>

            {questionQr ? (
              <div className="adm-qr">
                <img src={questionQr.qr_data_url} alt="QR для вопросов" />
                <div className="adm-qr-body">
                  <strong>Отдельный QR для вопросов</strong>
                  <p>Этот QR ведёт только на форму вопросов и не затрагивает обычный QR бейджа.</p>
                  <div className="adm-qr-actions">
                    <a
                      className={buttonClassName("primary")}
                      href={questionQr.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Открыть страницу вопросов
                    </a>
                    <a
                      className={buttonClassName("ghost")}
                      href={questionQr.qr_data_url}
                      download="questions-qr.png"
                    >
                      Скачать QR
                    </a>
                  </div>
                  <div className="adm-qr-link">{questionQr.url}</div>
                </div>
              </div>
            ) : null}

            <div className="adm-form-grid">
              <Field label="Поиск" htmlFor="aq-search">
                <Input
                  id="aq-search"
                  value={questionQuery}
                  onChange={(e) => setQuestionQuery(e.target.value)}
                  placeholder="Имя, email, текст вопроса"
                />
              </Field>
              <Field label="Статус" htmlFor="aq-status">
                <Select
                  id="aq-status"
                  value={questionStatusFilter}
                  onChange={(e) => setQuestionStatusFilter(e.target.value)}
                >
                  <option value="">Все</option>
                  <option value="pending">{questionStatusLabels.pending}</option>
                  <option value="approved">{questionStatusLabels.approved}</option>
                  <option value="rejected">{questionStatusLabels.rejected}</option>
                </Select>
              </Field>
            </div>

            <div className="adm-table">
              {(questionsPage.items || []).map((question) => (
                <div key={question.id} className="adm-row">
                  <div className="adm-row-main">
                    <strong>{question.author_name || question.user_email || "Участник"}</strong>
                    {question.user_email ? (
                      <div className="adm-row-note">{question.user_email}</div>
                    ) : null}
                    <div className="adm-row-note">
                      {question.created_at
                        ? new Date(question.created_at).toLocaleString("ru-RU")
                        : "Дата не указана"}
                    </div>
                    <p>{question.text}</p>
                  </div>
                  <div className="adm-row-actions">
                    <Badge variant={questionStatusBadge[question.status] || "neutral"}>
                      {questionStatusLabels[question.status] || question.status}
                    </Badge>
                    <Button
                      variant="ghost"
                      onClick={() => updateQuestionStatus(question.id, "approved")}
                      disabled={actionBusy && questionActionKey !== `${question.id}:approved`}
                    >
                      {questionActionKey === `${question.id}:approved` ? "…" : "Одобрить"}
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => updateQuestionStatus(question.id, "rejected")}
                      disabled={actionBusy && questionActionKey !== `${question.id}:rejected`}
                    >
                      {questionActionKey === `${question.id}:rejected` ? "…" : "Отклонить"}
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => updateQuestionStatus(question.id, "pending")}
                      disabled={actionBusy && questionActionKey !== `${question.id}:pending`}
                    >
                      {questionActionKey === `${question.id}:pending` ? "…" : "В очередь"}
                    </Button>
                    <Button
                      variant="danger"
                      onClick={() => deleteQuestion(question.id)}
                      disabled={actionBusy && questionActionKey !== `delete:${question.id}`}
                    >
                      {questionActionKey === `delete:${question.id}` ? "Удаление…" : "Удалить"}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            {questionsPage.items.length === 0 ? (
              <p className="adm-empty">Вопросов пока нет.</p>
            ) : null}
            <Pagination
              page={questionsPage.page}
              pageSize={questionsPage.page_size}
              total={questionsPage.total}
              onPageChange={loadQuestions}
            />
          </Card>
        </div>
      </div>
    </section>
  );
}
