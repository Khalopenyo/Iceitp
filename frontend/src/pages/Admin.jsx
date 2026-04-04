import { useEffect, useEffectEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiDelete, apiGet, apiPost, apiPut } from "../lib/api.js";
import AdminProgramTab from "../components/admin/AdminProgramTab.jsx";
import { defaultRooms } from "../data/rooms.js";

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
      {open && (
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
      )}
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

export default function Admin() {
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [sections, setSections] = useState([]);
  const [consents, setConsents] = useState([]);
  const [feedbackEntries, setFeedbackEntries] = useState([]);
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
  const [antiplagiatForm, setAntiplagiatForm] = useState({
    site_url: "",
    wsdl_url: "",
    api_login: "",
    api_password: "",
    enabled: false,
    add_to_index: false,
    check_services: [],
    allow_short_report: true,
    allow_readonly_report: true,
    allow_editable_report: false,
    allow_pdf_report: true,
    has_password: false,
    env_overrides: {
      site_url: false,
      wsdl_url: false,
      api_login: false,
      api_password: false,
      enabled: false,
    },
  });
  const [availableCheckServices, setAvailableCheckServices] = useState([]);
  const [loadingCheckServices, setLoadingCheckServices] = useState(false);
  const [savingAntiplagiat, setSavingAntiplagiat] = useState(false);
  const [pingingAntiplagiat, setPingingAntiplagiat] = useState(false);
  const [antiplagiatPing, setAntiplagiatPing] = useState("");
  const [checkinToken, setCheckinToken] = useState("");
  const [verifyingCheckin, setVerifyingCheckin] = useState(false);
  const [checkinResult, setCheckinResult] = useState(null);
  const [sectionForm, setSectionForm] = useState({
    title: "",
    description: "",
    room: "",
    capacity: 10,
    start_at: "",
    end_at: "",
  });
  const [roomForm, setRoomForm] = useState({ floor: 1, name: "" });

  const loadAntiplagiatServices = async () => {
    setLoadingCheckServices(true);
    try {
      const response = await apiGet("/admin/antiplagiat/services");
      setAvailableCheckServices(response?.items || []);
    } catch {
      setAvailableCheckServices([]);
    } finally {
      setLoadingCheckServices(false);
    }
  };

  const load = () => {
    apiGet("/admin/users").then(setUsers).catch(handleForbidden);
    apiGet("/sections").then(setSections).catch(() => setSections([]));
    apiGet("/admin/consents").then(setConsents).catch(() => setConsents([]));
    apiGet("/admin/feedback").then(setFeedbackEntries).catch(() => setFeedbackEntries([]));
    apiGet("/rooms").then(setRooms).catch(() => setRooms(defaultRooms));
    apiGet("/admin/conference")
      .then((conf) => {
        setConferenceForm({
          title: conf.title || "",
          description: conf.description || "",
          status: conf.status || "draft",
          starts_at: toInputDateTime(conf.starts_at),
          ends_at: toInputDateTime(conf.ends_at),
          proceedings_url: conf.proceedings_url || "",
          support_email: conf.support_email || "",
        });
      })
      .catch(() => {});
    apiGet("/admin/antiplagiat/config")
      .then((config) => {
        setAntiplagiatForm({
          site_url: config.site_url || "",
          wsdl_url: config.wsdl_url || "",
          api_login: config.api_login || "",
          api_password: "",
          enabled: Boolean(config.enabled),
          add_to_index: Boolean(config.add_to_index),
          check_services: config.check_services || [],
          allow_short_report: config.allow_short_report !== false,
          allow_readonly_report: config.allow_readonly_report !== false,
          allow_editable_report: Boolean(config.allow_editable_report),
          allow_pdf_report: config.allow_pdf_report !== false,
          has_password: Boolean(config.has_password),
          env_overrides: {
            site_url: Boolean(config.env_overrides?.site_url),
            wsdl_url: Boolean(config.env_overrides?.wsdl_url),
            api_login: Boolean(config.env_overrides?.api_login),
            api_password: Boolean(config.env_overrides?.api_password),
            enabled: Boolean(config.env_overrides?.enabled),
          },
        });
        if (config.site_url || config.wsdl_url || config.api_login || config.has_password || config.env_overrides?.api_password) {
          loadAntiplagiatServices();
        } else {
          setAvailableCheckServices([]);
        }
      })
      .catch(() => {
        setAvailableCheckServices([]);
      });
  };

  const loadOnMount = useEffectEvent(() => {
    load();
  });

  useEffect(() => {
    loadOnMount();
  }, []);

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
      load();
    } catch {
      handleForbidden();
    }
  };

  // sessions removed; no auto-assign

  const seedDemo = async () => {
    try {
      await apiPost("/admin/seed-demo", {});
      alert("Тестовые данные созданы");
      load();
    } catch {
      handleForbidden();
    }
  };

  const updateRole = async (id, role) => {
    try {
      await apiPut(`/admin/users/${id}/role`, { role });
      load();
    } catch {
      handleForbidden();
    }
  };

  const deleteUser = async (id) => {
    if (!confirm("Удалить пользователя и связанные данные?")) return;
    try {
      await apiDelete(`/admin/users/${id}`);
      load();
    } catch {
      handleForbidden();
    }
  };

  const deleteSection = async (id) => {
    if (!confirm("Удалить секцию и все сессии в ней?")) return;
    try {
      await apiDelete(`/admin/sections/${id}`);
      load();
    } catch {
      handleForbidden();
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
      load();
    } catch {
      handleForbidden();
    }
  };

  const saveConference = async (e) => {
    e.preventDefault();
    if (!conferenceForm.title.trim()) {
      alert("Укажите название конференции");
      return;
    }
    setSavingConference(true);
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
      alert("Параметры конференции сохранены");
      load();
    } catch {
      handleForbidden();
    } finally {
      setSavingConference(false);
    }
  };

  const toggleCheckService = (code) => {
    setAntiplagiatForm((prev) => {
      const exists = prev.check_services.includes(code);
      return {
        ...prev,
        check_services: exists
          ? prev.check_services.filter((item) => item !== code)
          : [...prev.check_services, code],
      };
    });
  };

  const saveAntiplagiat = async (e) => {
    e.preventDefault();
    if (!antiplagiatForm.site_url.trim() || !antiplagiatForm.wsdl_url.trim() || !antiplagiatForm.api_login.trim()) {
      alert("Укажите адрес кабинета, WSDL и API-логин");
      return;
    }
    setSavingAntiplagiat(true);
    setAntiplagiatPing("");
    try {
      const saved = await apiPut("/admin/antiplagiat/config", {
        site_url: antiplagiatForm.site_url,
        wsdl_url: antiplagiatForm.wsdl_url,
        api_login: antiplagiatForm.api_login,
        api_password: antiplagiatForm.api_password,
        enabled: antiplagiatForm.enabled,
        add_to_index: antiplagiatForm.add_to_index,
        check_services: antiplagiatForm.check_services,
        allow_short_report: antiplagiatForm.allow_short_report,
        allow_readonly_report: antiplagiatForm.allow_readonly_report,
        allow_editable_report: antiplagiatForm.allow_editable_report,
        allow_pdf_report: antiplagiatForm.allow_pdf_report,
      });
      setAntiplagiatForm((prev) => ({
        ...prev,
        site_url: saved.site_url || prev.site_url,
        wsdl_url: saved.wsdl_url || prev.wsdl_url,
        api_login: saved.api_login || prev.api_login,
        enabled: Boolean(saved.enabled),
        add_to_index: Boolean(saved.add_to_index),
        check_services: saved.check_services || prev.check_services,
        allow_short_report: saved.allow_short_report !== false,
        allow_readonly_report: saved.allow_readonly_report !== false,
        allow_editable_report: Boolean(saved.allow_editable_report),
        allow_pdf_report: saved.allow_pdf_report !== false,
        api_password: "",
        has_password: Boolean(saved.has_password),
        env_overrides: {
          site_url: Boolean(saved.env_overrides?.site_url),
          wsdl_url: Boolean(saved.env_overrides?.wsdl_url),
          api_login: Boolean(saved.env_overrides?.api_login),
          api_password: Boolean(saved.env_overrides?.api_password),
          enabled: Boolean(saved.env_overrides?.enabled),
        },
      }));
      await loadAntiplagiatServices();
      alert("Настройки Антиплагиата сохранены");
    } catch (err) {
      alert(err.message || "Не удалось сохранить настройки Антиплагиата");
    } finally {
      setSavingAntiplagiat(false);
    }
  };

  const pingAntiplagiat = async () => {
    setPingingAntiplagiat(true);
    setAntiplagiatPing("");
    try {
      const result = await apiPost("/admin/antiplagiat/ping", {});
      await loadAntiplagiatServices();
      setAntiplagiatPing(`Соединение успешно: ${result.result || "ok"}`);
    } catch (err) {
      setAntiplagiatPing(err.message || "Не удалось проверить подключение");
    } finally {
      setPingingAntiplagiat(false);
    }
  };

  const verifyCheckin = async (e) => {
    e.preventDefault();
    const token = checkinToken.trim();
    if (!token) return;
    setVerifyingCheckin(true);
    setCheckinResult(null);
    try {
      const data = await apiPost("/admin/checkin/verify", { token });
      setCheckinResult(data);
      alert(data.already_checked_in ? "Участник уже отмечен" : "Check-in выполнен");
      setCheckinToken("");
    } catch (err) {
      alert(err.message || "Не удалось выполнить check-in");
    } finally {
      setVerifyingCheckin(false);
    }
  };

  const deleteRoom = async (id) => {
    if (!confirm("Удалить аудиторию из списка?")) return;
    try {
      await apiDelete(`/admin/rooms/${id}`);
      load();
    } catch {
      handleForbidden();
    }
  };

  const handleForbidden = () => {
    navigate("/forbidden", { replace: true });
  };

  const antiplagiatUsesEnv = Object.values(antiplagiatForm.env_overrides || {}).some(Boolean);

  return (
    <section className="panel">
      <h2>Администрирование</h2>
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
          <button className={`tab-btn ${tab === "tools" ? "active" : ""}`} onClick={() => setTab("tools")}>
            Инструменты
          </button>
        </aside>
        <div className="dashboard-content">
          {tab === "users" && (
            <div className="card">
              <h3>Пользователи</h3>
              <div className="table">
                {users.map((u) => (
                  <div key={u.id} className="row">
                    <div>
                      <strong>{u.profile?.full_name || u.email}</strong>
                      <div className="muted">{u.email}</div>
                    </div>
                    <div className="row-actions">
                      <span className="pill">{u.role}</span>
                      <button className="btn btn-ghost" onClick={() => updateRole(u.id, "org")}>
                        Оргкомитет
                      </button>
                      <button className="btn btn-ghost" onClick={() => updateRole(u.id, "admin")}>
                        Админ
                      </button>
                      <button className="btn btn-danger" onClick={() => deleteUser(u.id)}>
                        Удалить
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {tab === "sections" && (
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
                {sections.map((s) => (
                  <div key={s.id} className="row">
                    <div>
                      <strong>{s.title}</strong>
                      <div className="muted">
                        {s.room || "Без аудитории"} ·{" "}
                        {s.start_at ? new Date(s.start_at).toLocaleString() : "Без времени"}
                      </div>
                    </div>
                    <button className="btn btn-danger" onClick={() => deleteSection(s.id)}>
                      Удалить
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
          {tab === "program" && <AdminProgramTab />}
          {tab === "rooms" && (
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
                    {room.id && (
                      <button className="btn btn-danger" onClick={() => deleteRoom(room.id)}>
                        Удалить
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
          {tab === "consents" && (
            <div className="card">
              <h3>Логи согласий</h3>
              <div className="table compact">
                {consents.map((c) => (
                  <div key={c.id} className="row">
                    <div>
                      <strong>Пользователь #{c.user_id}</strong>
                      <div className="muted">{new Date(c.granted_at).toLocaleString()}</div>
                    </div>
                    <div className="row-actions">
                      <span className="pill">{c.consent_version}</span>
                      <span className="muted">{c.ip}</span>
                    </div>
                  </div>
                ))}
              </div>
              {consents.length === 0 && <p className="muted">Записей пока нет.</p>}
            </div>
          )}
          {tab === "feedback" && (
            <div className="card">
              <h3>Отзывы участников</h3>
              <p className="muted">Все отправленные отзывы и предложения по улучшению конференции.</p>
              <div className="table compact">
                {feedbackEntries.map((entry) => (
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
              {feedbackEntries.length === 0 && <p className="muted">Отзывов пока нет.</p>}
            </div>
          )}
          {tab === "tools" && (
            <div className="card">
              <h3>Инструменты</h3>
              <p className="muted">Параметры конференции и служебные действия.</p>
              <hr />
              <h4>Антиплагиат API</h4>
              <form className="form-grid" onSubmit={saveAntiplagiat}>
                {antiplagiatUsesEnv ? (
                  <p className="antiplagiat-env-note">
                    Часть параметров переопределяется через переменные окружения сервера и имеет приоритет над
                    сохраненными значениями.
                  </p>
                ) : null}
                <label>
                  Адрес кабинета Антиплагиата
                  <input
                    value={antiplagiatForm.site_url}
                    onChange={(e) => setAntiplagiatForm({ ...antiplagiatForm, site_url: e.target.value })}
                    placeholder="https://testapi.antiplagiat.ru"
                  />
                </label>
                <label>
                  WSDL
                  <input
                    value={antiplagiatForm.wsdl_url}
                    onChange={(e) => setAntiplagiatForm({ ...antiplagiatForm, wsdl_url: e.target.value })}
                    placeholder="https://api.antiplagiat.ru:4959/apiCorp/testapi?wsdl"
                  />
                </label>
                <label>
                  API-логин
                  <input
                    value={antiplagiatForm.api_login}
                    onChange={(e) => setAntiplagiatForm({ ...antiplagiatForm, api_login: e.target.value })}
                    placeholder="testapi@antiplagiat.ru"
                  />
                </label>
                <label>
                  API-пароль
                  <input
                    type="password"
                    value={antiplagiatForm.api_password}
                    onChange={(e) => setAntiplagiatForm({ ...antiplagiatForm, api_password: e.target.value })}
                    placeholder={
                      antiplagiatForm.env_overrides?.api_password
                        ? "Пароль берется из ANTIPLAGIAT_API_PASSWORD"
                        : antiplagiatForm.has_password
                          ? "Оставьте пустым, чтобы не менять"
                          : "Введите пароль API"
                    }
                  />
                </label>
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={antiplagiatForm.enabled}
                    onChange={(e) => setAntiplagiatForm({ ...antiplagiatForm, enabled: e.target.checked })}
                  />
                  <span>Интеграция включена</span>
                </label>
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={antiplagiatForm.add_to_index}
                    onChange={(e) => setAntiplagiatForm({ ...antiplagiatForm, add_to_index: e.target.checked })}
                  />
                  <span>Добавлять загруженные статьи в индекс компании для перекрестной проверки</span>
                </label>
                <div className="antiplagiat-service-section">
                  <div className="antiplagiat-service-head">
                    <div>
                      <strong>Сервисы проверки</strong>
                      <p className="muted">
                        Если ничего не выбрано, backend использует все сервисы, доступные текущему API-аккаунту.
                      </p>
                    </div>
                    <button
                      className="btn btn-ghost"
                      type="button"
                      onClick={loadAntiplagiatServices}
                      disabled={loadingCheckServices}
                    >
                      {loadingCheckServices ? "Загрузка..." : "Обновить список"}
                    </button>
                  </div>
                  {availableCheckServices.length ? (
                    <div className="antiplagiat-service-grid">
                      {availableCheckServices.map((service) => (
                        <label key={service.code} className="checkbox antiplagiat-service-card">
                          <input
                            type="checkbox"
                            checked={antiplagiatForm.check_services.includes(service.code)}
                            onChange={() => toggleCheckService(service.code)}
                          />
                          <span>
                            <strong>{service.code}</strong>
                            <small>{service.description || "Без описания"}</small>
                          </span>
                        </label>
                      ))}
                    </div>
                  ) : (
                    <p className="muted">Список сервисов пока не загружен.</p>
                  )}
                </div>
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={antiplagiatForm.allow_short_report}
                    onChange={(e) =>
                      setAntiplagiatForm({ ...antiplagiatForm, allow_short_report: e.target.checked })
                    }
                  />
                  <span>Разрешить краткий отчет пользователям</span>
                </label>
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={antiplagiatForm.allow_readonly_report}
                    onChange={(e) =>
                      setAntiplagiatForm({ ...antiplagiatForm, allow_readonly_report: e.target.checked })
                    }
                  />
                  <span>Разрешить полный readonly-отчет</span>
                </label>
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={antiplagiatForm.allow_editable_report}
                    onChange={(e) =>
                      setAntiplagiatForm({ ...antiplagiatForm, allow_editable_report: e.target.checked })
                    }
                  />
                  <span>Разрешить полный редактируемый отчет</span>
                </label>
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={antiplagiatForm.allow_pdf_report}
                    onChange={(e) => setAntiplagiatForm({ ...antiplagiatForm, allow_pdf_report: e.target.checked })}
                  />
                  <span>Разрешить PDF-отчеты</span>
                </label>
                <div className="form-actions admin-tool-actions">
                  <button className="btn btn-ghost" type="button" onClick={pingAntiplagiat} disabled={pingingAntiplagiat}>
                    {pingingAntiplagiat ? "Проверка..." : "Проверить подключение"}
                  </button>
                  <button className="btn btn-primary" type="submit" disabled={savingAntiplagiat}>
                    {savingAntiplagiat ? "Сохранение..." : "Сохранить настройки API"}
                  </button>
                </div>
              </form>
              {antiplagiatPing ? <p className="muted">{antiplagiatPing}</p> : null}
              <hr />
              <h4>Конференция</h4>
              <form className="form-grid" onSubmit={saveConference}>
                <label>
                  Название конференции
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
                    <option value="draft">draft (подготовка)</option>
                    <option value="live">live (идет сейчас)</option>
                    <option value="finished">finished (завершена)</option>
                  </select>
                </label>
                <label>
                  Начало конференции
                  <input
                    type="datetime-local"
                    value={conferenceForm.starts_at}
                    onChange={(e) => setConferenceForm({ ...conferenceForm, starts_at: e.target.value })}
                  />
                </label>
                <label>
                  Окончание конференции
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
                    placeholder="info@conference.local"
                  />
                </label>
                <label>
                  Ссылка на сборник трудов (PDF)
                  <input
                    value={conferenceForm.proceedings_url}
                    onChange={(e) => setConferenceForm({ ...conferenceForm, proceedings_url: e.target.value })}
                    placeholder="https://.../proceedings.pdf"
                  />
                </label>
                <label>
                  Описание
                  <textarea
                    rows={3}
                    value={conferenceForm.description}
                    onChange={(e) => setConferenceForm({ ...conferenceForm, description: e.target.value })}
                  />
                </label>
                <button className="btn btn-primary" type="submit" disabled={savingConference}>
                  {savingConference ? "Сохранение..." : "Сохранить параметры конференции"}
                </button>
              </form>
              <div className="form-actions">
                <button className="btn btn-ghost" onClick={seedDemo}>
                  Создать тестовое мероприятие
                </button>
              </div>
              <hr />
              <h4>Проверка бейджа (check-in)</h4>
              <form className="form-grid" onSubmit={verifyCheckin}>
                <label>
                  Токен из QR
                  <textarea
                    rows={3}
                    value={checkinToken}
                    onChange={(e) => setCheckinToken(e.target.value)}
                    placeholder="Вставьте токен из QR бейджа"
                  />
                </label>
                <button className="btn btn-primary" type="submit" disabled={verifyingCheckin || !checkinToken.trim()}>
                  {verifyingCheckin ? "Проверка..." : "Проверить и отметить"}
                </button>
              </form>
              {checkinResult && (
                <p className="muted">
                  {checkinResult.user?.full_name || "Участник"} ·{" "}
                  {checkinResult.already_checked_in ? "уже был отмечен" : "успешно отмечен"} ·{" "}
                  {new Date(checkinResult.checked_in_at).toLocaleString()}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
      <RoomMapPicker
        open={showRoomMap}
        rooms={rooms}
        onClose={() => setShowRoomMap(false)}
        onSelect={(roomName) => {
          setSectionForm({ ...sectionForm, room: roomName });
        }}
      />
    </section>
  );
}
