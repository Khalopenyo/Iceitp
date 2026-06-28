import { useEffect, useMemo, useRef, useState } from "react";
import { apiGet, apiPut } from "../../lib/api.js";
import "./console.css";

// Векторный конструктор схемы площадки: рисование залов/зон (прямоугольники),
// точки-маркеры, маршруты между точками, всё по этажам. Сохраняется одним PUT
// /admin/map (replace-all). Координаты нормализованы в 0..1 от холста.
const VBW = 1000;
const VBH = 700;
const MIN = 0.03; // минимальный размер фигуры (доля холста)

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const rid = (p) => `${p}${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;

// Виды фигур: подпись для палитры + цвет-заливка по умолчанию.
const KINDS = [
  { key: "room", label: "Зал", color: "#c7d2fe" },
  { key: "zone", label: "Зона", color: "#bbf7d0" },
  { key: "hall", label: "Холл / фойе", color: "#fde68a" },
  { key: "entrance", label: "Вход", color: "#fecaca" },
  { key: "stage", label: "Сцена", color: "#ddd6fe" },
  { key: "facility", label: "Сервис", color: "#e5e7eb" },
];
const KIND_LABEL = Object.fromEntries(KINDS.map((k) => [k.key, k.label]));
const SHAPE_COLORS = KINDS.map((k) => k.color);
const MARKER_COLORS = ["#4f46e5", "#b42318", "#0f766e", "#b45309", "#7c3aed", "#15803d"];
const routeId = (r) => `${r.from_key}>${r.to_key}@${r.floor}`;

const COLOR_NAMES = {
  "#4f46e5": "Индиго", "#b42318": "Красный", "#0f766e": "Бирюзовый", "#b45309": "Оранжевый", "#7c3aed": "Фиолетовый", "#15803d": "Зелёный",
  "#c7d2fe": "Голубой", "#bbf7d0": "Светло-зелёный", "#fde68a": "Жёлтый", "#fecaca": "Розовый", "#ddd6fe": "Сиреневый", "#e5e7eb": "Серый",
};
const colorName = (c) => COLOR_NAMES[c] || c;
// Обрезаем подпись по ширине фигуры (~10px на символ при 18px), чтобы текст не вылезал.
const fitLabel = (s, widthNorm) => {
  const max = Math.max(3, Math.floor((widthNorm * VBW) / 10));
  return s && s.length > max ? s.slice(0, max - 1) + "…" : s;
};

export default function ConsoleMap() {
  const svgRef = useRef(null);
  const dragRef = useRef(null); // { mode, key, ox, oy, sx, sy }
  const [floor, setFloor] = useState(1);
  const [floors, setFloors] = useState([1]);
  const [shapes, setShapes] = useState([]);
  const [markers, setMarkers] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [tool, setTool] = useState("select");
  const [sel, setSel] = useState(null); // { type:'shape'|'marker'|'route', key }
  const [draftShape, setDraftShape] = useState(null); // {x,y,w,h} пока рисуем
  const [routeDraft, setRouteDraft] = useState(null); // {from, points:[{x,y}], cursor:{x,y}}
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    apiGet("/admin/map")
      .then((r) => {
        const sh = Array.isArray(r?.shapes) ? r.shapes.map((s) => ({ ...s })) : [];
        const mk = Array.isArray(r?.markers) ? r.markers.map((m) => ({ ...m })) : [];
        const rt = Array.isArray(r?.routes)
          ? r.routes.map((x) => ({ from_key: x.from_key, to_key: x.to_key, floor: x.floor || 1, points: parsePoints(x.points) }))
          : [];
        setShapes(sh);
        setMarkers(mk);
        setRoutes(rt);
        const fs = new Set([1, ...sh.map((s) => s.floor || 1), ...mk.map((m) => m.floor || 1), ...rt.map((r2) => r2.floor || 1)]);
        setFloors([...fs].sort((a, b) => a - b));
      })
      .catch(() => {});
  }, []);

  // Esc отменяет рисование маршрута даже если фокус не на холсте (мышиный сценарий).
  useEffect(() => {
    if (!routeDraft) return undefined;
    const onEsc = (e) => { if (e.key === "Escape") setRouteDraft(null); };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [routeDraft]);

  const markerByKey = useMemo(() => Object.fromEntries(markers.map((m) => [m.key, m])), [markers]);
  const fShapes = shapes.filter((s) => (s.floor || 1) === floor);
  const fMarkers = markers.filter((m) => (m.floor || 1) === floor);
  const fRoutes = routes.filter((r) => (r.floor || 1) === floor);

  const toNorm = (e) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || !rect.width) return { x: 0, y: 0 };
    return { x: clamp01((e.clientX - rect.left) / rect.width), y: clamp01((e.clientY - rect.top) / rect.height) };
  };

  // ── создание элементов ────────────────────────────────────────────────
  const addShapeAt = (x, y, w, h) => {
    const k = KINDS[0];
    const s = { key: rid("s"), kind: k.key, label: "", x, y, w, h, floor, color: k.color };
    setShapes((p) => [...p, s]);
    setSel({ type: "shape", key: s.key });
    setTool("select");
  };
  const addMarkerAt = (x, y) => {
    const m = { key: rid("m"), label: "Новая точка", x, y, floor, color: MARKER_COLORS[0] };
    setMarkers((p) => [...p, m]);
    setSel({ type: "marker", key: m.key });
    setTool("select");
  };

  // ── правки выбранного ─────────────────────────────────────────────────
  const patchShape = (key, patch) => setShapes((p) => p.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  const patchMarker = (key, patch) => setMarkers((p) => p.map((m) => (m.key === key ? { ...m, ...patch } : m)));
  const removeSel = () => {
    if (!sel) return;
    if (sel.type === "shape") setShapes((p) => p.filter((s) => s.key !== sel.key));
    if (sel.type === "marker") {
      setMarkers((p) => p.filter((m) => m.key !== sel.key));
      setRoutes((p) => p.filter((r) => r.from_key !== sel.key && r.to_key !== sel.key));
    }
    if (sel.type === "route") setRoutes((p) => p.filter((r) => routeId(r) !== sel.key));
    setSel(null);
  };

  // ── маршруты (клик-по-точкам) ─────────────────────────────────────────
  const onMarkerClickRoute = (key) => {
    if (!routeDraft) {
      setRouteDraft({ from: key, points: [], cursor: null });
      return;
    }
    if (routeDraft.from === key) {
      setRouteDraft(null);
      return;
    }
    const exists = routes.some((r) => r.floor === floor && ((r.from_key === routeDraft.from && r.to_key === key) || (r.from_key === key && r.to_key === routeDraft.from)));
    if (!exists) {
      const r = { from_key: routeDraft.from, to_key: key, floor, points: routeDraft.points };
      setRoutes((p) => [...p, r]);
      setSel({ type: "route", key: routeId(r) });
    }
    setRouteDraft(null);
  };

  // ── pointer drag (через capture на svg) ───────────────────────────────
  const beginDrag = (e, mode, key) => {
    e.stopPropagation();
    svgRef.current?.setPointerCapture?.(e.pointerId);
    const p = toNorm(e);
    if (mode === "move-shape") {
      const s = shapes.find((x) => x.key === key);
      dragRef.current = { mode, key, ox: s.x, oy: s.y, sx: p.x, sy: p.y };
      setSel({ type: "shape", key });
    } else if (mode === "resize-shape") {
      dragRef.current = { mode, key };
      setSel({ type: "shape", key });
    } else if (mode === "move-marker") {
      dragRef.current = { mode, key };
      setSel({ type: "marker", key });
    }
  };

  const onSvgPointerDown = (e) => {
    const p = toNorm(e);
    if (tool === "room") {
      dragRef.current = { mode: "draw-shape", sx: p.x, sy: p.y };
      setDraftShape({ x: p.x, y: p.y, w: 0, h: 0 });
    } else if (tool === "marker") {
      addMarkerAt(p.x, p.y);
    } else if (tool === "route") {
      if (routeDraft) setRouteDraft({ ...routeDraft, points: [...routeDraft.points, p] });
    } else {
      setSel(null);
    }
  };

  const onSvgPointerMove = (e) => {
    const d = dragRef.current;
    if (tool === "route" && routeDraft) setRouteDraft((rd) => (rd ? { ...rd, cursor: toNorm(e) } : rd));
    if (!d) return;
    const p = toNorm(e);
    if (d.mode === "draw-shape") {
      setDraftShape({ x: Math.min(d.sx, p.x), y: Math.min(d.sy, p.y), w: Math.abs(p.x - d.sx), h: Math.abs(p.y - d.sy) });
    } else if (d.mode === "move-shape") {
      const s = shapes.find((x) => x.key === d.key);
      if (!s) return;
      const nx = clamp01(d.ox + (p.x - d.sx));
      const ny = clamp01(d.oy + (p.y - d.sy));
      patchShape(d.key, { x: Math.min(nx, 1 - s.w), y: Math.min(ny, 1 - s.h) });
    } else if (d.mode === "resize-shape") {
      const s = shapes.find((x) => x.key === d.key);
      if (!s) return;
      patchShape(d.key, { w: Math.max(MIN, clamp01(p.x) - s.x), h: Math.max(MIN, clamp01(p.y) - s.y) });
    } else if (d.mode === "move-marker") {
      patchMarker(d.key, { x: p.x, y: p.y });
    }
  };

  const onSvgPointerUp = (e) => {
    const d = dragRef.current;
    svgRef.current?.releasePointerCapture?.(e.pointerId);
    if (d?.mode === "draw-shape" && draftShape) {
      if (draftShape.w >= MIN && draftShape.h >= MIN) addShapeAt(draftShape.x, draftShape.y, draftShape.w, draftShape.h);
      setDraftShape(null);
    }
    dragRef.current = null;
  };

  // ── клавиатура: стрелки двигают, Delete удаляет ───────────────────────
  const onKeyDown = (e) => {
    if (e.key === "Escape") { if (routeDraft) { e.preventDefault(); setRouteDraft(null); } return; }
    if (!sel) return;
    if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); removeSel(); return; }
    const step = e.shiftKey ? 0.05 : 0.01;
    let dx = 0;
    let dy = 0;
    if (e.key === "ArrowLeft") dx = -step;
    else if (e.key === "ArrowRight") dx = step;
    else if (e.key === "ArrowUp") dy = -step;
    else if (e.key === "ArrowDown") dy = step;
    else return;
    e.preventDefault();
    if (sel.type === "shape") {
      const s = shapes.find((x) => x.key === sel.key);
      if (s) patchShape(sel.key, { x: clamp01(Math.min(s.x + dx, 1 - s.w)), y: clamp01(Math.min(s.y + dy, 1 - s.h)) });
    } else if (sel.type === "marker") {
      const m = markers.find((x) => x.key === sel.key);
      if (m) patchMarker(sel.key, { x: clamp01(m.x + dx), y: clamp01(m.y + dy) });
    }
  };

  // ── этажи ─────────────────────────────────────────────────────────────
  const addFloor = () => {
    const nf = Math.max(...floors) + 1;
    setFloors((p) => [...p, nf]);
    setFloor(nf);
    setSel(null);
    setRouteDraft(null);
  };
  const switchFloor = (f) => { setFloor(f); setSel(null); setRouteDraft(null); };

  // ── сохранение ────────────────────────────────────────────────────────
  const save = async () => {
    setBusy(true);
    setToast(null);
    try {
      await apiPut("/admin/map", {
        shapes: shapes.map((s) => ({ key: s.key, kind: s.kind, label: (s.label || "").trim(), x: s.x, y: s.y, w: s.w, h: s.h, floor: s.floor || 1, color: s.color })),
        markers: markers.map((m) => ({ key: m.key, label: (m.label || "").trim() || "Точка", x: m.x, y: m.y, floor: m.floor || 1, color: m.color })),
        routes: routes.map((r) => ({ from_key: r.from_key, to_key: r.to_key, floor: r.floor || 1, points: r.points || [] })),
      });
      setToast({ kind: "ok", text: "Карта сохранена — участники увидят её на экране «Карта»." });
    } catch (e) {
      setToast({ kind: "err", text: e.message || "Не удалось сохранить карту." });
    } finally {
      setBusy(false);
    }
  };

  const selShape = sel?.type === "shape" ? shapes.find((s) => s.key === sel.key) : null;
  const selMarker = sel?.type === "marker" ? markers.find((m) => m.key === sel.key) : null;
  const selRoute = sel?.type === "route" ? routes.find((r) => routeId(r) === sel.key) : null;

  const routeLine = (r) => {
    const a = markerByKey[r.from_key];
    const b = markerByKey[r.to_key];
    if (!a || !b) return null;
    const pts = [a, ...(r.points || []), b].map((p) => `${p.x * VBW},${p.y * VBH}`).join(" ");
    return pts;
  };
  const draftLine = () => {
    if (!routeDraft) return null;
    const a = markerByKey[routeDraft.from];
    if (!a) return null;
    const chain = [a, ...routeDraft.points];
    if (routeDraft.cursor) chain.push(routeDraft.cursor);
    return chain.map((p) => `${p.x * VBW},${p.y * VBH}`).join(" ");
  };

  return (
    <div className="con-screen">
      {toast ? <div className={`con-toast ${toast.kind}`} role={toast.kind === "err" ? "alert" : "status"}>{toast.text}</div> : null}

      <div className="con-eyebrow">Навигация площадки</div>
      <div className="con-head-row">
        <div>
          <h2 className="con-h2">Конструктор карты</h2>
          <p className="con-sub" style={{ maxWidth: 600 }}>
            Нарисуйте схему площадки: залы и зоны — прямоугольниками, точки (регистрация, фуршет) и
            маршруты между ними. Несколько этажей. Участники увидят интерактивную карту на экране «Карта».
          </p>
        </div>
        <button className="con-btn" onClick={save} disabled={busy}>{busy ? "Сохраняем…" : "Сохранить карту"}</button>
      </div>

      <div className="con-map2-bar">
        <div className="con-map2-tools" role="toolbar" aria-label="Инструменты">
          {[
            { k: "select", t: "Выбор" },
            { k: "room", t: "Зал / зона" },
            { k: "marker", t: "Точка" },
            { k: "route", t: "Маршрут" },
          ].map((b) => (
            <button key={b.k} type="button" className={`con-map2-tool${tool === b.k ? " active" : ""}`} aria-pressed={tool === b.k}
              onClick={() => { setTool(b.k); setRouteDraft(null); }}>{b.t}</button>
          ))}
        </div>
        <div className="con-map2-floors" role="group" aria-label="Этажи">
          <span className="con-map2-floors-lab">Этаж</span>
          {floors.map((f) => (
            <button key={f} type="button" className={`con-map2-floor${floor === f ? " active" : ""}`} aria-pressed={floor === f} onClick={() => switchFloor(f)}>{f}</button>
          ))}
          <button type="button" className="con-map2-floor add" onClick={addFloor} aria-label="Добавить этаж">+</button>
        </div>
      </div>

      {tool === "route" ? (
        <div className="con-map2-hint">{routeDraft ? "Кликните вторую точку, чтобы соединить (по пути кликайте для изгибов). Esc — отмена." : "Кликните первую точку маршрута."}</div>
      ) : tool === "room" ? (
        <div className="con-map2-hint">Зажмите и протяните по холсту, чтобы нарисовать прямоугольник.</div>
      ) : tool === "marker" ? (
        <div className="con-map2-hint">Кликните по холсту, чтобы поставить точку.</div>
      ) : (
        <div className="con-map2-hint">Перетаскивайте элементы; угловой маркер — размер. Стрелки двигают выбранный, Delete — удалить.</div>
      )}

      <p id="con-map2-help" className="con-sr-only">
        Холст конструктора карты. Выберите инструмент на панели сверху. Tab — переход между элементами,
        Enter — выбрать элемент, стрелки — двигать выбранный (Shift — крупный шаг), Delete — удалить, Esc — отменить рисование маршрута.
      </p>
      <div className="con-map2-grid">
        <div
          className="con-map2-canvas-wrap"
          tabIndex={0}
          role="application"
          aria-label={`Холст карты, этаж ${floor}`}
          aria-describedby="con-map2-help"
          onKeyDown={onKeyDown}
        >
          <svg
            ref={svgRef}
            className="con-map2-canvas"
            viewBox={`0 0 ${VBW} ${VBH}`}
            preserveAspectRatio="none"
            onPointerDown={onSvgPointerDown}
            onPointerMove={onSvgPointerMove}
            onPointerUp={onSvgPointerUp}
          >
            <rect x="0" y="0" width={VBW} height={VBH} fill="var(--surface-2)" />
            {/* сетка */}
            {Array.from({ length: 9 }).map((_, i) => (
              <line key={`v${i}`} x1={(i + 1) * (VBW / 10)} y1="0" x2={(i + 1) * (VBW / 10)} y2={VBH} stroke="var(--line)" strokeWidth="1" opacity="0.5" />
            ))}
            {Array.from({ length: 6 }).map((_, i) => (
              <line key={`h${i}`} x1="0" y1={(i + 1) * (VBH / 7)} x2={VBW} y2={(i + 1) * (VBH / 7)} stroke="var(--line)" strokeWidth="1" opacity="0.5" />
            ))}

            {/* фигуры */}
            {fShapes.map((s) => {
              const isSel = sel?.type === "shape" && sel.key === s.key;
              return (
                <g key={s.key}>
                  <rect
                    x={s.x * VBW} y={s.y * VBH} width={s.w * VBW} height={s.h * VBH}
                    rx="6" fill={s.color} stroke={isSel ? "var(--accent)" : "rgba(0,0,0,.25)"} strokeWidth={isSel ? 3 : 1.5}
                    style={{ cursor: tool === "select" ? "move" : "pointer" }}
                    pointerEvents={tool === "route" ? "none" : undefined}
                    tabIndex={0} role="button"
                    aria-label={`${KIND_LABEL[s.kind] || "Фигура"}${s.label ? ": " + s.label : ""}`}
                    aria-current={isSel ? "true" : undefined}
                    onPointerDown={(e) => (tool === "select" ? beginDrag(e, "move-shape", s.key) : (e.stopPropagation(), setSel({ type: "shape", key: s.key })))}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSel({ type: "shape", key: s.key }); } }}
                  />
                  {s.label ? (
                    <text x={(s.x + s.w / 2) * VBW} y={(s.y + s.h / 2) * VBH} textAnchor="middle" dominantBaseline="middle" className="con-map2-shape-tx" pointerEvents="none">{fitLabel(s.label, s.w)}</text>
                  ) : null}
                  {isSel && tool === "select" ? (
                    <>
                      <rect x={(s.x + s.w) * VBW - 15} y={(s.y + s.h) * VBH - 15} width="30" height="30" fill="transparent"
                        onPointerDown={(e) => beginDrag(e, "resize-shape", s.key)} style={{ cursor: "nwse-resize" }} />
                      <rect className="con-map2-handle" x={(s.x + s.w) * VBW - 9} y={(s.y + s.h) * VBH - 9} width="18" height="18" rx="3" pointerEvents="none" />
                    </>
                  ) : null}
                </g>
              );
            })}

            {/* маршруты */}
            {fRoutes.map((r) => {
              const pts = routeLine(r);
              if (!pts) return null;
              const isSel = sel?.type === "route" && sel.key === routeId(r);
              return (
                <g key={routeId(r)} style={{ cursor: "pointer" }} onPointerDown={(e) => { e.stopPropagation(); setSel({ type: "route", key: routeId(r) }); }}>
                  <polyline points={pts} fill="none" stroke="transparent" strokeWidth="14" />
                  <polyline points={pts} fill="none" stroke={isSel ? "var(--accent)" : "#475569"} strokeWidth={isSel ? 4 : 3} strokeDasharray="2 8" strokeLinecap="round" />
                </g>
              );
            })}
            {/* черновик маршрута */}
            {routeDraft && draftLine() ? <polyline points={draftLine()} fill="none" stroke="var(--accent)" strokeWidth="3" strokeDasharray="2 8" strokeLinecap="round" opacity="0.7" /> : null}

            {/* маркеры */}
            {fMarkers.map((m) => {
              const isSel = sel?.type === "marker" && sel.key === m.key;
              const isFrom = routeDraft?.from === m.key;
              return (
                <g key={m.key}
                  tabIndex={0} role="button" aria-label={`Точка: ${m.label}`} aria-current={isSel ? "true" : undefined}
                  style={{ cursor: tool === "route" ? "crosshair" : tool === "select" ? "grab" : "pointer" }}
                  onPointerDown={(e) => {
                    if (tool === "route") { e.stopPropagation(); onMarkerClickRoute(m.key); }
                    else if (tool === "select") beginDrag(e, "move-marker", m.key);
                    else { e.stopPropagation(); setSel({ type: "marker", key: m.key }); }
                  }}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); tool === "route" ? onMarkerClickRoute(m.key) : setSel({ type: "marker", key: m.key }); } }}
                >
                  {/* увеличенная зона нажатия (касания) поверх видимой точки */}
                  <circle cx={m.x * VBW} cy={m.y * VBH} r="22" fill="transparent" />
                  <circle cx={m.x * VBW} cy={m.y * VBH} r={isSel || isFrom ? 13 : 11} fill={m.color} stroke="#fff" strokeWidth="3" pointerEvents="none" />
                  <text x={m.x * VBW} y={m.y * VBH - 18} textAnchor="middle" className="con-map2-pin-tx" pointerEvents="none">{m.label}</text>
                </g>
              );
            })}
          </svg>
        </div>

        {/* панель свойств */}
        <div className="con-card con-map2-panel">
          {selShape ? (
            <>
              <div className="con-card-title">Фигура</div>
              <label className="con-field"><span>Вид</span>
                <select value={selShape.kind} onChange={(e) => { const k = KINDS.find((x) => x.key === e.target.value); patchShape(selShape.key, { kind: e.target.value, color: k?.color || selShape.color }); }}>
                  {KINDS.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
                </select>
              </label>
              <label className="con-field"><span>Подпись</span>
                <input value={selShape.label || ""} onChange={(e) => patchShape(selShape.key, { label: e.target.value })} placeholder="Напр. Зал А" />
              </label>
              <div className="con-field-label">Цвет</div>
              <div className="con-swatches" style={{ marginBottom: 14 }}>
                {SHAPE_COLORS.map((c) => (
                  <button key={c} type="button" className={`con-swatch ${selShape.color === c ? "active" : ""}`} style={{ background: c }} aria-label={`Цвет: ${colorName(c)}`} aria-pressed={selShape.color === c} onClick={() => patchShape(selShape.key, { color: c })} />
                ))}
              </div>
              <button className="con-btn con-btn-ghost con-map2-del" onClick={removeSel}>Удалить фигуру</button>
            </>
          ) : selMarker ? (
            <>
              <div className="con-card-title">Точка</div>
              <label className="con-field"><span>Подпись</span>
                <input value={selMarker.label} onChange={(e) => patchMarker(selMarker.key, { label: e.target.value })} autoFocus />
              </label>
              <div className="con-field-label">Цвет</div>
              <div className="con-swatches" style={{ marginBottom: 14 }}>
                {MARKER_COLORS.map((c) => (
                  <button key={c} type="button" className={`con-swatch ${selMarker.color === c ? "active" : ""}`} style={{ background: c }} aria-label={`Цвет: ${colorName(c)}`} aria-pressed={selMarker.color === c} onClick={() => patchMarker(selMarker.key, { color: c })} />
                ))}
              </div>
              <button className="con-btn con-btn-ghost con-map2-del" onClick={removeSel}>Удалить точку</button>
            </>
          ) : selRoute ? (
            <>
              <div className="con-card-title">Маршрут</div>
              <p className="con-sub" style={{ marginTop: 0 }}>{markerByKey[selRoute.from_key]?.label || "?"} → {markerByKey[selRoute.to_key]?.label || "?"}</p>
              <button className="con-btn con-btn-ghost con-map2-del" onClick={removeSel}>Удалить маршрут</button>
            </>
          ) : (
            <p className="con-sub" style={{ margin: 0 }}>
              Выберите инструмент и рисуйте на холсте. Кликните элемент, чтобы изменить или удалить его.
            </p>
          )}
          <div className="con-map2-legend">
            <div className="con-field-label">Виды фигур</div>
            {KINDS.map((k) => (
              <span key={k.key} className="con-map2-legend-row"><span className="con-map2-legend-dot" style={{ background: k.color }} />{k.label}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function parsePoints(raw) {
  if (Array.isArray(raw)) return raw.map((p) => ({ x: Number(p.x) || 0, y: Number(p.y) || 0 }));
  if (typeof raw === "string") {
    try {
      const a = JSON.parse(raw);
      return Array.isArray(a) ? a.map((p) => ({ x: Number(p.x) || 0, y: Number(p.y) || 0 })) : [];
    } catch {
      return [];
    }
  }
  return [];
}
