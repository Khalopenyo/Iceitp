import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiGet, apiPut } from "../lib/api.js";
import { setUser } from "../lib/auth.js";
import { Card, Field, Input, Select, Button, Badge } from "../components/ui/index.jsx";
import { buttonClassName } from "../components/ui/buttonClass.js";
import "./dashboard.css";

const participationLabel = (userType) => (userType === "online" ? "Онлайн-участник" : "Очный участник");

function formatDateTimeRange(startsAt, endsAt) {
  const start = startsAt ? new Date(startsAt) : null;
  if (!start || Number.isNaN(start.getTime())) {
    return "";
  }
  const dateStr = start.toLocaleDateString("ru-RU", { day: "2-digit", month: "long" });
  const startTime = start.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  const end = endsAt ? new Date(endsAt) : null;
  if (!end || Number.isNaN(end.getTime())) {
    return `${dateStr}, ${startTime}`;
  }
  const endTime = end.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  return `${dateStr}, ${startTime}–${endTime}`;
}

// Живой статус собственной сессии участника поверх реальных времён из /schedule.
function liveStatus(startsAt, endsAt, now) {
  const start = startsAt ? new Date(startsAt) : null;
  if (!start || Number.isNaN(start.getTime())) {
    return null;
  }
  if (now < start) {
    return { label: "Ещё не началось", variant: "warn" };
  }
  const end = endsAt ? new Date(endsAt) : null;
  if (end && !Number.isNaN(end.getTime()) && now >= end) {
    return { label: "Завершено", variant: "neutral" };
  }
  return { label: "Идёт сейчас", variant: "success" };
}

function roomLabel(schedule) {
  if (!schedule?.room_name) {
    return "";
  }
  return schedule.room_floor
    ? `${schedule.room_name} (этаж ${schedule.room_floor})`
    : schedule.room_name;
}

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [profile, setProfile] = useState(null);
  const [sections, setSections] = useState([]);
  const [schedule, setSchedule] = useState(null);
  const [assignmentStatus, setAssignmentStatus] = useState("");
  const [saving, setSaving] = useState(false);
  const [profileStatusMessage, setProfileStatusMessage] = useState("");
  const [profileErrorMessage, setProfileErrorMessage] = useState("");
  const [tab, setTab] = useState("profile");
  const [now, setNow] = useState(() => new Date());

  const loadDashboard = async () => {
    try {
      const response = await apiGet("/me");
      setData(response);
      setProfile(response.profile);
    } catch {
      setData(null);
      setProfile(null);
    }
  };

  const loadSections = async () => {
    try {
      const response = await apiGet("/sections");
      setSections(Array.isArray(response) ? response : []);
    } catch {
      setSections([]);
    }
  };

  const loadSchedule = async () => {
    try {
      const response = await apiGet("/schedule");
      setSchedule(response?.schedule || null);
      setAssignmentStatus(response?.assignment_status || "");
    } catch {
      setSchedule(null);
      setAssignmentStatus("");
    }
  };

  useEffect(() => {
    loadDashboard();
    loadSections();
    loadSchedule();
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  if (!data) {
    return (
      <section className="dash">
        <div className="dash-head">
          <h1>Личный кабинет</h1>
          <p>Войдите в систему, чтобы увидеть данные участника.</p>
        </div>
      </section>
    );
  }

  const update = (field, value) => setProfile((prev) => ({ ...prev, [field]: value }));
  const currentUserType = data?.user_type || "offline";
  const selectedSection = sections.find((s) => String(s.id) === String(profile?.section_id));
  const selectedSectionTitle = selectedSection?.title || profile?.section_title || "";

  const isApproved = assignmentStatus === "approved";
  const hasAssignment = Boolean(isApproved && schedule && schedule.starts_at);
  const status = hasAssignment ? liveStatus(schedule.starts_at, schedule.ends_at, now) : null;
  const scheduleTimeLabel = hasAssignment ? formatDateTimeRange(schedule.starts_at, schedule.ends_at) : "";
  const scheduleRoom = roomLabel(schedule);

  const save = async () => {
    setSaving(true);
    setProfileStatusMessage("");
    setProfileErrorMessage("");
    try {
      await apiPut("/me/profile", {
        ...profile,
        section_id: profile?.section_id ? Number(profile.section_id) : null,
      });
      const freshUser = await apiGet("/me");
      setUser(freshUser);
      setData(freshUser);
      setProfile(freshUser.profile);
      setProfileStatusMessage("Профиль обновлён. Новые данные сохранены в личном кабинете.");
    } catch (err) {
      setProfileErrorMessage(err.message || "Не удалось сохранить профиль");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="dash">
      <div className="dash-head">
        <h1>Личный кабинет</h1>
        <p>Профиль участника, секция и персональное расписание.</p>
      </div>

      <div className="dash-overview">
        <div className="dash-summary-grid">
          <article className="dash-summary-card">
            <div className="dash-summary-head">
              <span className="dash-summary-label">Формат участия</span>
              <Badge variant="neutral">{participationLabel(currentUserType)}</Badge>
            </div>
            <strong>{profile?.full_name || "Участник"}</strong>
            <p>{selectedSectionTitle || "Секция пока не выбрана"}</p>
          </article>

          <article className="dash-summary-card">
            <div className="dash-summary-head">
              <span className="dash-summary-label">Ваше расписание</span>
              {status ? <Badge variant={status.variant}>{status.label}</Badge> : null}
            </div>
            {hasAssignment ? (
              <>
                <strong>{schedule.section_title || "Ваша секция"}</strong>
                <p>
                  {scheduleTimeLabel}
                  {scheduleRoom ? ` • ${scheduleRoom}` : ""}
                </p>
              </>
            ) : (
              <>
                <strong>Назначение формируется</strong>
                <p>Секция, аудитория и время появятся после утверждения программы.</p>
              </>
            )}
          </article>
        </div>

        <div className="dash-actions">
          <Button variant="ghost" onClick={() => setTab("profile")}>
            Проверить профиль
          </Button>
          <Button variant="ghost" onClick={() => setTab("schedule")}>
            Открыть расписание
          </Button>
          <Link className={buttonClassName("ghost")} to="/documents">
            Открыть документы
          </Link>
          {currentUserType !== "online" ? (
            <Link className={buttonClassName("ghost")} to="/map">
              Маршрут по площадке
            </Link>
          ) : null}
        </div>
      </div>

      <div className="dash-layout">
        <aside className="dash-tabs">
          <button
            type="button"
            className={`dash-tab ${tab === "profile" ? "active" : ""}`}
            aria-current={tab === "profile" ? "page" : undefined}
            onClick={() => setTab("profile")}
          >
            Личные данные
          </button>
          <button
            type="button"
            className={`dash-tab ${tab === "schedule" ? "active" : ""}`}
            aria-current={tab === "schedule" ? "page" : undefined}
            onClick={() => setTab("schedule")}
          >
            Расписание
          </button>
        </aside>

        <div className="dash-content">
          {tab === "profile" ? (
            <Card>
              <h2 className="dash-card-title">Профиль участника</h2>
              <p className="dash-card-sub">Данные используются в программе, бейдже и сертификате.</p>
              {profileStatusMessage ? (
                <div className="dash-status dash-status-success" role="status">
                  {profileStatusMessage}
                </div>
              ) : null}
              {profileErrorMessage ? (
                <div className="dash-status dash-status-error" role="alert">
                  {profileErrorMessage}
                </div>
              ) : null}
              {profile ? (
                <>
                  <div className="dash-form-grid">
                    <Field label="ФИО" htmlFor="dash-full-name" className="dash-form-full">
                      <Input
                        id="dash-full-name"
                        value={profile.full_name || ""}
                        onChange={(e) => update("full_name", e.target.value)}
                      />
                    </Field>
                    <Field label="Организация" htmlFor="dash-organization">
                      <Input
                        id="dash-organization"
                        value={profile.organization || ""}
                        onChange={(e) => update("organization", e.target.value)}
                      />
                    </Field>
                    <Field label="Должность" htmlFor="dash-position">
                      <Input
                        id="dash-position"
                        value={profile.position || ""}
                        onChange={(e) => update("position", e.target.value)}
                      />
                    </Field>
                    <Field label="Город" htmlFor="dash-city">
                      <Input
                        id="dash-city"
                        value={profile.city || ""}
                        onChange={(e) => update("city", e.target.value)}
                      />
                    </Field>
                    <Field label="Степень" htmlFor="dash-degree">
                      <Input
                        id="dash-degree"
                        value={profile.degree || ""}
                        onChange={(e) => update("degree", e.target.value)}
                      />
                    </Field>
                    <Field label="Секция" htmlFor="dash-section">
                      <Select
                        id="dash-section"
                        value={profile.section_id ?? ""}
                        onChange={(e) =>
                          update("section_id", e.target.value ? Number(e.target.value) : null)
                        }
                      >
                        <option value="">Выберите секцию</option>
                        {sections.map((section) => (
                          <option key={section.id} value={section.id}>
                            {section.title}
                            {section.room ? ` — ${section.room}` : ""}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Доклад" htmlFor="dash-talk" className="dash-form-full">
                      <Input
                        id="dash-talk"
                        value={profile.talk_title || ""}
                        onChange={(e) => update("talk_title", e.target.value)}
                      />
                    </Field>
                    <Field label="Телефон" htmlFor="dash-phone">
                      <Input
                        id="dash-phone"
                        value={profile.phone || ""}
                        onChange={(e) => update("phone", e.target.value)}
                      />
                    </Field>
                  </div>
                  <div className="dash-sched-join">
                    <Button onClick={save} disabled={saving}>
                      {saving ? "Сохранение…" : "Сохранить изменения"}
                    </Button>
                  </div>
                </>
              ) : null}
            </Card>
          ) : null}

          {tab === "schedule" ? (
            <Card>
              <h2 className="dash-card-title">Ваше расписание</h2>
              <p className="dash-card-sub">
                Секция, аудитория и время формируются из утверждённой программы конференции.
              </p>

              <div className="dash-sched-card">
                {hasAssignment ? (
                  <>
                    <div className="dash-sched-head">
                      <strong>{schedule.section_title || "Ваша секция"}</strong>
                      {status ? <Badge variant={status.variant}>{status.label}</Badge> : null}
                    </div>
                    <dl className="dash-sched-rows">
                      {schedule.talk_title ? (
                        <div className="dash-sched-row">
                          <dt>Доклад</dt>
                          <dd>{schedule.talk_title}</dd>
                        </div>
                      ) : null}
                      <div className="dash-sched-row">
                        <dt>Время</dt>
                        <dd>{scheduleTimeLabel || "Уточняется"}</dd>
                      </div>
                      {scheduleRoom ? (
                        <div className="dash-sched-row">
                          <dt>Аудитория</dt>
                          <dd>{scheduleRoom}</dd>
                        </div>
                      ) : null}
                      <div className="dash-sched-row">
                        <dt>Формат</dt>
                        <dd>{participationLabel(currentUserType)}</dd>
                      </div>
                    </dl>
                    {currentUserType === "online" && schedule.join_url ? (
                      <div className="dash-sched-join">
                        <a
                          className={buttonClassName("primary")}
                          href={schedule.join_url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Подключиться онлайн
                        </a>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <p className="dash-sched-empty">
                    {assignmentStatus === "pending" || !assignmentStatus
                      ? "Назначение секции ещё формируется. Как только организаторы утвердят программу, здесь появятся ваша секция, аудитория и время."
                      : "Для вас пока нет назначенной секции в программе."}
                    {!selectedSectionTitle
                      ? " Выберите желаемую секцию во вкладке «Личные данные»."
                      : ` Выбранная вами секция: «${selectedSectionTitle}».`}
                  </p>
                )}
              </div>

              {currentUserType !== "online" ? (
                <div className="dash-sched-join">
                  <Link className={buttonClassName("ghost")} to="/map">
                    Открыть карту площадки
                  </Link>
                </div>
              ) : null}
            </Card>
          ) : null}
        </div>
      </div>
    </section>
  );
}
