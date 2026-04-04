import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { apiGet } from "../lib/api.js";
import { getSessionStatus, isCurrentSession } from "../lib/sessionStatus.js";

const formatTimeOnly = (value) => {
  if (!value) return "Не указано";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Не указано";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};

const sessionTimeState = (session, nowTs) =>
  getSessionStatus(
    {
      start_at: session?.starts_at,
      end_at: session?.ends_at,
    },
    nowTs
  );

export default function CampusMap() {
  const [activeFloor, setActiveFloor] = useState(1);
  const [rooms, setRooms] = useState([]);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [currentUserType, setCurrentUserType] = useState("");
  const [assignmentStatus, setAssignmentStatus] = useState("pending");
  const [selectedRoomId, setSelectedRoomId] = useState(null);
  const [nowTs, setNowTs] = useState(() => Date.now());

  useEffect(() => {
    apiGet("/schedule/with-participants")
      .then((data) => {
        const items = data?.items || [];
        setRooms(items);
        setCurrentUserId(data?.current_user_id ?? null);
        setCurrentUserType(data?.current_user_type || "");
        setAssignmentStatus(data?.assignment_status || "pending");
        setSelectedRoomId((prev) => prev ?? items[0]?.room_id ?? null);
      })
      .catch(() => {
        setRooms([]);
        setCurrentUserId(null);
        setCurrentUserType("");
        setAssignmentStatus("pending");
        setSelectedRoomId(null);
      });
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setNowTs(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);

  const floors = useMemo(() => {
    const unique = Array.from(new Set(rooms.map((room) => Number(room.room_floor) || 1)));
    return unique.sort((a, b) => a - b);
  }, [rooms]);

  useEffect(() => {
    if (!floors.length) return;
    if (!floors.includes(activeFloor)) {
      setActiveFloor(floors[0]);
    }
  }, [floors, activeFloor]);

  const roomsOnFloor = useMemo(
    () => rooms.filter((room) => (Number(room.room_floor) || 1) === activeFloor),
    [rooms, activeFloor]
  );

  const selectedRoom = useMemo(
    () => rooms.find((room) => room.room_id === selectedRoomId) || null,
    [rooms, selectedRoomId]
  );

  const roomSessions = selectedRoom?.sessions || [];
  const hasMultipleFloors = floors.length > 1;
  const isOnlineParticipant = currentUserType === "online";

  if (isOnlineParticipant) {
    return (
      <section className="panel map-page">
        <h2>Карта аудиторий</h2>
        <div className="card">
          <h3>Карта не требуется для онлайн-участия</h3>
          <p className="muted">
            Для онлайн-участников основное действие находится во вкладке расписания личного кабинета: там публикуется
            ссылка на подключение к видеоконференции.
          </p>
          <div className="form-actions">
            <Link className="btn btn-primary" to="/dashboard">
              Перейти в кабинет
            </Link>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="panel map-page">
      <h2>Карта аудиторий</h2>
      <p className="muted">
        {hasMultipleFloors
          ? "Выберите этаж и аудиторию, чтобы посмотреть официальные офлайн-сессии."
          : "Выберите аудиторию, чтобы посмотреть официальные офлайн-сессии."}
      </p>

      {assignmentStatus !== "approved" ? (
        <div className="card">
          <p className="muted">
            Ваше личное размещение еще не утверждено. Ниже показаны опубликованные офлайн-сессии по аудиториям.
          </p>
        </div>
      ) : null}

      {!rooms.length ? (
        <div className="card">
          <p className="muted">Офлайн-сессии с назначенными аудиториями пока не опубликованы.</p>
        </div>
      ) : (
        <div className={`map-layout ${hasMultipleFloors ? "" : "no-floors"}`.trim()}>
          {hasMultipleFloors && (
            <div className="map-floors">
              {floors.map((floor) => (
                <button
                  key={floor}
                  className={`floor-tab ${activeFloor === floor ? "active" : ""}`}
                  onClick={() => setActiveFloor(floor)}
                >
                  Этаж {floor}
                </button>
              ))}
            </div>
          )}

          <div className="map-grid">
            {roomsOnFloor.map((room) => {
              const hasCurrentSession = room.sessions?.some((session) =>
                isCurrentSession({ start_at: session.starts_at, end_at: session.ends_at }, nowTs)
              );
              return (
                <button
                  key={room.room_id}
                  className={`room-card ${selectedRoomId === room.room_id ? "selected" : ""} busy`}
                  onClick={() => setSelectedRoomId(room.room_id)}
                >
                  <div className="room-number single">{room.room_name}</div>
                  <div className="room-label">Этаж {room.room_floor || "?"}</div>
                  <span className={`room-tag ${hasCurrentSession ? "current" : ""}`}>
                    {hasCurrentSession ? "Идет сейчас" : "Есть сессии"}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="map-sidebar">
            <div className="card">
              <h3>Аудитория</h3>
              {selectedRoom ? (
                <>
                  <div className="room-detail">{selectedRoom.room_name}</div>
                  <p className="muted">Этаж {selectedRoom.room_floor || "Не указан"}</p>
                  {roomSessions.length ? (
                    <div className="session-list">
                      {roomSessions.map((session, index) => {
                        const scheduleStatus = sessionTimeState(session, nowTs);
                        const startTime = formatTimeOnly(session.starts_at);
                        const endTime = formatTimeOnly(session.ends_at);
                        return (
                          <div
                            key={`${selectedRoom.room_id}-${session.section_id || index}-${session.starts_at || "no-time"}`}
                            className={`session-item ${scheduleStatus === "current" ? "highlighted" : ""}`}
                          >
                            <div className="session-head">
                              <div className="session-title">{session.section_title || "Секция не указана"}</div>
                              {scheduleStatus === "current" && (
                                <span className="pill pill-current">Текущая сессия</span>
                              )}
                            </div>
                            <div className="session-meta-inline">
                              <span>
                                Время: {startTime} - {endTime}
                              </span>
                            </div>
                            <div className="speaker-list-compact">
                              {session.participants.map((participant) => (
                                <div
                                  key={participant.user_id}
                                  className={`speaker-row-compact ${participant.user_id === currentUserId ? "me" : ""}`}
                                >
                                  <div className="speaker-row-main">
                                    <strong>{participant.full_name || "Не указано"}</strong>
                                    {participant.user_id === currentUserId && <span className="pill">Это вы</span>}
                                  </div>
                                  <div className="speaker-row-topic">{participant.talk_title || "Без темы"}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="muted">В этой аудитории пока нет опубликованных офлайн-сессий.</p>
                  )}
                </>
              ) : (
                <p className="muted">Выберите аудиторию из списка слева.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
