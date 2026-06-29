import Toast from "../../components/Toast.jsx";
import { useEffect, useMemo, useState } from "react";
import { apiGet, apiPut } from "../../lib/api.js";
import "./console.css";

function pad(n) { return String(n).padStart(2, "0"); }
function toLocalInput(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime()) || d.getUTCFullYear() <= 1) return "";
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function slotLabel(a) {
  if (!a?.starts_at) return "";
  const d = new Date(a.starts_at);
  if (Number.isNaN(d.getTime()) || d.getUTCFullYear() <= 1) return "";
  return d.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

// ConsoleTalks — раздел «Доклады» (вся команда): распределение поданных докладов
// участников по секциям и временным слотам через GET/PUT /admin/program. Питает
// публичную карточку секции (доклады) и «Моё расписание» участника.
export default function ConsoleTalks() {
  const [entries, setEntries] = useState([]);
  const [sections, setSections] = useState([]);
  const [editing, setEditing] = useState(null); // null | user_id
  const [form, setForm] = useState(null);
  const [query, setQuery] = useState("");
  const [onlyTalks, setOnlyTalks] = useState(true);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);

  const load = () =>
    apiGet("/admin/program").then((r) => setEntries(Array.isArray(r) ? r : [])).catch(() => setEntries([]));

  useEffect(() => {
    load();
    apiGet("/admin/sections").then((r) => setSections(Array.isArray(r) ? r : [])).catch(() => setSections([]));
  }, []);

  const openEdit = (e) => {
    const a = e.assignment;
    setForm({
      talk_title: a?.talk_title || e.submitted?.talk_title || "",
      section_id: (a?.section_id ?? e.submitted?.section_id) ?? "",
      user_type: a?.user_type || e.submitted?.user_type || "offline",
      start: toLocalInput(a?.starts_at),
      end: toLocalInput(a?.ends_at),
      join_url: a?.join_url || "",
      // Зал в этом редакторе не задаётся (его несёт секция), но существующий room_id
      // прокидываем, чтобы upsert не затирал его при сохранении.
      room_id: a?.room_id ?? null,
    });
    setEditing(e.user_id);
  };
  const cancel = () => { setEditing(null); setForm(null); };
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const save = async (userId) => {
    if (!form.talk_title.trim()) { setToast({ kind: "err", text: "Укажите тему доклада." }); return; }
    if (form.start && form.end && new Date(form.end) <= new Date(form.start)) {
      setToast({ kind: "err", text: "Окончание должно быть позже начала." });
      return;
    }
    setBusy(true); setToast(null);
    const payload = {
      user_type: form.user_type,
      section_id: form.section_id ? Number(form.section_id) : null,
      room_id: form.room_id ?? null,
      talk_title: form.talk_title.trim(),
      starts_at: form.start ? new Date(form.start).toISOString() : null,
      ends_at: form.end ? new Date(form.end).toISOString() : null,
      join_url: form.user_type === "online" ? form.join_url.trim() : "",
    };
    try {
      await apiPut(`/admin/program/${userId}`, payload);
      cancel();
      await load();
      setToast({ kind: "ok", text: "Доклад распределён — появится в программе и расписании." });
    } catch (err) {
      setToast({ kind: "err", text: err.message || "Не удалось сохранить распределение." });
    } finally {
      setBusy(false);
    }
  };

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries.filter((e) => {
      if (onlyTalks && !(e.assignment?.talk_title || e.submitted?.talk_title)) return false;
      if (!q) return true;
      return [e.full_name, e.organization, e.email, e.submitted?.talk_title, e.assignment?.talk_title]
        .filter(Boolean).join(" ").toLowerCase().includes(q);
    });
  }, [entries, query, onlyTalks]);

  return (
    <div className="con-screen">
      <Toast toast={toast} />

      <div className="con-eyebrow">Конструктор программы</div>
      <div className="con-head-row">
        <div>
          <h2 className="con-h2">Доклады и распределение</h2>
          <p className="con-sub" style={{ maxWidth: 600 }}>
            Распределите поданные доклады по секциям и временным слотам — они появятся на странице
            секции и в «Моём расписании» участника.
          </p>
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 16 }}>
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Поиск по ФИО, теме, вузу" aria-label="Поиск по ФИО, теме или вузу"
          style={{ height: 42, minWidth: 240, padding: "0 14px", border: "1px solid var(--line)", borderRadius: 9, fontFamily: "var(--con-font)", fontSize: 14 }} />
        <label className="con-check" style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, color: "var(--ink)", cursor: "pointer" }}>
          <input type="checkbox" checked={onlyTalks} onChange={(e) => setOnlyTalks(e.target.checked)} />
          Только с докладом
        </label>
      </div>

      {visible.length ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {visible.map((e) => {
            const a = e.assignment;
            const assigned = Boolean(a?.section_title || a?.starts_at);
            const isEditing = editing === e.user_id;
            return (
              <div key={e.user_id} className="con-card" style={{ padding: "14px 18px" }}>
                <div className="con-talk-row">
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 14.5, fontWeight: 600, color: "var(--ink)" }}>{e.full_name || e.email}</div>
                    <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      «{a?.talk_title || e.submitted?.talk_title || "без доклада"}»{e.organization ? ` · ${e.organization}` : ""}
                    </div>
                  </div>
                  <span className="con-person-role" style={{ fontSize: 13, color: "var(--ink)" }}>{a?.section_title || (assigned ? "—" : "не распределён")}</span>
                  <span className="con-person-role" style={{ fontFamily: "var(--con-mono)", fontSize: 12.5, color: "var(--muted)" }}>{slotLabel(a) || "слот не задан"}</span>
                  <button className="con-btn con-btn-ghost" style={{ height: 36 }} onClick={() => (isEditing ? cancel() : openEdit(e))}>
                    {isEditing ? "Закрыть" : assigned ? "Изменить" : "Распределить"}
                  </button>
                </div>

                {isEditing ? (
                  <div style={{ borderTop: "1px solid var(--line)", marginTop: 14, paddingTop: 14, display: "grid", gap: 12 }}>
                    <label className="con-field"><span>Тема доклада</span>
                      <input value={form.talk_title} onChange={(ev) => set("talk_title", ev.target.value)} placeholder="Название доклада" />
                    </label>
                    <div className="con-field-row" style={{ gridTemplateColumns: "2fr 1fr" }}>
                      <label className="con-field"><span>Секция</span>
                        <select value={form.section_id} onChange={(ev) => set("section_id", ev.target.value)}>
                          <option value="">Без секции</option>
                          {sections.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
                        </select>
                      </label>
                      <label className="con-field"><span>Формат</span>
                        <select value={form.user_type} onChange={(ev) => set("user_type", ev.target.value)}>
                          <option value="offline">Очно</option>
                          <option value="online">Онлайн</option>
                        </select>
                      </label>
                    </div>
                    <div className="con-field-row">
                      <label className="con-field"><span>Начало</span>
                        <input type="datetime-local" value={form.start} onChange={(ev) => set("start", ev.target.value)} />
                      </label>
                      <label className="con-field"><span>Окончание</span>
                        <input type="datetime-local" value={form.end} onChange={(ev) => set("end", ev.target.value)} />
                      </label>
                    </div>
                    {form.user_type === "online" ? (
                      <label className="con-field"><span>Ссылка на трансляцию доклада</span>
                        <input value={form.join_url} onChange={(ev) => set("join_url", ev.target.value)} placeholder="https://…" />
                      </label>
                    ) : null}
                    <div style={{ display: "flex", gap: 10 }}>
                      <button type="button" className="con-btn" disabled={busy} onClick={() => save(e.user_id)}>{busy ? "Сохраняем…" : "Сохранить"}</button>
                      <button type="button" className="con-btn con-btn-ghost" onClick={cancel}>Отмена</button>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="con-soon">
          {entries.length === 0 ? "Участников пока нет." : "Нет участников по фильтру. Снимите «Только с докладом» или измените поиск."}
        </div>
      )}
    </div>
  );
}
