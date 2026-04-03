import { useEffect, useState } from "react";

const toInputDateTime = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return shifted.toISOString().slice(0, 16);
};

const toISOOrNull = (value) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
};

export default function ProgramAssignmentForm({ entry, sections, rooms, saving, onSave, onCancel }) {
  const [form, setForm] = useState({
    user_type: entry?.assignment?.user_type || entry?.submitted?.user_type || "offline",
    section_id: entry?.assignment?.section_id ?? entry?.submitted?.section_id ?? "",
    talk_title: entry?.assignment?.talk_title || entry?.submitted?.talk_title || "",
    room_id: entry?.assignment?.room_id ?? "",
    starts_at: toInputDateTime(entry?.assignment?.starts_at),
    ends_at: toInputDateTime(entry?.assignment?.ends_at),
    join_url: entry?.assignment?.join_url || "",
  });

  useEffect(() => {
    setForm({
      user_type: entry?.assignment?.user_type || entry?.submitted?.user_type || "offline",
      section_id: entry?.assignment?.section_id ?? entry?.submitted?.section_id ?? "",
      talk_title: entry?.assignment?.talk_title || entry?.submitted?.talk_title || "",
      room_id: entry?.assignment?.room_id ?? "",
      starts_at: toInputDateTime(entry?.assignment?.starts_at),
      ends_at: toInputDateTime(entry?.assignment?.ends_at),
      join_url: entry?.assignment?.join_url || "",
    });
  }, [entry]);

  const update = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  const submit = async (event) => {
    event.preventDefault();
    await onSave({
      user_type: form.user_type,
      section_id: form.section_id ? Number(form.section_id) : null,
      talk_title: form.talk_title.trim(),
      room_id: form.room_id ? Number(form.room_id) : null,
      starts_at: toISOOrNull(form.starts_at),
      ends_at: toISOOrNull(form.ends_at),
      join_url: form.join_url.trim(),
    });
  };

  return (
    <form className="form-grid" onSubmit={submit}>
      <label>
        Формат участия
        <select value={form.user_type} onChange={(event) => update("user_type", event.target.value)}>
          <option value="online">Онлайн</option>
          <option value="offline">Оффлайн</option>
        </select>
      </label>
      <label>
        Утвержденная секция
        <select value={form.section_id} onChange={(event) => update("section_id", event.target.value)}>
          <option value="">Без секции</option>
          {sections.map((section) => (
            <option key={section.id} value={section.id}>
              {section.title}
            </option>
          ))}
        </select>
      </label>
      <label>
        Утвержденное название доклада
        <input value={form.talk_title} onChange={(event) => update("talk_title", event.target.value)} required />
      </label>
      <label>
        Аудитория
        <select value={form.room_id} onChange={(event) => update("room_id", event.target.value)}>
          <option value="">Без аудитории</option>
          {rooms.map((room) => (
            <option key={room.id || room.name} value={room.id || ""}>
              {room.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Начало
        <input
          type="datetime-local"
          value={form.starts_at}
          onChange={(event) => update("starts_at", event.target.value)}
        />
      </label>
      <label>
        Окончание
        <input type="datetime-local" value={form.ends_at} onChange={(event) => update("ends_at", event.target.value)} />
      </label>
      <label>
        Внешняя ссылка для подключения
        <input
          value={form.join_url}
          onChange={(event) => update("join_url", event.target.value)}
          placeholder="https://meet.example.com/session"
        />
      </label>
      <div className="form-actions">
        <button className="btn btn-ghost" type="button" onClick={onCancel}>
          Отмена
        </button>
        <button className="btn btn-primary" type="submit" disabled={saving}>
          {saving ? "Сохранение..." : "Сохранить утвержденную запись"}
        </button>
      </div>
    </form>
  );
}
