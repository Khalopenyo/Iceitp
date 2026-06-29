import { initials as initialsOf } from "../../lib/format.js";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { apiGet, apiPut } from "../../lib/api.js";
import { publicSiteUrl } from "../../lib/org.js";
import "./console.css";

const initials = (name) => initialsOf(name, "У");

function daysUntil(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return Math.ceil((d.getTime() - Date.now()) / 86400000);
}

export default function Overview() {
  const navigate = useNavigate();
  const { org, conference, setConference, isOwner } = useOutletContext();
  const [landing, setLanding] = useState(null);
  const [recent, setRecent] = useState([]);
  const [publishing, setPublishing] = useState(false);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    apiGet("/admin/landing").then(setLanding).catch(() => setLanding(null));
    // role=participant: список «Последних заявок» должен совпадать со счётчиком
    // (организатор/со-админы не «заявки»).
    apiGet("/admin/users?role=participant")
      .then((r) => {
        const list = Array.isArray(r) ? r : r?.items || [];
        setRecent(list.slice(0, 4));
      })
      .catch(() => setRecent([]));
  }, []);

  const stats = landing?.stats || {};
  const published = conference?.status === "live";
  const siteUrl = publicSiteUrl(org);

  const checklist = useMemo(
    () => [
      { label: "Конференция создана", done: Boolean(conference?.id) },
      { label: "Программа и секции настроены", done: (stats.sections || 0) > 0 },
      { label: "Бренд вуза загружен", done: Boolean(org?.logo_url || org?.primary_color) },
      { label: "Сайт опубликован", done: published },
    ],
    [conference, stats.sections, org, published]
  );
  const readiness = Math.round((checklist.filter((c) => c.done).length / checklist.length) * 100);

  const dleft = daysUntil(conference?.starts_at);
  // Go-нулевая дата ("0001-01-01") валидна для Date — отсекаем по году > 1.
  const realDate = (v) => {
    const d = v ? new Date(v) : null;
    return d && !Number.isNaN(d.getTime()) && d.getUTCFullYear() > 1 ? d : null;
  };
  const dateLabel = useMemo(() => {
    const a = realDate(conference?.starts_at);
    const b = realDate(conference?.ends_at);
    if (a) {
      const opt = { day: "numeric", month: "long", year: "numeric" };
      const left = a.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
      const right = b ? b.toLocaleDateString("ru-RU", opt) : "";
      return right ? `${left} – ${right}` : a.toLocaleDateString("ru-RU", opt);
    }
    return "";
  }, [conference]);
  const FORMAT_LABEL = { hybrid: "Очно и онлайн", offline: "Только очно", online: "Только онлайн" };
  const formatLabel = FORMAT_LABEL[conference?.format] || "";

  const publish = async () => {
    // Оплата — последний шаг перед выкатом: без платного тарифа ведём на биллинг.
    if (!org?.plan || org.plan === "free") {
      navigate("/console/billing?gate=1");
      return;
    }
    setPublishing(true);
    setToast(null);
    try {
      const updated = await apiPut("/admin/conference", { status: "live" });
      setConference(updated);
      setToast({ kind: "ok", text: "Сайт опубликован — участники могут регистрироваться." });
    } catch (e) {
      setToast({ kind: "err", text: e.message || "Не удалось опубликовать сайт." });
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div className="con-screen">
      {toast ? <div className={`con-toast ${toast.kind}`} role={toast.kind === "err" ? "alert" : "status"}>{toast.text}</div> : null}

      <div className="con-head-row">
        <div>
          <div className="con-eyebrow">
            Обзор{dleft != null && dleft >= 0 ? ` · до старта ${dleft} дн.` : ""}
          </div>
          <h2 className="con-h2">{conference?.title || "Конференция не создана"}</h2>
          <p className="con-sub">
            {[dateLabel, formatLabel, org?.display_name].filter(Boolean).join(" · ") ||
              "Создайте конференцию, чтобы начать."}
          </p>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          {siteUrl ? (
            <a className="con-btn con-btn-ghost" href={siteUrl} target="_blank" rel="noreferrer">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3" /></svg>
              {published ? "Открыть сайт" : "Открыть превью"}
            </a>
          ) : null}
          {isOwner ? (
            <button className="con-btn" onClick={publish} disabled={publishing || published}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 16V4M8 8l4-4 4 4M5 20h14" /></svg>
              {published ? "Сайт опубликован" : publishing ? "Публикуем…" : "Опубликовать сайт"}
            </button>
          ) : null}
        </div>
      </div>

      <div className="con-stats">
        <div className="con-stat">
          <div className="con-stat-label">Заявок подано</div>
          <div className="con-stat-val">{stats.participants ?? 0}</div>
          <div className="con-stat-note">участники конференции</div>
        </div>
        <div className="con-stat">
          <div className="con-stat-label">Докладов</div>
          <div className="con-stat-val">{stats.talks ?? 0}</div>
          <div className="con-stat-note">с темой доклада</div>
        </div>
        <div className="con-stat">
          <div className="con-stat-label">Секций</div>
          <div className="con-stat-val">{stats.sections ?? 0}</div>
          <div className="con-stat-note">{stats.cities ?? 0} городов</div>
        </div>
        <div className="con-stat">
          <div className="con-stat-label">Готовность</div>
          <div className="con-stat-val">{readiness}%</div>
          <div className="con-bar"><span style={{ width: `${readiness}%` }} /></div>
        </div>
      </div>

      <div className="con-grid-2">
        <div className="con-card">
          <div className="con-card-title">Последние заявки</div>
          {recent.length ? (
            recent.map((u) => (
              <div className="con-row" key={u.id}>
                <span className="con-av">{initials(u.profile?.full_name)}</span>
                <span className="con-row-tx">
                  <b>{u.profile?.full_name || u.email}</b>
                  <span>{u.profile?.organization || u.profile?.talk_title || "—"}</span>
                </span>
                <span className={`con-pill ${u.profile?.talk_title ? "ok" : ""}`}>
                  {u.profile?.talk_title ? "Доклад" : "Слушатель"}
                </span>
              </div>
            ))
          ) : (
            <p className="con-sub" style={{ margin: 0 }}>Заявки появятся после публикации сайта.</p>
          )}
        </div>

        <div className="con-card">
          <div className="con-card-title">Чек-лист запуска</div>
          {checklist.map((c) => (
            <div className={`con-check ${c.done ? "done" : ""}`} key={c.label}>
              <span className="con-check-box">{c.done ? "✓" : ""}</span>
              <span>{c.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
