import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiDelete, apiGet, apiPost, apiPut } from "../lib/api.js";
import { triggerBlobDownload } from "../lib/download.js";

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

  useEffect(() => () => {
    if (previewBadge?.url) {
      window.URL.revokeObjectURL(previewBadge.url);
    }
  }, [previewBadge]);

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
      setAdminStatus(badgeIssued ? "Бейдж подготовлен и доступен участнику." : "Доступ к бейджу отключен.");
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
    if (!confirm("Удалить пользователя и связанные данные?")) return;
    try {
      await apiDelete(`/admin/users/${id}`);
      setAdminStatus("Пользователь удален.");
      loadUsers(Math.max(1, usersPage.page));
    } catch (error) {
      handleAdminRequestError(error, "Не удалось удалить пользователя.");
    }
  };


  return (
    <section className="panel">
      <h2>Администрирование</h2>
      {adminStatusMessage ? <p className="form-status success">{adminStatusMessage}</p> : null}
      {adminErrorMessage ? <p className="form-status error">{adminErrorMessage}</p> : null}

      <div className="dashboard-layout">
        <aside className="dashboard-tabs">
          <button className={`tab-btn ${tab === "users" ? "active" : ""}`} onClick={() => setTab("users")}>
            Пользователи
          </button>
          <button className={`tab-btn ${tab === "feedback" ? "active" : ""}`} onClick={() => setTab("feedback")}>
            Отзывы
          </button>
          <button className="tab-btn" onClick={() => navigate("/admin/questions")}>
            Вопросы
          </button>
        </aside>

        <div className="dashboard-content">
          {tab === "users" ? (
            <div className="card">
              <h3>Пользователи</h3>
              <div className="form-grid">
                <label>
                  Поиск
                  <input
                    value={userQuery}
                    onChange={(e) => setUserQuery(e.target.value)}
                    placeholder="ФИО, email, организация, телефон"
                  />
                </label>
                <label>
                  Роль
                  <select value={userRoleFilter} onChange={(e) => setUserRoleFilter(e.target.value)}>
                    <option value="">Все</option>
                    <option value="participant">{roleLabels.participant}</option>
                    <option value="org">{roleLabels.org}</option>
                    <option value="admin">{roleLabels.admin}</option>
                  </select>
                </label>
                <label>
                  Формат участия
                  <select value={userTypeFilter} onChange={(e) => setUserTypeFilter(e.target.value)}>
                    <option value="">Все</option>
                    <option value="offline">{userTypeLabels.offline}</option>
                    <option value="online">{userTypeLabels.online}</option>
                  </select>
                </label>
                <label>
                  Бейдж
                  <select value={userBadgeFilter} onChange={(e) => setUserBadgeFilter(e.target.value)}>
                    <option value="">Все</option>
                    <option value="true">готов</option>
                    <option value="false">не готов</option>
                  </select>
                </label>
              </div>

              <div className="table">
                {usersPage.items.map((user) => (
                  <div key={user.id} className="row">
                    <div>
                      <strong>{user.profile?.full_name || user.email}</strong>
                      <div className="muted">
                        {user.email} · {userTypeLabels[user.user_type] || "Участник"}
                      </div>
                      {user.profile?.organization ? <div className="muted">{user.profile.organization}</div> : null}
                    </div>
                    <div className="row-actions">
                      <span className="pill">{roleLabels[user.role] || user.role}</span>
                      {user.user_type === "offline" ? (
                        <span className="pill">{user.badge_issued ? "Бейдж готов" : "Бейдж не подготовлен"}</span>
                      ) : (
                        <span className="pill">Без бейджа</span>
                      )}
                      <button className="btn btn-ghost" onClick={() => updateRole(user.id, "org")}>
                        Оргкомитет
                      </button>
                      <button className="btn btn-ghost" onClick={() => updateRole(user.id, "admin")}>
                        Админ
                      </button>
                      {user.user_type === "offline" ? (
                        <>
                          <button
                            className="btn btn-ghost"
                            onClick={() => setBadgeIssued(user.id, !user.badge_issued)}
                          >
                            {user.badge_issued ? "Снять бейдж" : "Подготовить бейдж"}
                          </button>
                          <button
                            className="btn btn-ghost"
                            onClick={() => openUserBadge(user.id, user.profile?.full_name || user.email)}
                            disabled={badgeActionKey === `preview:${user.id}` || badgeActionKey === `download:${user.id}`}
                          >
                            {badgeActionKey === `preview:${user.id}` ? "Открытие..." : "Открыть бейдж"}
                          </button>
                          <button
                            className="btn btn-primary"
                            onClick={() => downloadUserBadge(user.id, user.profile?.full_name || user.email)}
                            disabled={badgeActionKey === `preview:${user.id}` || badgeActionKey === `download:${user.id}`}
                          >
                            {badgeActionKey === `download:${user.id}` ? "Скачивание..." : "Скачать бейдж"}
                          </button>
                        </>
                      ) : null}
                      <button className="btn btn-danger" onClick={() => deleteUser(user.id)}>
                        Удалить
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              {usersPage.items.length === 0 ? <p className="muted">Пользователи не найдены.</p> : null}
              <PaginationControls
                page={usersPage.page}
                pageSize={usersPage.page_size}
                total={usersPage.total}
                onPageChange={loadUsers}
              />
            </div>
          ) : null}

          {tab === "feedback" ? (
            <div className="card">
              <h3>Отзывы участников</h3>
              <p className="muted">Все отправленные отзывы и предложения по улучшению конференции.</p>
              <div className="form-grid">
                <label>
                  Поиск
                  <input
                    value={feedbackQuery}
                    onChange={(e) => setFeedbackQuery(e.target.value)}
                    placeholder="ФИО, email, текст отзыва"
                  />
                </label>
                <label>
                  Оценка
                  <select value={feedbackRatingFilter} onChange={(e) => setFeedbackRatingFilter(e.target.value)}>
                    <option value="">Все</option>
                    <option value="5">5</option>
                    <option value="4">4</option>
                    <option value="3">3</option>
                    <option value="2">2</option>
                    <option value="1">1</option>
                  </select>
                </label>
              </div>

              <div className="table compact">
                {feedbackPage.items.map((entry) => (
                  <div key={entry.id} className="row">
                    <div>
                      <strong>{entry.user_name || entry.user_email || `Участник #${entry.user_id}`}</strong>
                      <div className="muted">{entry.user_email || "Email не указан"}</div>
                      <div className="muted">
                        {entry.created_at ? new Date(entry.created_at).toLocaleString() : "Дата не указана"}
                      </div>
                      <p>{entry.comment}</p>
                    </div>
                    <div className="row-actions">
                      <span className="pill">Оценка: {entry.rating}/5</span>
                    </div>
                  </div>
                ))}
              </div>
              {feedbackPage.items.length === 0 ? <p className="muted">Отзывов пока нет.</p> : null}
              <PaginationControls
                page={feedbackPage.page}
                pageSize={feedbackPage.page_size}
                total={feedbackPage.total}
                onPageChange={loadFeedback}
              />
            </div>
          ) : null}

        </div>
      </div>

      {previewBadge ? (
        <div className="modal-backdrop" onClick={closeBadgePreview}>
          <div className="modal document-preview-modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3>{previewBadge.title}</h3>
                <p className="muted">Просмотр PDF бейджа с ФИО и QR-кодом без скачивания</p>
              </div>
              <div className="form-actions">
                <button
                  className="btn btn-ghost"
                  onClick={() => downloadUserBadge(previewBadge.userId, previewBadge.fullName)}
                >
                  Скачать
                </button>
                <button className="btn btn-primary" onClick={closeBadgePreview}>
                  Закрыть
                </button>
              </div>
            </div>
            <div className="modal-body">
              <iframe
                className="document-preview-frame"
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
