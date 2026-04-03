import { useEffect, useState } from "react";
import { apiGet, apiPost, apiPostForm, apiPut } from "../lib/api.js";
import { setUser } from "../lib/auth.js";
import { getSessionStatus } from "../lib/sessionStatus.js";

const defaultSubmissionState = {
  items: [],
  configured: false,
  enabled: false,
  permissions: {
    editable_report: false,
    readonly_report: false,
    short_report: false,
    pdf_report: false,
  },
  message: "",
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

const formatPercent = (value) => `${Number(value || 0).toFixed(1)}%`;

const submissionIsPending = (item) =>
  ["uploaded", "checking"].includes(item.status) || item.pdf_status === "in_progress";

const submissionStatusLabel = (status) => {
  switch (status) {
    case "uploaded":
      return "Загружен";
    case "checking":
      return "Проверяется";
    case "ready":
      return "Проверен";
    case "failed":
      return "Ошибка";
    default:
      return "Неизвестно";
  }
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
  const [tab, setTab] = useState("profile");
  const [nowTs, setNowTs] = useState(() => Date.now());
  const [submissions, setSubmissions] = useState(defaultSubmissionState);
  const [submissionMessage, setSubmissionMessage] = useState("");
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadFile, setUploadFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [busyActionKey, setBusyActionKey] = useState("");

  const loadSubmissions = async () => {
    try {
      const response = await apiGet("/submissions");
      setSubmissions({
        ...defaultSubmissionState,
        ...response,
        permissions: {
          ...defaultSubmissionState.permissions,
          ...(response?.permissions || {}),
        },
        items: response?.items || [],
      });
    } catch (err) {
      setSubmissions((prev) => ({ ...prev, message: err.message || "Не удалось загрузить проверки" }));
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

  useEffect(() => {
    if (!submissions.items.some(submissionIsPending)) return undefined;
    const timer = setInterval(() => {
      loadSubmissions();
    }, 5000);
    return () => clearInterval(timer);
  }, [submissions.items]);

  if (!data) {
    return (
      <section className="panel">
        <h2>Личный кабинет</h2>
        <p>Войдите в систему, чтобы увидеть данные участника.</p>
      </section>
    );
  }

  const update = (field, value) => setProfile((prev) => ({ ...prev, [field]: value }));
  const sectionStatus = data?.section ? getSessionStatus(data.section, nowTs) : "unknown";
  const startTime = data?.section ? formatTimeOnly(data.section.start_at) : "Не указано";
  const endTime = data?.section ? formatTimeOnly(data.section.end_at) : "Не указано";
  const selectedSection = sections.find((section) => String(section.id) === String(profile?.section_id));

  const save = async () => {
    setSaving(true);
    try {
      await apiPut("/me/profile", {
        ...profile,
        section_id: profile?.section_id ? Number(profile.section_id) : null,
      });
      const [freshUser, freshSchedule] = await Promise.all([apiGet("/me"), apiGet("/schedule")]);
      setUser(freshUser);
      setData(freshSchedule);
      setProfile(freshSchedule.user.profile);
      alert("Профиль обновлен");
    } catch (err) {
      alert(err.message || "Не удалось сохранить профиль");
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
      setSubmissionMessage("Файл загружен. Проверка запущена в фоне.");
      await loadSubmissions();
      setTab("materials");
    } catch (err) {
      setSubmissionMessage(err.message || "Не удалось загрузить статью");
    } finally {
      setUploading(false);
    }
  };

  const runSubmissionAction = async (type, id, request) => {
    setBusyActionKey(`${type}:${id}`);
    setSubmissionMessage("");
    try {
      const payload = await request();
      if (type === "pdf" && payload?.pdf_url) {
        openExternal(payload.pdf_url);
      }
      await loadSubmissions();
    } catch (err) {
      setSubmissionMessage(err.message || "Операция не выполнена");
    } finally {
      setBusyActionKey("");
    }
  };

  return (
    <section className="panel">
      <h2>Личный кабинет</h2>
      <div className="dashboard-layout">
        <aside className="dashboard-tabs">
          <button className={`tab-btn ${tab === "profile" ? "active" : ""}`} onClick={() => setTab("profile")}>
            Личные данные
          </button>
          <button className={`tab-btn ${tab === "schedule" ? "active" : ""}`} onClick={() => setTab("schedule")}>
            Расписание
          </button>
          <button className={`tab-btn ${tab === "materials" ? "active" : ""}`} onClick={() => setTab("materials")}>
            Статья и проверка
          </button>
        </aside>
        <div className="dashboard-content">
          {tab === "profile" && (
            <div className="card">
              <h3>Профиль участника</h3>
              {profile && (
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
              )}
            </div>
          )}
          {tab === "schedule" && (
            <div className="card">
              <h3>Моя секция и расписание</h3>
              {data.section ? (
                <div className="session-item highlighted">
                  <div className="session-head">
                    <div className="session-title">{data.section.title}</div>
                    {sectionStatus === "current" && <span className="pill pill-current">Текущая сессия</span>}
                  </div>
                  <div className="schedule-row-grid">
                    <div className="schedule-field">
                      <span className="schedule-label">Имя спикера</span>
                      <strong>{profile?.full_name || "Не указано"}</strong>
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
                      <span>{profile?.talk_title || "Без темы"}</span>
                    </div>
                  </div>
                  <div className="session-room">Зал: {data.section.room || "Без аудитории"}</div>
                </div>
              ) : (
                <p>Секция не назначена. Выберите секцию в профиле.</p>
              )}
            </div>
          )}
          {tab === "materials" && (
            <div className="article-stack">
              <div className="card">
                <div className="article-card-head">
                  <div>
                    <h3>Загрузка статьи</h3>
                    <p className="muted">
                      Загрузите материал в личном кабинете. Проверка запускается в фоне и не прерывается, если вы
                      закроете страницу.
                    </p>
                  </div>
                  <span className={`article-api-pill${submissions.enabled ? " ready" : ""}`}>
                    {submissions.configured ? (submissions.enabled ? "API подключен" : "API выключен") : "API не настроен"}
                  </span>
                </div>

                {!submissions.configured ? (
                  <p className="muted">Администратор еще не настроил подключение к Антиплагиату.</p>
                ) : null}
                {submissions.configured && !submissions.enabled ? (
                  <p className="muted">Интеграция временно отключена в настройках платформы.</p>
                ) : null}

                {submissions.configured && submissions.enabled ? (
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
                      Поддерживаются форматы `.txt`, `.doc`, `.docx`, `.pdf`, `.rtf`, `.odt`. Максимальный размер
                      файла: 20 МБ.
                    </p>
                    <div className="form-actions article-form-actions">
                      <button className="btn btn-primary" type="submit" disabled={uploading}>
                        {uploading ? "Загрузка..." : "Загрузить и проверить"}
                      </button>
                    </div>
                  </form>
                ) : null}

                {submissionMessage ? <p className="article-inline-note">{submissionMessage}</p> : null}
                {submissions.message ? <p className="article-inline-note">{submissions.message}</p> : null}
              </div>

              <div className="card">
                <div className="article-card-head">
                  <div>
                    <h3>Мои проверки</h3>
                    <p className="muted">Статусы обновляются автоматически, пока документ проверяется или формируется PDF.</p>
                  </div>
                </div>

                {submissions.items.length ? (
                  <div className="article-list">
                    {submissions.items.map((item) => {
                      const pdfBusy = busyActionKey === `pdf:${item.id}`;
                      const refreshBusy = busyActionKey === `refresh:${item.id}`;
                      const retryBusy = busyActionKey === `retry:${item.id}`;
                      const originalityLow = item.status === "ready" && Number(item.originality_score || 0) < 75;

                      return (
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
                              {item.is_suspicious ? <span className="article-warning-pill">Подозрительно</span> : null}
                            </div>
                          </div>

                          {item.status === "ready" ? (
                            <div className="article-score-grid">
                              <div className="article-score-card">
                                <span>Оригинальность</span>
                                <strong>{formatPercent(item.originality_score)}</strong>
                              </div>
                              <div className="article-score-card">
                                <span>Совпадения</span>
                                <strong>{formatPercent(item.plagiarism_score)}</strong>
                              </div>
                              <div className="article-score-card">
                                <span>Цитирование</span>
                                <strong>{formatPercent(item.legal_score)}</strong>
                              </div>
                              <div className="article-score-card">
                                <span>Самоцитирование</span>
                                <strong>{formatPercent(item.self_cite_score)}</strong>
                              </div>
                            </div>
                          ) : null}

                          {item.estimated_wait_time ? (
                            <p className="muted">Оценочное ожидание: около {item.estimated_wait_time} сек.</p>
                          ) : null}
                          {originalityLow ? (
                            <p className="article-warning-note">
                              Оригинальность ниже требуемых 75%. Проверьте отчет и обновите результат после правок.
                            </p>
                          ) : null}
                          {item.error_details ? <p className="article-error-note">{item.error_details}</p> : null}
                          {item.pdf_status === "in_progress" ? (
                            <p className="article-inline-note">PDF-отчет формируется в фоне.</p>
                          ) : null}

                          <div className="article-actions">
                            {submissions.permissions.short_report && item.short_report_url ? (
                              <a className="btn btn-ghost" href={item.short_report_url} target="_blank" rel="noreferrer">
                                Краткий отчет
                              </a>
                            ) : null}
                            {submissions.permissions.readonly_report && item.readonly_report_url ? (
                              <a className="btn btn-ghost" href={item.readonly_report_url} target="_blank" rel="noreferrer">
                                Полный readonly
                              </a>
                            ) : null}
                            {submissions.permissions.editable_report && item.report_url ? (
                              <a className="btn btn-ghost" href={item.report_url} target="_blank" rel="noreferrer">
                                Полный редактируемый
                              </a>
                            ) : null}
                            {item.summary_report_url ? (
                              <a className="btn btn-ghost" href={item.summary_report_url} target="_blank" rel="noreferrer">
                                Сводка
                              </a>
                            ) : null}
                            <button
                              className="btn btn-ghost"
                              onClick={() =>
                                runSubmissionAction("refresh", item.id, () => apiPost(`/submissions/${item.id}/refresh`, {}))
                              }
                              disabled={refreshBusy}
                            >
                              {refreshBusy ? "Обновление..." : "Обновить результаты"}
                            </button>
                            {item.status === "failed" ? (
                              <button
                                className="btn btn-primary"
                                onClick={() =>
                                  runSubmissionAction("retry", item.id, () => apiPost(`/submissions/${item.id}/retry`, {}))
                                }
                                disabled={retryBusy}
                              >
                                {retryBusy ? "Запуск..." : "Повторить проверку"}
                              </button>
                            ) : null}
                            {submissions.permissions.pdf_report && item.status === "ready" ? (
                              <button
                                className="btn btn-primary"
                                onClick={() => {
                                  if (item.pdf_status === "ready" && item.pdf_url) {
                                    openExternal(item.pdf_url);
                                    return;
                                  }
                                  runSubmissionAction("pdf", item.id, () => apiPost(`/submissions/${item.id}/pdf`, {}));
                                }}
                                disabled={pdfBusy || item.pdf_status === "in_progress"}
                              >
                                {item.pdf_status === "ready"
                                  ? "Открыть PDF"
                                  : item.pdf_status === "in_progress"
                                    ? "PDF формируется..."
                                    : pdfBusy
                                      ? "Запрос..."
                                      : "Сформировать PDF"}
                              </button>
                            ) : null}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  <p className="muted">Статьи пока не загружены.</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
