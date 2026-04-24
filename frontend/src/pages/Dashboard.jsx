import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiGet, apiPut } from "../lib/api.js";
import { setUser } from "../lib/auth.js";

const sectionLocationByTitle = {
  "Экономика, право и управление в условиях цифровой трансформации": "Квазар",
  "Современное общество в цифровую эпоху": "Пульсар",
  "Лингвистика и методика преподавания языков": "Дом Африки",
  "Физическое воспитание: инновации и подходы": "Нарния",
  "Наука зуммеров и альфа (молодые ученые до 35 лет)": "Гаргантюа",
};
const conferenceScheduleItems = [
  { id: "registration", time: "10:00 - 10:30", title: "Регистрация участников", place: "Холл" },
  { id: "plenary", time: "10:30 - 12:30", title: "Пленарное заседание", place: "Актовый зал" },
  { id: "buffet", time: "12:30 - 14:00", title: "Фуршет", place: "Музей ГГНТУ" },
  {
    id: "sections",
    time: "14:00 - 16:30",
    title: "Работа секций",
    place: "По секционным аудиториям",
    sessions: [
      "Экономика, право и управление в условиях цифровой трансформации — Квазар",
      "Современное общество в цифровую эпоху — Пульсар",
      "Лингвистика и методика преподавания языков — Дом Африки",
      "Физическое воспитание: инновации и подходы — Нарния",
      "Наука зуммеров и альфа (молодые ученые до 35 лет) — Гаргантюа",
    ],
  },
  { id: "closing", time: "16:30", title: "Подведение итогов", place: "Квазар" },
];
const conferenceScheduleRange = "10:00 - 16:30";

const participationLabel = (userType) => (userType === "online" ? "Онлайн-участник" : "Очный участник");

const timeLabelToMinutes = (value) => {
  const [hours, minutes] = String(value || "").split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return null;
  }
  return hours * 60 + minutes;
};

const parseScheduleWindow = (timeLabel, fallbackStart = null) => {
  const matches = String(timeLabel || "").match(/\d{2}:\d{2}/g) || [];
  if (!matches.length) {
    return { start: fallbackStart, end: fallbackStart, isPoint: true };
  }

  if (matches.length === 1) {
    const start = timeLabelToMinutes(matches[0]);
    return { start, end: start, isPoint: true };
  }

  return {
    start: timeLabelToMinutes(matches[0]),
    end: timeLabelToMinutes(matches[1]),
    isPoint: false,
  };
};

const getScheduleState = (items, nowMinutes) => {
  if (!items.length) {
    return { currentIndex: -1, nextIndex: -1, mode: "empty" };
  }

  for (let index = 0; index < items.length; index += 1) {
    const currentWindow = parseScheduleWindow(items[index].time);
    const nextWindow = index < items.length - 1 ? parseScheduleWindow(items[index + 1].time, currentWindow.start) : null;

    if (currentWindow.start == null) {
      continue;
    }

    if (nowMinutes < currentWindow.start) {
      return { currentIndex: -1, nextIndex: index, mode: "before" };
    }

    if (!currentWindow.isPoint && currentWindow.end != null && nowMinutes >= currentWindow.start && nowMinutes < currentWindow.end) {
      return {
        currentIndex: index,
        nextIndex: index < items.length - 1 ? index + 1 : -1,
        mode: "current",
      };
    }

    if (currentWindow.isPoint) {
      const pointEnd = nextWindow?.start != null && nextWindow.start > currentWindow.start
        ? nextWindow.start
        : currentWindow.start + 60;

      if (nowMinutes >= currentWindow.start && nowMinutes < pointEnd) {
        return {
          currentIndex: index,
          nextIndex: index < items.length - 1 ? index + 1 : -1,
          mode: "current",
        };
      }
    }
  }

  return {
    currentIndex: items.length - 1,
    nextIndex: -1,
    mode: "after",
  };
};

const buildScheduleInstruction = (item, userType, sectionTitle, sectionPlace) => {
  if (!item) {
    return "Расписание пока недоступно.";
  }

  if (item.id === "sections") {
    if (!sectionTitle) {
      return "Во время блока секций сначала выберите свою секцию во вкладке «Личные данные».";
    }

    if (userType === "online") {
      return `Во время секционного блока у вас секция «${sectionTitle}». Ориентируйтесь на это время для подключения онлайн.`;
    }

    return `Во время секционного блока вам нужно пройти в секцию «${sectionTitle}», место проведения — ${sectionPlace}.`;
  }

  if (userType === "online") {
    return `Сейчас ориентируйтесь на блок «${item.title}» по общему времени конференции.`;
  }

  return `Сейчас вам нужно пройти в локацию «${item.place}» на блок «${item.title}».`;
};

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [profile, setProfile] = useState(null);
  const [sections, setSections] = useState([]);
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
      setSections(response);
    } catch {
      setSections([]);
    }
  };

  useEffect(() => {
    loadDashboard();
    loadSections();
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(new Date());
    }, 30000);

    return () => {
      window.clearInterval(timer);
    };
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
  const currentUserType = data?.user_type || "offline";
  const selectedSection = sections.find((section) => String(section.id) === String(profile?.section_id));
  const selectedSectionTitle = selectedSection?.title || profile?.section_title || "";
  const selectedSectionPlace = selectedSectionTitle ? sectionLocationByTitle[selectedSectionTitle] || "Место уточняется" : "";
  const personalizedScheduleItems = conferenceScheduleItems.map((item) => {
    if (item.id !== "sections") {
      return {
        ...item,
        userTitle: item.title,
        userPlace: item.place,
        userDescription: buildScheduleInstruction(item, currentUserType, selectedSectionTitle, selectedSectionPlace),
      };
    }

    return {
      ...item,
      userTitle: selectedSectionTitle ? "Работа вашей секции" : item.title,
      userPlace: selectedSectionPlace || item.place,
      userDescription: buildScheduleInstruction(item, currentUserType, selectedSectionTitle, selectedSectionPlace),
    };
  });
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const scheduleState = getScheduleState(personalizedScheduleItems, nowMinutes);
  const currentScheduleItem =
    scheduleState.currentIndex >= 0 ? personalizedScheduleItems[scheduleState.currentIndex] : null;
  const nextScheduleItem =
    scheduleState.nextIndex >= 0 ? personalizedScheduleItems[scheduleState.nextIndex] : null;
  const liveSummaryItem = scheduleState.mode === "before" ? nextScheduleItem : currentScheduleItem;
  const liveSummaryLabel = scheduleState.mode === "before" ? "Следующий этап" : "Сейчас по расписанию";

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
      setProfileStatusMessage("Профиль обновлен. Новые данные сохранены в личном кабинете.");
    } catch (err) {
      setProfileErrorMessage(err.message || "Не удалось сохранить профиль");
    } finally {
      setSaving(false);
    }
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
              <span className="dashboard-summary-label">{liveSummaryLabel}</span>
              <span className="status-chip status-chip-neutral">{liveSummaryItem?.time || conferenceScheduleRange}</span>
            </div>
            <strong>{liveSummaryItem?.userTitle || "Общее расписание дня"}</strong>
            <p className="muted">
              {liveSummaryItem
                ? `Место: ${liveSummaryItem.userPlace}.`
                : "Холл, актовый зал, музей ГГНТУ, секционные аудитории и Квазар."}
            </p>
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
            <Link className="btn btn-ghost" to="/documents">
              Открыть документы
            </Link>
            {currentUserType !== "online" ? (
              <Link className="btn btn-ghost" to="/map">
                Маршрут по площадке
              </Link>
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
              <h3>Общее расписание конференции</h3>
              <p className="muted">Для всех участников действует единое расписание дня.</p>

              <div className="schedule-live-grid">
                <article className="schedule-live-card schedule-live-card-current">
                  <span className="dashboard-summary-label">
                    {scheduleState.mode === "before" ? "Ближайший этап" : "Сейчас вам нужно"}
                  </span>
                  <strong>{liveSummaryItem?.userTitle || "Ожидаем начало программы"}</strong>
                  <p className="muted">
                    {liveSummaryItem ? `${liveSummaryItem.time} • ${liveSummaryItem.userPlace}` : conferenceScheduleRange}
                  </p>
                  <p>{liveSummaryItem?.userDescription || "Ориентируйтесь на общее расписание дня."}</p>
                </article>

                <article className="schedule-live-card">
                  <span className="dashboard-summary-label">Дальше по расписанию</span>
                  <strong>{nextScheduleItem?.userTitle || "После этого новых этапов нет"}</strong>
                  <p className="muted">
                    {nextScheduleItem ? `${nextScheduleItem.time} • ${nextScheduleItem.userPlace}` : "Основная программа дня завершится после текущего блока."}
                  </p>
                  <p>
                    {nextScheduleItem
                      ? nextScheduleItem.userDescription
                      : "После завершения текущего блока дополнительных перемещений по расписанию не предусмотрено."}
                  </p>
                </article>

                <article className="schedule-live-card">
                  <span className="dashboard-summary-label">Ваша секция</span>
                  <strong>{selectedSectionTitle || "Секция пока не выбрана"}</strong>
                  <p className="muted">
                    {selectedSectionTitle ? `14:00 - 16:30 • ${selectedSectionPlace}` : "Выберите секцию в личных данных."}
                  </p>
                  <p>
                    {selectedSectionTitle
                      ? `Во время секционного блока вам нужно ориентироваться на аудиторию «${selectedSectionPlace}».`
                      : "Без выбранной секции кабинет не сможет подсказать, куда идти во время работы секций."}
                  </p>
                </article>
              </div>

              <div className="common-schedule-list">
                {personalizedScheduleItems.map((item, index) => (
                  <article
                    key={item.id}
                    className={[
                      "common-schedule-item",
                      scheduleState.currentIndex === index ? "common-schedule-item-active" : "",
                      scheduleState.nextIndex === index ? "common-schedule-item-next" : "",
                      scheduleState.currentIndex > index ? "common-schedule-item-completed" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    <div className="common-schedule-time">{item.time}</div>
                    <div className="common-schedule-content">
                      <div className="common-schedule-title">{item.userTitle}</div>
                      <div className="session-meta-inline">
                        {scheduleState.currentIndex === index ? <span className="status-chip status-chip-success">Сейчас</span> : null}
                        {scheduleState.nextIndex === index ? <span className="status-chip status-chip-warning">Дальше</span> : null}
                        {scheduleState.currentIndex > index ? <span className="status-chip status-chip-neutral">Пройдено</span> : null}
                      </div>
                      {item.userPlace ? <div className="muted">Место: {item.userPlace}</div> : null}
                      <p className="muted">{item.userDescription}</p>
                      {item.sessions?.length ? (
                        <div className="question-history">
                          {item.sessions.map((session) => (
                            <div
                              key={session}
                              className={
                                selectedSectionTitle && session.startsWith(selectedSectionTitle)
                                  ? "common-schedule-session-selected"
                                  : "muted"
                              }
                            >
                              {session}
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </article>
                ))}
              </div>

              <div className="schedule-general-note">
                {selectedSection ? (
                  <p className="muted">
                    Во время блока <strong>«Работа секций»</strong> вы участвуете в секции{" "}
                    <strong>{selectedSection.title}</strong>
                    {sectionLocationByTitle[selectedSection.title]
                      ? `, место проведения — ${sectionLocationByTitle[selectedSection.title]}.`
                      : "."}
                  </p>
                ) : (
                  <p className="muted">
                    Секцию можно выбрать во вкладке <strong>«Личные данные»</strong>.
                  </p>
                )}

                {currentUserType !== "online" ? (
                  <div className="form-actions">
                    <Link className="btn btn-ghost" to="/map">
                      Открыть карту площадки
                    </Link>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

        </div>
      </div>
    </section>
  );
}
