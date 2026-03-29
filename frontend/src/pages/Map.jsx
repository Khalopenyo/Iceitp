import { useEffect, useMemo, useState } from "react";
import { apiGet } from "../lib/api.js";
import { defaultRooms } from "../data/rooms.js";
import { getSessionStatus, isCurrentSession } from "../lib/sessionStatus.js";

const normalizeRooms = (rooms) =>
  rooms.map((room) => {
    const numberMatch = room.name?.match(/\d+/);
    const number = numberMatch ? numberMatch[0] : "";
    return {
      id: room.id || room.name || number,
      floor: room.floor || (number ? Number(String(number)[0]) : 1),
      number,
      label: room.name || room.label,
    };
  });

const normalizeRoomValue = (value) => String(value || "").trim().toLowerCase();

const roomMatchesSection = (room, sectionRoom) => {
  const sectionValue = normalizeRoomValue(sectionRoom);
  if (!sectionValue) return false;
  if (room.number) {
    return sectionValue.includes(normalizeRoomValue(room.number));
  }
  const roomValue = normalizeRoomValue(room.label || room.name);
  return sectionValue === roomValue;
};

const formatTimeOnly = (value) => {
  if (!value) return "Не указано";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Не указано";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};

export default function CampusMap() {
  const [activeFloor, setActiveFloor] = useState(1);
  const [rooms, setRooms] = useState(defaultRooms);
  const [schedule, setSchedule] = useState([]);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [nowTs, setNowTs] = useState(() => Date.now());

  useEffect(() => {
    apiGet("/schedule/with-participants")
      .then((data) => {
        setSchedule(data.items || []);
        setCurrentUserId(data.current_user_id);
      })
      .catch(() => setSchedule([]));

    apiGet("/rooms")
      .then((data) => setRooms(normalizeRooms(data)))
      .catch(() => setRooms(defaultRooms));
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setNowTs(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (selectedRoom && selectedRoom.floor !== activeFloor) {
      setSelectedRoom(null);
    }
  }, [activeFloor, selectedRoom]);

  const floors = useMemo(() => {
    const unique = Array.from(new Set(rooms.map((room) => Number(room.floor) || 1)));
    return unique.sort((a, b) => a - b);
  }, [rooms]);

  useEffect(() => {
    if (!floors.length) return;
    if (!floors.includes(activeFloor)) {
      setActiveFloor(floors[0]);
    }
  }, [floors, activeFloor]);

  const roomsOnFloor = useMemo(
    () => rooms.filter((room) => room.floor === activeFloor),
    [rooms, activeFloor]
  );

  const roomSessions = useMemo(() => {
    if (!selectedRoom) return [];
    return schedule.filter((item) => roomMatchesSection(selectedRoom, item.section.room));
  }, [schedule, selectedRoom]);

  const allSections = useMemo(() => schedule.map((item) => item.section), [schedule]);
  const hasMultipleFloors = floors.length > 1;

  return (
    <section className="panel">
      <h2>Карта аудиторий</h2>
      <p className="muted">
        {hasMultipleFloors
          ? "Выберите этаж и аудиторию, чтобы посмотреть расписание и участников."
          : "Выберите аудиторию, чтобы посмотреть расписание и участников."}
      </p>

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
            const hasSession = allSections.some((section) => roomMatchesSection(room, section.room));
            const hasCurrentSession = allSections.some(
              (section) => roomMatchesSection(room, section.room) && isCurrentSession(section, nowTs)
            );
            const roomPrimary = room.number || room.label || room.name;
            const roomSecondary = room.number ? room.label || room.name : "";
            return (
              <button
                key={room.id}
                className={`room-card ${selectedRoom?.id === room.id ? "selected" : ""} ${
                  hasSession ? "busy" : ""
                }`}
                onClick={() => setSelectedRoom(room)}
              >
                <div className={`room-number ${!roomSecondary ? "single" : ""}`}>{roomPrimary}</div>
                {roomSecondary && roomSecondary !== roomPrimary && (
                  <div className="room-label">{roomSecondary}</div>
                )}
                {hasSession && (
                  <span className={`room-tag ${hasCurrentSession ? "current" : ""}`}>
                    {hasCurrentSession ? "Идет сейчас" : "Есть сессия"}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="map-sidebar">
          <div className="card">
            <h3>Аудитория</h3>
            {selectedRoom ? (
              <>
                <div className="room-detail">{selectedRoom.label || selectedRoom.name}</div>
                {roomSessions.length ? (
                  <div className="session-list">
                    {roomSessions.map((item) => {
                      const sessionStatus = getSessionStatus(item.section, nowTs);
                      const startTime = formatTimeOnly(item.section.start_at);
                      const endTime = formatTimeOnly(item.section.end_at);
                      return (
                        <div
                          key={item.section.id}
                          className={`session-item ${sessionStatus === "current" ? "highlighted" : ""}`}
                        >
                          <div className="session-head">
                            <div className="session-title">{item.section.title}</div>
                            {sessionStatus === "current" && (
                              <span className="pill pill-current">Текущая сессия</span>
                            )}
                          </div>
                          <div className="session-meta-inline">
                            <span>
                              Время: {startTime} - {endTime}
                            </span>
                          </div>
                          <div className="speaker-list-compact">
                            {item.participants.map((p) => (
                              <div
                                key={p.user_id}
                                className={`speaker-row-compact ${p.user_id === currentUserId ? "me" : ""}`}
                              >
                                <div className="speaker-row-main">
                                  <strong>{p.full_name || "Не указано"}</strong>
                                  {p.user_id === currentUserId && <span className="pill">Это вы</span>}
                                </div>
                                <div className="speaker-row-topic">{p.talk_title || "Без темы"}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="muted">В этой аудитории пока нет сессий.</p>
                )}
              </>
            ) : (
              <p className="muted">Выберите аудиторию из списка слева.</p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
