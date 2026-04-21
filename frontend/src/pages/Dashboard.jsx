import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiGet, apiPostForm, apiPut } from "../lib/api.js";
import { setUser } from "../lib/auth.js";
import { getSessionStatus } from "../lib/sessionStatus.js";

const defaultSubmissionState = {
  items: [],
  storage_configured: false,
  max_file_size_bytes: 20 * 1024 * 1024,
};

const formatTimeOnly = (value) => {
  if (!value) return "Не указано";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Не указано";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};

const formatDateTime = (value) => {
  if (!value) return "Не указано";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Не указано";
  return date.toLocaleString();
};

const formatMegabytes = (bytes) => {
  if (!bytes) return "20 МБ";
  return `${(bytes / 1024 / 1024).toFixed(0)} МБ`;
};

const participationLabel = (userType) => (userType === "online" ? "Онлайн-участник" : "Очный участник");

const assignmentStatusMeta = (status) => {
  if (status === "approved") {
    return { label: "Программа утверждена", tone: "success" };
  }
  return { label: "Ожидает подтверждения", tone: "warning" };
};

const liveStatusMeta = (status) => {
  switch (status) {
    case "current":
      return { label: "Идет сейчас", tone: "success" };
    case "upcoming":
      return { label: "Скоро начнется", tone: "warning" };
    case "finished":
      return { label: "Сессия завершена", tone: "neutral" };
    default:
      return { label: "Расписание уточняется", tone: "neutral" };
  }
};

const submissionStatusLabel = (status) => {
  switch (status) {
    case "uploaded":
      return "Загружен";
    case "ready":
      return "Файл сохранен";
    case "failed":
      return "Ошибка";
    default:
      return "Неизвестно";
  }
};

const submissionOverviewMeta = (items) => {
  if (!items.length) {
    return {
      label: "Статья не загружена",
      tone: "warning",
      description: "Добавьте файл статьи, чтобы материал появился в системе.",
    };
  }

  if (items.some((item) => item.status === "failed")) {
    return {
      label: "Есть ошибки загрузки",
      tone: "danger",
      description: "Проверьте проблемный файл и загрузите его заново.",
    };
  }

  return {
    label: "Материалы загружены",
    tone: "success",
    description: "Последние версии файлов сохранены и доступны организаторам.",
  };
};

const openExternal = (url) => {
  if (!url) return;
  window.open(url, "_blank", "noopener,noreferrer");
};

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [profile, setProfile] = useState(null);
  const [sections, setSections] = useState([]);
  const [saving, setSaving] = useState(false);
  const [profileStatusMessage, setProfileStatusMessage] = useState("");
  const [profileErrorMessage, setProfileErrorMessage] = useState("");
  const [tab, setTab] = useState("profile");
  const [nowTs, setNowTs] = useState(() => Date.now());
  const [submissions, setSubmissions] = useState(defaultSubmissionState);
  const [submissionMessage, setSubmissionMessage] = useState("");
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadFile, setUploadFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [fileInputKey, setFileInputKey] = useState(0);

  const loadSubmissions = async () => {
    try {
      const response = await apiGet("/submissions");
      setSubmissions({
        ...defaultSubmissionState,
        ...response,
        items: response?.items || [],
      });
    } catch (err) {
      setSubmissionMessage(err.message || "Не удалось загрузить список статей");
      setSubmissions(defaultSubmissionState);
    }
  };

  const loadSchedule = async () => {
    try {
      const response = await apiGet("/schedule");
      setData(response);
      setProfile(response.user.profile);
    } catch {
      setData(null);
      setProfile(null);
    }
  };

  const loadSections = async () => {
    try {
      const response = await apiGet("/sections");
      setSections(response);
    } catch {
      setSections([]);
    }
  };

  useEffect(() => {
    loadSchedule();
    loadSections();
    loadSubmissions();
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setNowTs(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);

  if (!data) {
    return (
      <section className="panel">
        <h2>Личный кабинет</h2>
        <p>Войдите в систему, чтобы увидеть данные участника.</p>
      </section>
    );
  }

  const update = (field, value) => setProfile((prev) => ({ ...prev, [field]: value }));
  const assignmentStatus = data?.assignment_status || "pending";
  const currentUserType = data?.current_user_type || data?.user?.user_type || "offline";
  const schedulePlacement = data?.schedule || null;
  const scheduleStatus =
    assignmentStatus === "approved"
      ? getSessionStatus(
          {
            start_at: schedulePlacement?.starts_at,
            end_at: schedulePlacement?.ends_at,
          },
          nowTs
        )
      : "unknown";
  const startTime = assignmentStatus === "approved" ? formatTimeOnly(schedulePlacement?.starts_at) : "Не указано";
  const endTime = assignmentStatus === "approved" ? formatTimeOnly(schedulePlacement?.ends_at) : "Не указано";
  const selectedSection = sections.find((section) => String(section.id) === String(profile?.section_id));
  const assignmentMeta = assignmentStatusMeta(assignmentStatus);
  const liveMeta = liveStatusMeta(scheduleStatus);
  const submissionMeta = submissionOverviewMeta(submissions.items);

  const save = async () => {
    setSaving(true);
    setProfileStatusMessage("");
    setProfileErrorMessage("");
    try {
      await apiPut("/me/profile", {
        ...profile,
        section_id: profile?.section_id ? Number(profile.section_id) : null,
      });
      const [freshUser, freshSchedule] = await Promise.all([apiGet("/me"), apiGet("/schedule")]);
      setUser(freshUser);
      setData(freshSchedule);
      setProfile(freshSchedule.user.profile);
      setProfileStatusMessage("Профиль обновлен. Новые данные сохранены в личном кабинете.");
    } catch (err) {
      setProfileErrorMessage(err.message || "Не удалось сохранить профиль");
    } finally {
      setSaving(false);
    }
  };

  const handleUpload = async (event) => {
    event.preventDefault();
    if (!uploadFile) {
      setSubmissionMessage("Выберите файл статьи");
      return;
    }

    setUploading(true);
    setSubmissionMessage("");
    try {
      const formData = new FormData();
      formData.append("file", uploadFile);
      formData.append("title", uploadTitle.trim() || profile?.talk_title || uploadFile.name);
      await apiPostForm("/submissions", formData);
      setUploadTitle("");
      setUploadFile(null);
      setFileInputKey((prev) => prev + 1);
      setSubmissionMessage("Файл статьи загружен.");
      await loadSubmissions();
      setTab("materials");
    } catch (err) {
      setSubmissionMessage(err.message || "Не удалось загрузить статью");
    } finally {
      setUploading(false);
    }
  };

  const downloadSubmission = (submissionId) => {
    window.location.href = `/api/submissions/${submissionId}/file`;
  };

  return (
    <section className="panel">
      <h2>Личный кабинет</h2>
      <div className="dashboard-overview">
        <div className="dashboard-summary-grid">
          <article className="dashboard-summary-card">
            <div className="dashboard-summary-head">
              <span className="dashboard-summary-label">Формат участия</span>
              <span className="status-chip status-chip-neutral">{participationLabel(currentUserType)}</span>
            </div>
            <strong>{profile?.full_name || "Участник"}</strong>
            <p className="muted">
              {selectedSection?.title || profile?.section_title || "Секция пока не выбрана"}
            </p>
          </article>

          <article className="dashboard-summary-card">
            <div className="dashboard-summary-head">
              <span className="dashboard-summary-label">Программа</span>
              <span className={`status-chip status-chip-${assignmentMeta.tone}`}>{assignmentMeta.label}</span>
            </div>
            <strong>
              {assignmentStatus === "approved"
                ? `${startTime}${endTime !== "Не указано" ? ` - ${endTime}` : ""}`
                : "Время уточняется"}
            </strong>
            <p className="muted">
              {assignmentStatus === "approved"
                ? currentUserType === "online"
                  ? schedulePlacement?.join_url
                    ? "Ссылка на подключение уже добавлена."
                    : "Оргкомитет скоро добавит ссылку на видеоконференцию."
                  : schedulePlacement?.room_name || "Аудитория будет указана после публикации."
                : liveMeta.label}
            </p>
          </article>

          <article className="dashboard-summary-card">
            <div className="dashboard-summary-head">
              <span className="dashboard-summary-label">Статья</span>
              <span className={`status-chip status-chip-${submissionMeta.tone}`}>{submissionMeta.label}</span>
            </div>
            <strong>{submissions.items.length ? `${submissions.items.length} файл(ов)` : "Нет загрузок"}</strong>
            <p className="muted">{submissionMeta.description}</p>
          </article>
        </div>

        <div className="dashboard-quick-actions">
          <div className="dashboard-quick-actions-head">
            <h3>Быстрые действия</h3>
            <p className="muted">Открывайте нужный сценарий без поиска по разделам.</p>
          </div>
          <div className="dashboard-quick-action-list">
            <button className="btn btn-ghost" onClick={() => setTab("profile")}>
              Проверить профиль
            </button>
            <button className="btn btn-ghost" onClick={() => setTab("schedule")}>
              Открыть расписание
            </button>
            <button className="btn btn-ghost" onClick={() => setTab("materials")}>
              Перейти к статье
            </button>
            <Link className="btn btn-ghost" to="/documents">
              Открыть документы
            </Link>
            {assignmentStatus === "approved" && currentUserType !== "online" ? (
              <Link className="btn btn-ghost" to="/map">
                Маршрут по площадке
              </Link>
            ) : null}
            {assignmentStatus === "approved" && currentUserType === "online" && schedulePlacement?.join_url ? (
              <button className="btn btn-primary" onClick={() => openExternal(schedulePlacement.join_url)}>
                Подключиться к сессии
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="dashboard-layout">
        <aside className="dashboard-tabs">
          <button className={`tab-btn ${tab === "profile" ? "active" : ""}`} onClick={() => setTab("profile")}>
            Личные данные
          </button>
          <button className={`tab-btn ${tab === "schedule" ? "active" : ""}`} onClick={() => setTab("schedule")}>
            Расписание
          </button>
          <button className={`tab-btn ${tab === "materials" ? "active" : ""}`} onClick={() => setTab("materials")}>
            Материалы
          </button>
        </aside>
        <div className="dashboard-content">
          {tab === "profile" ? (
            <div className="card">
              <h3>Профиль участника</h3>
              {profileStatusMessage ? <p className="form-status success">{profileStatusMessage}</p> : null}
              {profileErrorMessage ? <p className="form-status error">{profileErrorMessage}</p> : null}
              {profile ? (
                <div className="form-grid">
                  <label>
                    ФИО
                    <input value={profile.full_name || ""} onChange={(e) => update("full_name", e.target.value)} />
                  </label>
                  <label>
                    Организация
                    <input
                      value={profile.organization || ""}
                      onChange={(e) => update("organization", e.target.value)}
                    />
                  </label>
                  <label>
                    Должность
                    <input value={profile.position || ""} onChange={(e) => update("position", e.target.value)} />
                  </label>
                  <label>
                    Город
                    <input value={profile.city || ""} onChange={(e) => update("city", e.target.value)} />
                  </label>
                  <label>
                    Степень
                    <input value={profile.degree || ""} onChange={(e) => update("degree", e.target.value)} />
                  </label>
                  <label>
                    Секция
                    <select
                      value={profile.section_id ?? ""}
                      onChange={(e) => update("section_id", e.target.value ? Number(e.target.value) : null)}
                    >
                      <option value="">Выберите секцию</option>
                      {sections.map((section) => (
                        <option key={section.id} value={section.id}>
                          {section.title}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Доклад
                    <input value={profile.talk_title || ""} onChange={(e) => update("talk_title", e.target.value)} />
                  </label>
                  <label>
                    Телефон
                    <input value={profile.phone || ""} onChange={(e) => update("phone", e.target.value)} />
                  </label>
                  {selectedSection ? (
                    <p className="muted">
                      Текущая секция: <strong>{selectedSection.title}</strong>
                    </p>
                  ) : null}
                  <button className="btn btn-primary" onClick={save} disabled={saving}>
                    {saving ? "Сохранение..." : "Сохранить изменения"}
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}

          {tab === "schedule" ? (
            <div className="card">
              <h3>Моя секция и расписание</h3>
              {assignmentStatus === "approved" ? (
                <div className="session-item highlighted">
                  <div className="session-head">
                    <div className="session-title">{schedulePlacement?.section_title || "Секция не указана"}</div>
                    {scheduleStatus === "current" ? <span className="pill pill-current">Текущая сессия</span> : null}
                  </div>
                  <div className="schedule-row-grid">
                    <div className="schedule-field">
                      <span className="schedule-label">Имя спикера</span>
                      <strong>{schedulePlacement?.full_name || profile?.full_name || "Не указано"}</strong>
                    </div>
                    <div className="schedule-field">
                      <span className="schedule-label">Время начала</span>
                      <span>{startTime}</span>
                    </div>
                    <div className="schedule-field">
                      <span className="schedule-label">Время конца</span>
                      <span>{endTime}</span>
                    </div>
                    <div className="schedule-field schedule-field-wide">
                      <span className="schedule-label">Тема</span>
                      <span>{schedulePlacement?.talk_title || "Без темы"}</span>
                    </div>
                  </div>
                  {currentUserType === "online" ? (
                    <>
                      <div className="session-room">Формат: онлайн-участие</div>
                      {schedulePlacement?.join_url ? (
                        <div className="form-actions">
                          <button className="btn btn-primary" onClick={() => openExternal(schedulePlacement.join_url)}>
                            Подключиться к видеоконференции
                          </button>
                        </div>
                      ) : (
                        <p className="muted">Оргкомитет еще не добавил ссылку для подключения.</p>
                      )}
                    </>
                  ) : (
                    <>
                      <div className="session-room">Аудитория: {schedulePlacement?.room_name || "Без аудитории"}</div>
                      <p className="muted">Этаж: {schedulePlacement?.room_floor || "Не указан"}</p>
                      <div className="form-actions">
                        <Link className="btn btn-ghost" to="/map">
                          Открыть карту площадки
                        </Link>
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <div className="session-item">
                  <div className="session-head">
                    <div className="session-title">Официальная программа еще не утверждена</div>
                  </div>
                  <p className="muted">
                    Оргкомитет еще не назначил итоговые время, формат участия и площадку. Проверьте вкладку позже.
                  </p>
                </div>
              )}
            </div>
          ) : null}

          {tab === "materials" ? (
            <div className="article-stack">
              <div className="card">
                <div className="article-card-head">
                  <div>
                    <h3>Загрузка статьи</h3>
                    <p className="muted">
                      Загрузите файл статьи в кабинет. Материал будет сохранен и станет доступен оргкомитету.
                    </p>
                  </div>
                  <span className={`article-api-pill${submissions.storage_configured ? " ready" : ""}`}>
                    {submissions.storage_configured ? "Хранилище подключено" : "Хранилище недоступно"}
                  </span>
                </div>

                {!submissions.storage_configured ? (
                  <p className="muted">Серверное хранилище пока недоступно. Повторите попытку позже.</p>
                ) : null}

                {submissions.storage_configured ? (
                  <form className="form-grid article-upload-form" onSubmit={handleUpload}>
                    <label>
                      Название работы
                      <input
                        value={uploadTitle}
                        onChange={(e) => setUploadTitle(e.target.value)}
                        placeholder={profile?.talk_title || "Название статьи"}
                      />
                    </label>
                    <label>
                      Файл статьи
                      <input
                        key={fileInputKey}
                        type="file"
                        accept=".txt,.doc,.docx,.pdf,.rtf,.odt"
                        onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                      />
                    </label>
                    <p className="muted">
                      Поддерживаются `.txt`, `.doc`, `.docx`, `.pdf`, `.rtf`, `.odt`. Максимальный размер файла:{" "}
                      {formatMegabytes(submissions.max_file_size_bytes)}.
                    </p>
                    <div className="form-actions article-form-actions">
                      <button className="btn btn-primary" type="submit" disabled={uploading}>
                        {uploading ? "Загрузка..." : "Загрузить статью"}
                      </button>
                    </div>
                  </form>
                ) : null}

                {submissionMessage ? <p className="article-inline-note">{submissionMessage}</p> : null}
              </div>

              <div className="card">
                <div className="article-card-head">
                  <div>
                    <h3>Мои материалы</h3>
                    <p className="muted">Последние загруженные версии файлов.</p>
                  </div>
                </div>

                {submissions.items.length ? (
                  <div className="article-list">
                    {submissions.items.map((item) => (
                      <article key={item.id} className="article-submission-card">
                        <div className="article-submission-head">
                          <div>
                            <h4>{item.title}</h4>
                            <p className="muted">
                              {item.file_name} · {formatDateTime(item.created_at)}
                            </p>
                          </div>
                          <div className="article-status-group">
                            <span className={`article-status article-status-${item.status}`}>
                              {submissionStatusLabel(item.status)}
                            </span>
                          </div>
                        </div>

                        <div className="article-score-grid">
                          <div className="article-score-card">
                            <span>Размер файла</span>
                            <strong>{Math.max(1, Math.round((item.file_size || 0) / 1024))} КБ</strong>
                          </div>
                          <div className="article-score-card">
                            <span>Тип файла</span>
                            <strong>{item.file_type || "-"}</strong>
                          </div>
                        </div>

                        {item.error_details ? <p className="article-error-note">{item.error_details}</p> : null}

                        <div className="article-actions">
                          <button className="btn btn-primary" onClick={() => downloadSubmission(item.id)}>
                            Скачать файл
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <p className="muted">Статьи пока не загружены.</p>
                )}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
