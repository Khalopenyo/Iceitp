import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { apiPut } from "../../lib/api.js";
import "./console.css";

const FORMATS = [
  { v: "hybrid", label: "Очно и онлайн" },
  { v: "offline", label: "Только очно" },
  { v: "online", label: "Только онлайн" },
];
const TABS = [
  { k: "main", label: "Основное" },
  { k: "venue", label: "Площадка" },
  { k: "stream", label: "Трансляции" },
];

function pad(n) {
  return String(n).padStart(2, "0");
}
function toDateInput(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime()) || d.getUTCFullYear() <= 1) return "";
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// ConsoleSettings — раздел «Настройки конференции» (owner-only). Редактирует поля
// конференции, питающие публичный сайт: hero/описание/даты/формат/контакты (Основное),
// адрес/карта/проезд (Площадка), ссылки эфиров (Трансляции). Один PUT /admin/conference.
export default function ConsoleSettings() {
  const { conference, setConference } = useOutletContext();
  const [tab, setTab] = useState("main");
  const [f, setF] = useState(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    if (!conference) return;
    setF({
      title: conference.title || "",
      description: conference.description || "",
      starts_at: toDateInput(conference.starts_at),
      ends_at: toDateInput(conference.ends_at),
      format: conference.format || "hybrid",
      support_email: conference.support_email || "",
      support_phone: conference.support_phone || "",
      proceedings_url: conference.proceedings_url || "",
      venue_address: conference.venue_address || "",
      venue_map_url: conference.venue_map_url || "",
      venue_transport: conference.venue_transport || "",
      live_stream_url: conference.live_stream_url || "",
      stream_vk_url: conference.stream_vk_url || "",
      stream_youtube_url: conference.stream_youtube_url || "",
      stream_rutube_url: conference.stream_rutube_url || "",
    });
  }, [conference]);

  if (!f) {
    return <div className="con-screen"><div className="con-soon">Загрузка настроек…</div></div>;
  }

  const set = (k, v) => setF((prev) => ({ ...prev, [k]: v }));

  const save = async () => {
    if (!f.title.trim()) {
      setToast({ kind: "err", text: "Укажите название конференции." });
      setTab("main");
      return;
    }
    setSaving(true);
    setToast(null);
    try {
      const payload = {
        title: f.title.trim(),
        description: f.description.trim(),
        format: f.format,
        support_email: f.support_email.trim(),
        support_phone: f.support_phone.trim(),
        proceedings_url: f.proceedings_url.trim(),
        venue_address: f.venue_address.trim(),
        venue_map_url: f.venue_map_url.trim(),
        venue_transport: f.venue_transport.trim(),
        live_stream_url: f.live_stream_url.trim(),
        stream_vk_url: f.stream_vk_url.trim(),
        stream_youtube_url: f.stream_youtube_url.trim(),
        stream_rutube_url: f.stream_rutube_url.trim(),
      };
      // Даты — date-only: фиксируем рабочее время (как в онбординге), чтобы не плодить TZ-сюрпризы.
      // Намеренно change-only: пустое поле НЕ шлём (бэкенд partial-update оставит прежнюю дату),
      // т.к. *time.Time не различает «не прислано» и «очистить». Дату можно изменить, но не снять —
      // снятие даты конференции не нужно в потоке организатора (см. ревью CMS, low).
      if (f.starts_at) payload.starts_at = new Date(`${f.starts_at}T10:00:00`).toISOString();
      if (f.ends_at) payload.ends_at = new Date(`${f.ends_at}T18:00:00`).toISOString();
      const updated = await apiPut("/admin/conference", payload);
      setConference(updated);
      setToast({ kind: "ok", text: "Настройки сохранены — участники увидят их на сайте." });
    } catch (e) {
      setToast({ kind: "err", text: e.message || "Не удалось сохранить настройки." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="con-screen">
      {toast ? <div className={`con-toast ${toast.kind}`} role={toast.kind === "err" ? "alert" : "status"}>{toast.text}</div> : null}

      <div className="con-eyebrow">Контент сайта</div>
      <div className="con-head-row">
        <div>
          <h2 className="con-h2">Настройки конференции</h2>
          <p className="con-sub" style={{ maxWidth: 560 }}>
            Эти данные питают публичный сайт: главную, площадку и трансляции. Меняйте — и сайт
            обновится сразу после сохранения.
          </p>
        </div>
        <button className="con-btn" onClick={save} disabled={saving}>
          {saving ? "Сохраняем…" : "Сохранить"}
        </button>
      </div>

      <div className="con-tabs" role="tablist" aria-label="Разделы настроек">
        {TABS.map((t) => (
          <button
            key={t.k}
            type="button"
            role="tab"
            aria-selected={tab === t.k}
            className={`con-tab ${tab === t.k ? "active" : ""}`}
            onClick={() => setTab(t.k)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "main" ? (
        <div className="con-card" style={{ display: "grid", gap: 14 }}>
          <label className="con-field"><span>Название конференции</span>
            <input value={f.title} onChange={(e) => set("title", e.target.value)} placeholder="Цифровая экономика и общество 2026" />
          </label>
          <label className="con-field"><span>Описание</span>
            <textarea value={f.description} onChange={(e) => set("description", e.target.value)} placeholder="Короткое описание конференции для главной страницы." />
          </label>
          <div className="con-field-row">
            <label className="con-field"><span>Дата начала</span>
              <input type="date" value={f.starts_at} onChange={(e) => set("starts_at", e.target.value)} />
            </label>
            <label className="con-field"><span>Дата окончания</span>
              <input type="date" value={f.ends_at} onChange={(e) => set("ends_at", e.target.value)} />
            </label>
          </div>
          <div>
            <span style={{ fontSize: "12.5px", fontWeight: 600, color: "var(--muted)", display: "block", marginBottom: "8px" }}>Формат участия</span>
            <div className="con-format-row">
              {FORMATS.map((opt) => (
                <button key={opt.v} type="button" className={`con-format ${f.format === opt.v ? "active" : ""}`} onClick={() => set("format", opt.v)} aria-pressed={f.format === opt.v}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <div className="con-field-row">
            <label className="con-field"><span>E-mail поддержки</span>
              <input type="email" value={f.support_email} onChange={(e) => set("support_email", e.target.value)} placeholder="info@university.ru" />
            </label>
            <label className="con-field"><span>Телефон поддержки</span>
              <input value={f.support_phone} onChange={(e) => set("support_phone", e.target.value)} placeholder="+7 900 000-00-00" />
            </label>
          </div>
          <label className="con-field"><span>Ссылка на сборник трудов</span>
            <input value={f.proceedings_url} onChange={(e) => set("proceedings_url", e.target.value)} placeholder="https://…/proceedings.pdf" />
            <span className="con-field-hint">Появится участникам в разделе «Документы» после конференции.</span>
          </label>
        </div>
      ) : null}

      {tab === "venue" ? (
        <div className="con-card" style={{ display: "grid", gap: 14 }}>
          <label className="con-field"><span>Адрес площадки</span>
            <input value={f.venue_address} onChange={(e) => set("venue_address", e.target.value)} placeholder="г. Грозный, проспект Х. Исаева, 100" />
          </label>
          <label className="con-field"><span>Ссылка на карту</span>
            <input value={f.venue_map_url} onChange={(e) => set("venue_map_url", e.target.value)} placeholder="https://yandex.ru/maps/…" />
            <span className="con-field-hint">Кнопка «Построить маршрут» на экране «Площадка».</span>
          </label>
          <label className="con-field"><span>Как добраться</span>
            <textarea value={f.venue_transport} onChange={(e) => set("venue_transport", e.target.value)} placeholder="Метро, парковка, вход — каждый пункт с новой строки." />
            <span className="con-field-hint">Каждая строка — отдельный абзац на публичном экране.</span>
          </label>
        </div>
      ) : null}

      {tab === "stream" ? (
        <div className="con-card" style={{ display: "grid", gap: 14 }}>
          <label className="con-field"><span>Встроенный плеер (iframe URL)</span>
            <input value={f.live_stream_url} onChange={(e) => set("live_stream_url", e.target.value)} placeholder="https://vkvideo.ru/video_ext.php?…" />
            <span className="con-field-hint">Ссылка для встраивания — показывается плеером на экране «Трансляции».</span>
          </label>
          <label className="con-field"><span>VK Видео</span>
            <input value={f.stream_vk_url} onChange={(e) => set("stream_vk_url", e.target.value)} placeholder="https://vk.com/video…" />
          </label>
          <label className="con-field"><span>YouTube</span>
            <input value={f.stream_youtube_url} onChange={(e) => set("stream_youtube_url", e.target.value)} placeholder="https://youtube.com/…" />
          </label>
          <label className="con-field"><span>Rutube</span>
            <input value={f.stream_rutube_url} onChange={(e) => set("stream_rutube_url", e.target.value)} placeholder="https://rutube.ru/…" />
          </label>
        </div>
      ) : null}
    </div>
  );
}
