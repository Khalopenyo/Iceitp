import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiDelete, apiGet, apiPost, apiPut } from "../lib/api.js";
import AdminProgramTab from "../components/admin/AdminProgramTab.jsx";
import { defaultRooms } from "../data/rooms.js";
import { notifyConferenceUpdated } from "../lib/conference.js";
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

const toInputDateTime = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return shifted.toISOString().slice(0, 16);
};

const toISOOrUndefined = (value) => {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
};

const roleLabels = {
  participant: "Участник",
  org: "Оргкомитет",
  admin: "Администратор",
};

const userTypeLabels = {
  offline: "Оффлайн",
  online: "Онлайн",
};

const conferenceStatusLabels = {
  draft: "Черновик",
  registration_open: "Регистрация открыта",
  in_progress: "Конференция идет",
  completed: "Завершена",
};

function RoomDropdown({ value, onChange, rooms, placeholder }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const filteredRooms = rooms.filter((room) =>
    room.name.toLowerCase().includes(query.toLowerCase())
  );
  const floors = Array.from(new Set(filteredRooms.map((room) => Number(room.floor) || 1))).sort((a, b) => a - b);

  return (
    <div className="dropdown" onBlur={() => setTimeout(() => setOpen(false), 150)}>
      <button
        type="button"
        className="dropdown-trigger"
        onClick={() => setOpen((prev) => !prev)}
      >
        {value || placeholder}
      </button>
      {open ? (
        <div className="dropdown-menu room-menu">
          <input
            className="dropdown-search"
            placeholder="Поиск аудитории..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {floors.map((floor) => {
            const floorRooms = filteredRooms.filter((room) => room.floor === floor);
            if (!floorRooms.length) return null;
            return (
              <div key={floor} className="dropdown-group">
                <div className="dropdown-group-title">Этаж {floor}</div>
                {floorRooms.map((room) => (
                  <button
                    type="button"
                    key={room.id || room.name}
                    className="dropdown-item"
                    onClick={() => {
                      onChange(room.name);
                      setOpen(false);
                      setQuery("");
                    }}
                  >
                    {room.name}
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function RoomMapPicker({ open, rooms, onClose, onSelect }) {
  const [activeFloor, setActiveFloor] = useState(1);
  const floors = Array.from(new Set(rooms.map((room) => Number(room.floor) || 1))).sort((a, b) => a - b);
  const selectedFloor = floors.includes(activeFloor) ? activeFloor : (floors[0] || 1);
  const roomsOnFloor = rooms.filter((room) => room.floor === selectedFloor);

  if (!open) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Выбор аудитории</h3>
          <button className="btn btn-ghost" onClick={onClose}>
            Закрыть
          </button>
        </div>
        <div className="modal-body">
          <div className="map-floors">
            {floors.map((floor) => (
              <button
                key={floor}
                className={`floor-tab ${selectedFloor === floor ? "active" : ""}`}
                onClick={() => setActiveFloor(floor)}
              >
                Этаж {floor}
              </button>
            ))}
          </div>
          <div className="map-grid">
            {roomsOnFloor.map((room) => (
              <button
                key={room.id || room.name}
                className="room-card"
                onClick={() => {
                  onSelect(room.name);
                  onClose();
                }}
              >
                <div className="room-number">{room.name}</div>
                <div className="room-label">{room.name}</div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
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

export default function Admin() {
  const navigate = useNavigate();
  const [usersPage, setUsersPage] = useState(emptyPage);
  const [consentsPage, setConsentsPage] = useState(emptyPage);
  const [feedbackPage, setFeedbackPage] = useState(emptyPage);
  const [sections, setSections] = useState([]);
  const [rooms, setRooms] = useState(defaultRooms);
  const [tab, setTab] = useState("users");
  const [showRoomMap, setShowRoomMap] = useState(false);
  const [conferenceForm, setConferenceForm] = useState({
    title: "",
    description: "",
    status: "draft",
    starts_at: "",
    ends_at: "",
    proceedings_url: "",
    support_email: "",
  });
  const [savingConference, setSavingConference] = useState(false);
  const [checkinToken, setCheckinToken] = useState("");
  const [verifyingCheckin, setVerifyingCheckin] = useState(false);
  const [checkinResult, setCheckinResult] = useState(null);
  const [adminStatusMessage, setAdminStatusMessage] = useState("");
  const [adminErrorMessage, setAdminErrorMessage] = useState("");
  const [sectionForm, setSectionForm] = useState({
    title: "",
    description: "",
    room: "",
    capacity: 10,
    start_at: "",
    end_at: "",
  });
  const [roomForm, setRoomForm] = useState({ floor: 1, name: "" });

  const [userQuery, setUserQuery] = useState("");
  const [userRoleFilter, setUserRoleFilter] = useState("");
  const [userTypeFilter, setUserTypeFilter] = useState("");
  const [userBadgeFilter, setUserBadgeFilter] = useState("");

  const [consentQuery, setConsentQuery] = useState("");
  const [consentTypeFilter, setConsentTypeFilter] = useState("");

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

  const loadConsents = async (page = consentsPage.page) => {
    try {
      const response = await apiGet(
        `/admin/consents${buildQuery({
          page,
          page_size: consentsPage.page_size,
          q: consentQuery,
          consent_type: consentTypeFilter,
        })}`
      );
      setConsentsPage(response);
    } catch (error) {
      setConsentsPage(emptyPage);
      if (error?.status === 403) {
        handleForbidden();
        return;
      }
      setAdminError(error?.message || "Не удалось загрузить согласия.");
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

  const loadBase = async () => {
    try {
      const [sectionsResponse, roomsResponse, conferenceResponse] = await Promise.all([
        apiGet("/sections"),
        apiGet("/rooms"),
        apiGet("/admin/conference"),
      ]);
      setSections(sectionsResponse);
      setRooms(roomsResponse);
      setConferenceForm({
        title: conferenceResponse.title || "",
        description: conferenceResponse.description || "",
        status: conferenceResponse.status || "draft",
        starts_at: toInputDateTime(conferenceResponse.starts_at),
        ends_at: toInputDateTime(conferenceResponse.ends_at),
        proceedings_url: conferenceResponse.proceedings_url || "",
        support_email: conferenceResponse.support_email || "",
      });
    } catch (error) {
      handleAdminRequestError(error, "Не удалось загрузить параметры конференции.");
    }
  };

  useEffect(() => {
    loadBase();
  }, []);

  useEffect(() => {
    loadUsers(1);
  }, [userQuery, userRoleFilter, userTypeFilter, userBadgeFilter]);

  useEffect(() => {
    loadConsents(1);
  }, [consentQuery, consentTypeFilter]);

  useEffect(() => {
    loadFeedback(1);
  }, [feedbackQuery, feedbackRatingFilter]);

  const reloadEverything = async () => {
    await Promise.all([
      loadBase(),
      loadUsers(usersPage.page),
      loadConsents(consentsPage.page),
      loadFeedback(feedbackPage.page),
    ]);
  };

  const createSection = async (e) => {
    e.preventDefault();
    try {
      await apiPost("/admin/sections", {
        ...sectionForm,
        capacity: Number(sectionForm.capacity) || 10,
        start_at: sectionForm.start_at ? new Date(sectionForm.start_at).toISOString() : undefined,
        end_at: sectionForm.end_at ? new Date(sectionForm.end_at).toISOString() : undefined,
      });
      setSectionForm({ title: "", description: "", room: "", capacity: 10, start_at: "", end_at: "" });
      setAdminStatus("Секция добавлена в программу конференции.");
      loadBase();
    } catch (error) {
      handleAdminRequestError(error, "Не удалось создать секцию.");
    }
  };

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

  const deleteSection = async (id) => {
    if (!confirm("Удалить секцию и все связанные записи?")) return;
    try {
      await apiDelete(`/admin/sections/${id}`);
      setAdminStatus("Секция удалена.");
      loadBase();
    } catch (error) {
      handleAdminRequestError(error, "Не удалось удалить секцию.");
    }
  };

  const createRoom = async (e) => {
    e.preventDefault();
    const name = String(roomForm.name || "").trim();
    const floor = Number(roomForm.floor);
    if (!name || !floor) return;
    try {
      await apiPost("/admin/rooms", { name, floor });
      setRoomForm({ floor, name: "" });
      setAdminStatus(`Аудитория "${name}" добавлена.`);
      loadBase();
    } catch (error) {
      handleAdminRequestError(error, "Не удалось добавить аудиторию.");
    }
  };

  const deleteRoom = async (id) => {
    if (!confirm("Удалить аудиторию из списка?")) return;
    try {
      await apiDelete(`/admin/rooms/${id}`);
      setAdminStatus("Аудитория удалена.");
      loadBase();
    } catch (error) {
      handleAdminRequestError(error, "Не удалось удалить аудиторию.");
    }
  };

  const saveConference = async (e) => {
    e.preventDefault();
    if (!conferenceForm.title.trim()) {
      setAdminError("Укажите название конференции.");
      return;
    }
    setSavingConference(true);
    setAdminErrorMessage("");
    try {
      await apiPut("/admin/conference", {
        title: conferenceForm.title,
        description: conferenceForm.description,
        status: conferenceForm.status,
        starts_at: toISOOrUndefined(conferenceForm.starts_at),
        ends_at: toISOOrUndefined(conferenceForm.ends_at),
        proceedings_url: conferenceForm.proceedings_url,
        support_email: conferenceForm.support_email,
      });
      notifyConferenceUpdated();
      setAdminStatus("Параметры конференции сохранены.");
      loadBase();
    } catch (error) {
      handleAdminRequestError(error, "Не удалось сохранить параметры конференции.");
    } finally {
      setSavingConference(false);
    }
  };

  const verifyCheckin = async (e) => {
    e.preventDefault();
    const token = checkinToken.trim();
    if (!token) return;
    setVerifyingCheckin(true);
    setCheckinResult(null);
    setAdminErrorMessage("");
    try {
      const data = await apiPost("/admin/checkin/verify", { token });
      setCheckinResult(data);
      setAdminStatus(data.already_checked_in ? "Участник уже отмечен." : "Check-in выполнен.");
      setCheckinToken("");
    } catch (err) {
      setAdminError(err.message || "Не удалось выполнить check-in");
    } finally {
      setVerifyingCheckin(false);
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
          <button className={`tab-btn ${tab === "sections" ? "active" : ""}`} onClick={() => setTab("sections")}>
            Секции
          </button>
          <button className={`tab-btn ${tab === "program" ? "active" : ""}`} onClick={() => setTab("program")}>
            Программа
          </button>
          <button className={`tab-btn ${tab === "rooms" ? "active" : ""}`} onClick={() => setTab("rooms")}>
            Аудитории
          </button>
          <button className={`tab-btn ${tab === "consents" ? "active" : ""}`} onClick={() => setTab("consents")}>
            Согласия
          </button>
          <button className={`tab-btn ${tab === "feedback" ? "active" : ""}`} onClick={() => setTab("feedback")}>
            Отзывы
          </button>
          <button className="tab-btn" onClick={() => navigate("/admin/questions")}>
            Вопросы
          </button>
          <button className={`tab-btn ${tab === "tools" ? "active" : ""}`} onClick={() => setTab("tools")}>
            Инструменты
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

          {tab === "sections" ? (
            <div className="card">
              <h3>Секции</h3>
              <form className="form-grid" onSubmit={createSection}>
                <label>
                  Название
                  <input value={sectionForm.title} onChange={(e) => setSectionForm({ ...sectionForm, title: e.target.value })} />
                </label>
                <label>
                  Описание
                  <input
                    value={sectionForm.description}
                    onChange={(e) => setSectionForm({ ...sectionForm, description: e.target.value })}
                  />
                </label>
                <label>
                  Аудитория
                  <RoomDropdown
                    value={sectionForm.room}
                    onChange={(value) => setSectionForm({ ...sectionForm, room: value })}
                    rooms={rooms}
                    placeholder="Выберите аудиторию"
                  />
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => {
                      setShowRoomMap(true);
                    }}
                  >
                    Выбрать на карте
                  </button>
                </label>
                <label>
                  Вместимость
                  <input
                    type="number"
                    min="1"
                    value={sectionForm.capacity}
                    onChange={(e) => setSectionForm({ ...sectionForm, capacity: e.target.value })}
                  />
                </label>
                <label>
                  Начало
                  <input
                    type="datetime-local"
                    value={sectionForm.start_at}
                    onChange={(e) => setSectionForm({ ...sectionForm, start_at: e.target.value })}
                  />
                </label>
                <label>
                  Окончание
                  <input
                    type="datetime-local"
                    value={sectionForm.end_at}
                    onChange={(e) => setSectionForm({ ...sectionForm, end_at: e.target.value })}
                  />
                </label>
                <button className="btn btn-primary" type="submit">
                  Добавить секцию
                </button>
              </form>
              <div className="table compact">
                {sections.map((section) => (
                  <div key={section.id} className="row">
                    <div>
                      <strong>{section.title}</strong>
                      <div className="muted">
                        {section.room || "Без аудитории"} ·{" "}
                        {section.start_at ? new Date(section.start_at).toLocaleString() : "Без времени"}
                      </div>
                    </div>
                    <button className="btn btn-danger" onClick={() => deleteSection(section.id)}>
                      Удалить
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {tab === "program" ? <AdminProgramTab /> : null}

          {tab === "rooms" ? (
            <div className="card">
              <h3>Аудитории</h3>
              <form className="form-grid" onSubmit={createRoom}>
                <label>
                  Этаж
                  <select value={roomForm.floor} onChange={(e) => setRoomForm({ ...roomForm, floor: e.target.value })}>
                    <option value={1}>1</option>
                    <option value={2}>2</option>
                    <option value={3}>3</option>
                  </select>
                </label>
                <label>
                  Название аудитории
                  <input
                    value={roomForm.name}
                    onChange={(e) => setRoomForm({ ...roomForm, name: e.target.value })}
                    placeholder="Хайпарк"
                  />
                </label>
                <button className="btn btn-primary" type="submit">
                  Добавить аудиторию
                </button>
              </form>
              <div className="table compact">
                {rooms.map((room) => (
                  <div key={room.id || room.name} className="row">
                    <div>
                      <strong>{room.name}</strong>
                      <div className="muted">Этаж {room.floor || "-"}</div>
                    </div>
                    {room.id ? (
                      <button className="btn btn-danger" onClick={() => deleteRoom(room.id)}>
                        Удалить
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {tab === "consents" ? (
            <div className="card">
              <h3>Логи согласий</h3>
              <div className="form-grid">
                <label>
                  Поиск
                  <input
                    value={consentQuery}
                    onChange={(e) => setConsentQuery(e.target.value)}
                    placeholder="ФИО, email, версия, IP"
                  />
                </label>
                <label>
                  Тип согласия
                  <select value={consentTypeFilter} onChange={(e) => setConsentTypeFilter(e.target.value)}>
                    <option value="">Все</option>
                    <option value="personal_data">personal_data</option>
                    <option value="publication">publication</option>
                  </select>
                </label>
              </div>

              <div className="table compact">
                {consentsPage.items.map((consent) => (
                  <div key={consent.id} className="row">
                    <div>
                      <strong>{consent.user_name || consent.user_email || `Пользователь #${consent.user_id}`}</strong>
                      <div className="muted">{consent.user_email || "Email не указан"}</div>
                      <div className="muted">{new Date(consent.granted_at).toLocaleString()}</div>
                    </div>
                    <div className="row-actions">
                      <span className="pill">{consent.consent_type}</span>
                      <span className="pill">{consent.consent_version}</span>
                      {consent.ip ? <span className="muted">{consent.ip}</span> : null}
                    </div>
                  </div>
                ))}
              </div>
              {consentsPage.items.length === 0 ? <p className="muted">Записей пока нет.</p> : null}
              <PaginationControls
                page={consentsPage.page}
                pageSize={consentsPage.page_size}
                total={consentsPage.total}
                onPageChange={loadConsents}
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

          {tab === "tools" ? (
            <div className="card">
              <h3>Инструменты</h3>
              <p className="muted">Параметры конференции и служебные действия.</p>

              <hr />

              <h4>Параметры конференции</h4>
              <form className="form-grid" onSubmit={saveConference}>
                <label>
                  Название
                  <input
                    value={conferenceForm.title}
                    onChange={(e) => setConferenceForm({ ...conferenceForm, title: e.target.value })}
                  />
                </label>
                <label>
                  Статус
                  <select
                    value={conferenceForm.status}
                    onChange={(e) => setConferenceForm({ ...conferenceForm, status: e.target.value })}
                  >
                    <option value="draft">{conferenceStatusLabels.draft}</option>
                    <option value="registration_open">{conferenceStatusLabels.registration_open}</option>
                    <option value="in_progress">{conferenceStatusLabels.in_progress}</option>
                    <option value="completed">{conferenceStatusLabels.completed}</option>
                  </select>
                </label>
                <label>
                  Начало
                  <input
                    type="datetime-local"
                    value={conferenceForm.starts_at}
                    onChange={(e) => setConferenceForm({ ...conferenceForm, starts_at: e.target.value })}
                  />
                </label>
                <label>
                  Окончание
                  <input
                    type="datetime-local"
                    value={conferenceForm.ends_at}
                    onChange={(e) => setConferenceForm({ ...conferenceForm, ends_at: e.target.value })}
                  />
                </label>
                <label>
                  Email поддержки
                  <input
                    value={conferenceForm.support_email}
                    onChange={(e) => setConferenceForm({ ...conferenceForm, support_email: e.target.value })}
                  />
                </label>
                <label>
                  URL сборника
                  <input
                    value={conferenceForm.proceedings_url}
                    onChange={(e) => setConferenceForm({ ...conferenceForm, proceedings_url: e.target.value })}
                  />
                </label>
                <label>
                  Описание
                  <textarea
                    rows="5"
                    value={conferenceForm.description}
                    onChange={(e) => setConferenceForm({ ...conferenceForm, description: e.target.value })}
                  />
                </label>
                <div className="admin-tool-actions">
                  <button className="btn btn-primary" type="submit" disabled={savingConference}>
                    {savingConference ? "Сохранение..." : "Сохранить параметры"}
                  </button>
                </div>
              </form>

              <hr />

              <h4>Ручная отметка по бейджу</h4>
              <form className="form-grid" onSubmit={verifyCheckin}>
                <label>
                  Код из QR-бейджа
                  <textarea
                    rows="4"
                    value={checkinToken}
                    onChange={(e) => setCheckinToken(e.target.value)}
                    placeholder="Вставьте код из ссылки или PDF-бейджа"
                  />
                </label>
                <div className="admin-tool-actions">
                  <button className="btn btn-primary" type="submit" disabled={verifyingCheckin}>
                    {verifyingCheckin ? "Проверка..." : "Отметить присутствие"}
                  </button>
                  <button className="btn btn-ghost" type="button" onClick={reloadEverything}>
                    Обновить данные
                  </button>
                </div>
              </form>

              {checkinResult ? (
                <div className="card">
                  <strong>{checkinResult.user?.full_name || "Участник"}</strong>
                  <div className="muted">{checkinResult.user?.email || "Email не указан"}</div>
                  <div className="muted">
                    {checkinResult.already_checked_in
                      ? "Участник уже был отмечен ранее."
                      : "Присутствие успешно отмечено."}
                  </div>
                  <div className="muted">
                    Время: {checkinResult.checked_in_at ? new Date(checkinResult.checked_in_at).toLocaleString() : "не указано"}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <RoomMapPicker
        open={showRoomMap}
        rooms={rooms}
        onClose={() => setShowRoomMap(false)}
        onSelect={(roomName) => setSectionForm((prev) => ({ ...prev, room: roomName }))}
      />

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
