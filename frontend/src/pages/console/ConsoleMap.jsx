import { useEffect, useRef, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { apiGet, apiPut } from "../../lib/api.js";
import "./console.css";

const COLORS = ["#4f46e5", "#b42318", "#0f766e", "#b45309", "#7c3aed", "#15803d"];
const newKey = () => `m${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;
const clamp01 = (v) => Math.max(0, Math.min(1, v));

// ConsoleMap — конструктор интерактивной карты площадки (2D-план + маркеры).
// План — картинка по URL (хранится в conference.floor_plan_url); маркеры расставляются
// перетаскиванием и сохраняются набором через PUT /admin/map/markers (ReplaceMarkers).
export default function ConsoleMap() {
  const { conference, setConference } = useOutletContext();
  const canvasRef = useRef(null);
  const dragRef = useRef(null);
  const [planUrl, setPlanUrl] = useState("");
  const [planDraft, setPlanDraft] = useState("");
  const [markers, setMarkers] = useState([]);
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    const url = conference?.floor_plan_url || "";
    setPlanUrl(url);
    setPlanDraft(url);
  }, [conference]);

  useEffect(() => {
    apiGet("/admin/map/markers")
      .then((r) => setMarkers(Array.isArray(r) ? r.map((m) => ({ ...m })) : []))
      .catch(() => setMarkers([]));
  }, []);

  const savePlan = async () => {
    setBusy(true);
    setToast(null);
    try {
      const trimmed = planDraft.trim();
      const updated = await apiPut("/admin/conference", { floor_plan_url: trimmed });
      setConference(updated);
      setPlanUrl(updated.floor_plan_url || "");
      // Без плана карта не показывается участникам и редактор скрывается — чтобы в БД
      // не осталось «осиротевших» точек, при очистке плана очищаем и набор маркеров.
      if (!trimmed && markers.length) {
        await apiPut("/admin/map/markers", []);
        setMarkers([]);
        setSelected(null);
        setToast({ kind: "ok", text: "План удалён — точки карты очищены." });
      } else {
        setToast({ kind: "ok", text: "План этажа сохранён." });
      }
    } catch (e) {
      setToast({ kind: "err", text: e.message || "Не удалось сохранить план." });
    } finally {
      setBusy(false);
    }
  };

  const addMarker = () => {
    const m = { key: newKey(), label: "Новая точка", x: 0.5, y: 0.5, floor: 1, color: COLORS[0] };
    setMarkers((prev) => [...prev, m]);
    setSelected(m.key);
  };

  const updateSelected = (patch) =>
    setMarkers((prev) => prev.map((m) => (m.key === selected ? { ...m, ...patch } : m)));

  const removeSelected = () => {
    setMarkers((prev) => prev.filter((m) => m.key !== selected));
    setSelected(null);
  };

  const pointToNorm = (clientX, clientY) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect || !rect.width || !rect.height) return null;
    return { x: clamp01((clientX - rect.left) / rect.width), y: clamp01((clientY - rect.top) / rect.height) };
  };

  // Drag через pointer capture на самой точке: события продолжают приходить, даже
  // когда курсор выходит за пределы холста (иначе drag срывался у краёв плана).
  const startDrag = (e, key) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    dragRef.current = key;
    setSelected(key);
  };
  const onPinMove = (e) => {
    if (dragRef.current == null) return;
    const p = pointToNorm(e.clientX, e.clientY);
    if (!p) return;
    setMarkers((prev) => prev.map((m) => (m.key === dragRef.current ? { ...m, x: p.x, y: p.y } : m)));
  };
  const endDrag = (e) => {
    if (e?.pointerId != null) e.currentTarget.releasePointerCapture?.(e.pointerId);
    dragRef.current = null;
  };

  // Доступность (WCAG 2.1.1): позицию точки можно двигать стрелками, Shift — крупный шаг.
  const NUDGE = 0.01;
  const onPinKeyDown = (e, key) => {
    const step = NUDGE * (e.shiftKey ? 5 : 1);
    let dx = 0;
    let dy = 0;
    if (e.key === "ArrowLeft") dx = -step;
    else if (e.key === "ArrowRight") dx = step;
    else if (e.key === "ArrowUp") dy = -step;
    else if (e.key === "ArrowDown") dy = step;
    else return;
    e.preventDefault();
    setSelected(key);
    setMarkers((prev) => prev.map((m) => (m.key === key ? { ...m, x: clamp01(m.x + dx), y: clamp01(m.y + dy) } : m)));
  };

  const save = async () => {
    for (const m of markers) {
      if (!m.label.trim()) {
        setToast({ kind: "err", text: "У каждой точки должна быть подпись." });
        setSelected(m.key);
        return;
      }
    }
    setBusy(true);
    setToast(null);
    try {
      await apiPut("/admin/map/markers", markers.map((m) => ({
        key: m.key, label: m.label.trim(), x: m.x, y: m.y, floor: m.floor || 1, color: m.color || COLORS[0],
      })));
      setToast({ kind: "ok", text: "Карта сохранена — участники увидят её на экране «Карта»." });
    } catch (e) {
      setToast({ kind: "err", text: e.message || "Не удалось сохранить карту." });
    } finally {
      setBusy(false);
    }
  };

  const sel = markers.find((m) => m.key === selected) || null;

  return (
    <div className="con-screen">
      {toast ? <div className={`con-toast ${toast.kind}`} role={toast.kind === "err" ? "alert" : "status"}>{toast.text}</div> : null}

      <div className="con-eyebrow">Навигация площадки</div>
      <div className="con-head-row">
        <div>
          <h2 className="con-h2">Карта площадки</h2>
          <p className="con-sub" style={{ maxWidth: 580 }}>
            Загрузите план этажа (ссылкой) и расставьте на нём точки — залы, регистрацию, фуршет.
            Участники увидят интерактивную карту на экране «Карта».
          </p>
        </div>
        <button className="con-btn" onClick={save} disabled={busy || !planUrl}>{busy ? "Сохраняем…" : "Сохранить карту"}</button>
      </div>

      <div className="con-card" style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 14 }}>
        <label className="con-field" style={{ flex: 1, minWidth: 280, marginBottom: 0 }}>
          <span>Ссылка на план этажа (изображение)</span>
          <input value={planDraft} onChange={(e) => setPlanDraft(e.target.value)} placeholder="https://…/floor-plan.png" />
        </label>
        <button className="con-btn con-btn-ghost" onClick={savePlan} disabled={busy || planDraft.trim() === planUrl}>Сохранить план</button>
      </div>

      {planUrl ? (
        <div className="con-map-grid">
          <div>
            <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
              <button className="con-btn con-btn-ghost" onClick={addMarker}>+ Добавить точку</button>
              <span className="con-sub" style={{ margin: 0, alignSelf: "center" }}>Перетащите точку или двигайте стрелками (Shift — крупный шаг). Клик — выбрать.</span>
            </div>
            <div ref={canvasRef} className="con-map-canvas">
              <img src={planUrl} alt="План этажа" draggable={false} />
              {markers.map((m) => (
                <button
                  key={m.key}
                  type="button"
                  className={`con-map-pin${selected === m.key ? " active" : ""}`}
                  style={{ left: `${m.x * 100}%`, top: `${m.y * 100}%`, background: m.color || COLORS[0] }}
                  title={m.label}
                  aria-label={`Точка: ${m.label}`}
                  aria-pressed={selected === m.key}
                  onPointerDown={(e) => startDrag(e, m.key)}
                  onPointerMove={onPinMove}
                  onPointerUp={endDrag}
                  onKeyDown={(e) => onPinKeyDown(e, m.key)}
                  onClick={(e) => { e.stopPropagation(); setSelected(m.key); }}
                >
                  <span className="con-map-pin-label">{m.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="con-card" style={{ alignSelf: "start" }}>
            {sel ? (
              <>
                <div className="con-card-title">Точка</div>
                <label className="con-field"><span>Подпись</span>
                  <input value={sel.label} onChange={(e) => updateSelected({ label: e.target.value })} autoFocus />
                </label>
                <div className="con-field-label">Цвет</div>
                <div className="con-swatches" style={{ marginBottom: 14 }}>
                  {COLORS.map((c) => (
                    <button key={c} type="button" className={`con-swatch ${sel.color === c ? "active" : ""}`} style={{ background: c, color: c }} aria-label={`Цвет ${c}`} aria-pressed={sel.color === c} onClick={() => updateSelected({ color: c })} />
                  ))}
                </div>
                <button className="con-btn con-btn-ghost" onClick={removeSelected} style={{ color: "var(--danger)", borderColor: "var(--danger-line)" }}>Удалить точку</button>
              </>
            ) : (
              <p className="con-sub" style={{ margin: 0 }}>
                {markers.length ? "Выберите точку на плане, чтобы изменить." : "Точек пока нет — нажмите «Добавить точку»."}
              </p>
            )}
          </div>
        </div>
      ) : (
        <div className="con-soon">Сначала укажите ссылку на изображение плана этажа выше — затем появится холст для расстановки точек.</div>
      )}
    </div>
  );
}
