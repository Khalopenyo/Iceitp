import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiDelete, apiGet, apiPut } from "../lib/api.js";
import { triggerBlobDownload } from "../lib/download.js";
import { Card, Field, Input, Select, Button, Badge } from "../components/ui/index.jsx";
import "./admin.css";

const emptyPage = {
  items: [],
  total: 0,
  page: 1,
  page_size: 20,
};

function buildPreviewSrc(url) {
  if (!url) {
    return "";
  }
  return `${url}#toolbar=0&navpanes=0&scrollbar=0&zoom=page-width&view=FitH`;
}

function formatBadgeFilename(id, fullName) {
  const safeName = String(fullName || `user-${id}`)
    .trim()
    .replace(/[^\p{L}\p{N}\-_]+/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return `badge-${safeName || id}.pdf`;
}

const roleLabels = {
  participant: "Участник",
  org: "Оргкомитет",
  admin: "Администратор",
};

const roleBadge = {
  participant: "neutral",
  org: "brand",
  admin: "warn",
};

const userTypeLabels = {
  offline: "Оффлайн",
  online: "Онлайн",
};

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
    <div className="adm-pagination">
      <span>
        Страница {page} из {totalPages} · всего {total}
      </span>
      <Button
        variant="ghost"
        type="button"
        onClick={() => onPageChange(Math.max(1, page - 1))}
        disabled={page <= 1}
      >
        Назад
      </Button>
      <Button
        variant="ghost"
        type="button"
        onClick={() => onPageChange(Math.min(totalPages, page + 1))}
        disabled={page >= totalPages}
      >
        Вперёд
      </Button>
    </div>
  );
}

export default function Admin() {
  const navigate = useNavigate();
  const [usersPage, setUsersPage] = useState(emptyPage);
  const [feedbackPage, setFeedbackPage] = useState(emptyPage);
  const [tab, setTab] = useState("users");
  const [adminStatusMessage, setAdminStatusMessage] = useState("");
  const [adminErrorMessage, setAdminErrorMessage] = useState("");

  const [userQuery, setUserQuery] = useState("");
  const [userRoleFilter, setUserRoleFilter] = useState("");
  const [userTypeFilter, setUserTypeFilter] = useState("");
  const [userBadgeFilter, setUserBadgeFilter] = useState("");

  const [feedbackQuery, setFeedbackQuery] = useState("");
  const [feedbackRatingFilter, setFeedbackRatingFilter] = useState("");
  const [badgeActionKey, setBadgeActionKey] = useState("");
  const [previewBadge, setPreviewBadge] = useState(null);

  useEffect(
    () => () => {
      if (previewBadge?.url) {
        window.URL.revokeObjectURL(previewBadge.url);
      }
    },
    [previewBadge]
  );

  const setAdminStatus = (message) => {
    setAdminErrorMessage("");
    setAdminStatusMessage(message);
  };

  const setAdminError = (message) => {
    setAdminStatusMessage("");
    setAdminErrorMessage(message);
  };

  const handleForbidden = () => {
    navigate("/forbidden", { replace: true });
  };

  const handleAdminRequestError = (error, fallbackMessage) => {
    if (error?.status === 403) {
      handleForbidden();
      return;
    }
    setAdminError(error?.message || fallbackMessage);
  };

  const loadUsers = async (page = usersPage.page) => {
    try {
      const response = await apiGet(
        `/admin/users${buildQuery({
          page,
          page_size: usersPage.page_size,
          q: userQuery,
          role: userRoleFilter,
          user_type: userTypeFilter,
          badge_issued: userBadgeFilter,
        })}`
      );
      setUsersPage(response);
    } catch (error) {
      handleAdminRequestError(error, "Не удалось загрузить пользователей.");
    }
  };

  const loadFeedback = async (page = feedbackPage.page) => {
    try {
      const response = await apiGet(
        `/admin/feedback${buildQuery({
          page,
          page_size: feedbackPage.page_size,
          q: feedbackQuery,
          rating: feedbackRatingFilter,
        })}`
      );
      setFeedbackPage(response);
    } catch (error) {
      setFeedbackPage(emptyPage);
      if (error?.status === 403) {
        handleForbidden();
        return;
      }
      setAdminError(error?.message || "Не удалось загрузить отзывы.");
    }
  };

  useEffect(() => {
    loadUsers(1);
  }, [userQuery, userRoleFilter, userTypeFilter, userBadgeFilter]);

  useEffect(() => {
    loadFeedback(1);
  }, [feedbackQuery, feedbackRatingFilter]);

  useEffect(() => {
    if (!previewBadge) {
      return undefined;
    }
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        closeBadgePreview();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewBadge]);

  const updateRole = async (id, role) => {
    try {
      await apiPut(`/admin/users/${id}/role`, { role });
      setAdminStatus("Роль пользователя обновлена.");
      loadUsers(usersPage.page);
    } catch (error) {
      handleAdminRequestError(error, "Не удалось обновить роль пользователя.");
    }
  };

  const setBadgeIssued = async (id, badgeIssued) => {
    try {
      await apiPut(`/admin/users/${id}/badge`, { badge_issued: badgeIssued });
      setAdminStatus(
        badgeIssued ? "Бейдж подготовлен и доступен участнику." : "Доступ к бейджу отключён."
      );
      loadUsers(usersPage.page);
    } catch (err) {
      setAdminError(err.message || "Не удалось изменить статус бейджа.");
    }
  };

  const downloadUserBadge = async (id, fullName) => {
    setBadgeActionKey(`download:${id}`);
    try {
      const response = await apiGet(`/admin/users/${id}/badge`);
      const blob = await response.blob();
      triggerBlobDownload(blob, formatBadgeFilename(id, fullName));
      setAdminStatus("Бейдж скачан из админки.");
    } catch (err) {
      setAdminError(err.message || "Не удалось скачать бейдж.");
    } finally {
      setBadgeActionKey("");
    }
  };

  const openUserBadge = async (id, fullName) => {
    setBadgeActionKey(`preview:${id}`);
    setAdminErrorMessage("");
    try {
      const response = await apiGet(`/admin/users/${id}/badge`);
      const blob = await response.blob();
      const nextUrl = window.URL.createObjectURL(blob);
      if (previewBadge?.url) {
        window.URL.revokeObjectURL(previewBadge.url);
      }
      setPreviewBadge({
        userId: id,
        fullName,
        title: `Бейдж участника: ${fullName || `#${id}`}`,
        filename: formatBadgeFilename(id, fullName),
        url: nextUrl,
      });
      setAdminStatus("Бейдж открыт для просмотра.");
    } catch (err) {
      setAdminError(err.message || "Не удалось открыть бейдж.");
    } finally {
      setBadgeActionKey("");
    }
  };

  const closeBadgePreview = () => {
    if (previewBadge?.url) {
      window.URL.revokeObjectURL(previewBadge.url);
    }
    setPreviewBadge(null);
  };

  const deleteUser = async (id) => {
    if (!window.confirm("Удалить пользователя и связанные данные?")) return;
    try {
      await apiDelete(`/admin/users/${id}`);
      setAdminStatus("Пользователь удалён.");
      loadUsers(Math.max(1, usersPage.page));
    } catch (error) {
      handleAdminRequestError(error, "Не удалось удалить пользователя.");
    }
  };

  return (
    <section className="adm">
      <div className="adm-head">
        <h1>Администрирование</h1>
        <p>Управление участниками, бейджами и обратной связью конференции.</p>
      </div>
      {adminStatusMessage ? (
        <div className="ui-status ui-status-success" role="status">
          {adminStatusMessage}
        </div>
      ) : null}
      {adminErrorMessage ? (
        <div className="ui-status ui-status-error" role="alert">
          {adminErrorMessage}
        </div>
      ) : null}

      <div className="adm-layout">
        <aside className="adm-tabs" aria-label="Разделы админки">
          <button
            type="button"
            className={`adm-tab ${tab === "users" ? "active" : ""}`}
            aria-pressed={tab === "users"}
            onClick={() => setTab("users")}
          >
            Пользователи
          </button>
          <button
            type="button"
            className={`adm-tab ${tab === "feedback" ? "active" : ""}`}
            aria-pressed={tab === "feedback"}
            onClick={() => setTab("feedback")}
          >
            Отзывы
          </button>
          <button type="button" className="adm-tab" onClick={() => navigate("/admin/questions")}>
            Вопросы
          </button>
        </aside>

        <div className="adm-content">
          {tab === "users" ? (
            <Card>
              <h2 className="adm-card-title">Пользователи</h2>
              <p className="adm-card-sub">Роли, бейджи и доступ участников конференции.</p>
              <div className="adm-form-grid">
                <Field label="Поиск" htmlFor="adm-user-search">
                  <Input
                    id="adm-user-search"
                    value={userQuery}
                    onChange={(e) => setUserQuery(e.target.value)}
                    placeholder="ФИО, email, организация, телефон"
                  />
                </Field>
                <Field label="Роль" htmlFor="adm-user-role">
                  <Select
                    id="adm-user-role"
                    value={userRoleFilter}
                    onChange={(e) => setUserRoleFilter(e.target.value)}
                  >
                    <option value="">Все</option>
                    <option value="participant">{roleLabels.participant}</option>
                    <option value="org">{roleLabels.org}</option>
                    <option value="admin">{roleLabels.admin}</option>
                  </Select>
                </Field>
                <Field label="Формат участия" htmlFor="adm-user-type">
                  <Select
                    id="adm-user-type"
                    value={userTypeFilter}
                    onChange={(e) => setUserTypeFilter(e.target.value)}
                  >
                    <option value="">Все</option>
                    <option value="offline">{userTypeLabels.offline}</option>
                    <option value="online">{userTypeLabels.online}</option>
                  </Select>
                </Field>
                <Field label="Бейдж" htmlFor="adm-user-badge">
                  <Select
                    id="adm-user-badge"
                    value={userBadgeFilter}
                    onChange={(e) => setUserBadgeFilter(e.target.value)}
                  >
                    <option value="">Все</option>
                    <option value="true">готов</option>
                    <option value="false">не готов</option>
                  </Select>
                </Field>
              </div>

              <div className="adm-table">
                {usersPage.items.map((user) => (
                  <div key={user.id} className="adm-row">
                    <div className="adm-row-main">
                      <strong>{user.profile?.full_name || user.email}</strong>
                      <div className="adm-row-note">
                        {user.email} · {userTypeLabels[user.user_type] || "Участник"}
                      </div>
                      {user.profile?.organization ? (
                        <div className="adm-row-note">{user.profile.organization}</div>
                      ) : null}
                    </div>
                    <div className="adm-row-actions">
                      <Badge variant={roleBadge[user.role] || "neutral"}>
                        {roleLabels[user.role] || user.role}
                      </Badge>
                      {user.user_type === "offline" ? (
                        <Badge variant={user.badge_issued ? "success" : "neutral"}>
                          {user.badge_issued ? "Бейдж готов" : "Бейдж не подготовлен"}
                        </Badge>
                      ) : (
                        <Badge variant="neutral">Без бейджа</Badge>
                      )}
                      <Button variant="ghost" onClick={() => updateRole(user.id, "org")}>
                        Оргкомитет
                      </Button>
                      <Button variant="ghost" onClick={() => updateRole(user.id, "admin")}>
                        Админ
                      </Button>
                      {user.user_type === "offline" ? (
                        <>
                          <Button
                            variant="ghost"
                            onClick={() => setBadgeIssued(user.id, !user.badge_issued)}
                          >
                            {user.badge_issued ? "Снять бейдж" : "Подготовить бейдж"}
                          </Button>
                          <Button
                            variant="ghost"
                            onClick={() => openUserBadge(user.id, user.profile?.full_name || user.email)}
                            disabled={
                              badgeActionKey === `preview:${user.id}` ||
                              badgeActionKey === `download:${user.id}`
                            }
                          >
                            {badgeActionKey === `preview:${user.id}` ? "Открытие…" : "Открыть бейдж"}
                          </Button>
                          <Button
                            onClick={() =>
                              downloadUserBadge(user.id, user.profile?.full_name || user.email)
                            }
                            disabled={
                              badgeActionKey === `preview:${user.id}` ||
                              badgeActionKey === `download:${user.id}`
                            }
                          >
                            {badgeActionKey === `download:${user.id}` ? "Скачивание…" : "Скачать бейдж"}
                          </Button>
                        </>
                      ) : null}
                      <Button variant="danger" onClick={() => deleteUser(user.id)}>
                        Удалить
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
              {usersPage.items.length === 0 ? (
                <p className="adm-empty">Пользователи не найдены.</p>
              ) : null}
              <PaginationControls
                page={usersPage.page}
                pageSize={usersPage.page_size}
                total={usersPage.total}
                onPageChange={loadUsers}
              />
            </Card>
          ) : null}

          {tab === "feedback" ? (
            <Card>
              <h2 className="adm-card-title">Отзывы участников</h2>
              <p className="adm-card-sub">
                Все отправленные отзывы и предложения по улучшению конференции.
              </p>
              <div className="adm-form-grid">
                <Field label="Поиск" htmlFor="adm-fb-search">
                  <Input
                    id="adm-fb-search"
                    value={feedbackQuery}
                    onChange={(e) => setFeedbackQuery(e.target.value)}
                    placeholder="ФИО, email, текст отзыва"
                  />
                </Field>
                <Field label="Оценка" htmlFor="adm-fb-rating">
                  <Select
                    id="adm-fb-rating"
                    value={feedbackRatingFilter}
                    onChange={(e) => setFeedbackRatingFilter(e.target.value)}
                  >
                    <option value="">Все</option>
                    <option value="5">5</option>
                    <option value="4">4</option>
                    <option value="3">3</option>
                    <option value="2">2</option>
                    <option value="1">1</option>
                  </Select>
                </Field>
              </div>

              <div className="adm-table">
                {feedbackPage.items.map((entry) => (
                  <div key={entry.id} className="adm-row">
                    <div className="adm-row-main">
                      <strong>
                        {entry.user_name || entry.user_email || `Участник #${entry.user_id}`}
                      </strong>
                      <div className="adm-row-note">{entry.user_email || "Email не указан"}</div>
                      <div className="adm-row-note">
                        {entry.created_at
                          ? new Date(entry.created_at).toLocaleString("ru-RU")
                          : "Дата не указана"}
                      </div>
                      <p>{entry.comment}</p>
                    </div>
                    <div className="adm-row-actions">
                      <Badge variant="brand">Оценка: {entry.rating}/5</Badge>
                    </div>
                  </div>
                ))}
              </div>
              {feedbackPage.items.length === 0 ? (
                <p className="adm-empty">Отзывов пока нет.</p>
              ) : null}
              <PaginationControls
                page={feedbackPage.page}
                pageSize={feedbackPage.page_size}
                total={feedbackPage.total}
                onPageChange={loadFeedback}
              />
            </Card>
          ) : null}
        </div>
      </div>

      {previewBadge ? (
        <div className="adm-modal-backdrop" onClick={closeBadgePreview}>
          <div
            className="adm-modal"
            role="dialog"
            aria-modal="true"
            aria-label={previewBadge.title}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="adm-modal-head">
              <div>
                <h2>{previewBadge.title}</h2>
                <p>Просмотр PDF бейджа с ФИО и QR-кодом без скачивания.</p>
              </div>
              <div className="adm-modal-actions">
                <Button
                  variant="ghost"
                  onClick={() => downloadUserBadge(previewBadge.userId, previewBadge.fullName)}
                >
                  Скачать
                </Button>
                <Button onClick={closeBadgePreview}>Закрыть</Button>
              </div>
            </div>
            <div className="adm-modal-body">
              <iframe
                className="adm-preview-frame"
                src={buildPreviewSrc(previewBadge.url)}
                title={previewBadge.title}
              />
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
