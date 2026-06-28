import { useEffect, useMemo, useState } from "react";
import PanoramaViewer from "../../components/PanoramaViewer.jsx";
import { apiGet } from "../../lib/api.js";
import { defaultPanoramaSceneId, getPanoramaScene, panoramaSceneList } from "../../data/panoramaTour.js";
import "./event.css";

const VBW = 1000;
const VBH = 700;
// Интерактивная векторная схема пока не в проде — участникам показываем только
// «Карта 360°». Код конструктора/рендера сохранён; вернуть = true, когда выкатим.
const INTERACTIVE_MAP_ENABLED = false;
const preferredSceneOrder = ["hall", "highpark", "kvazar", "domafrica", "narnia", "pulsar"];

const hex = (c) => (typeof c === "string" && /^#[0-9a-fA-F]{6}$/.test(c) ? c : "var(--ev-accent)");
// Обрезаем подпись по ширине фигуры, чтобы текст не вылезал за её границы.
const fitLabel = (s, widthNorm) => {
  const max = Math.max(3, Math.floor((widthNorm * VBW) / 10));
  return s && s.length > max ? s.slice(0, max - 1) + "…" : s;
};
function parsePoints(raw) {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string") { try { return JSON.parse(raw) || []; } catch { return []; } }
  return [];
}

// EventMap — навигация участника: интерактивная схема площадки (конструктор организатора:
// залы/зоны + точки + маршруты, по этажам) + «Карта 360°» (панорамы).
export default function EventMap() {
  const [shapes, setShapes] = useState([]);
  const [markers, setMarkers] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [floor, setFloor] = useState(1);
  const [activePin, setActivePin] = useState(null);
  const [focusedPin, setFocusedPin] = useState(null);
  const [activeSceneId, setActiveSceneId] = useState(defaultPanoramaSceneId);

  useEffect(() => {
    if (!INTERACTIVE_MAP_ENABLED) return;
    apiGet("/map")
      .then((r) => {
        const sh = Array.isArray(r?.shapes) ? r.shapes : [];
        const mk = Array.isArray(r?.markers) ? r.markers : [];
        const rt = Array.isArray(r?.routes) ? r.routes.map((x) => ({ ...x, points: parsePoints(x.points) })) : [];
        setShapes(sh); setMarkers(mk); setRoutes(rt);
        const fs = [...new Set([...sh.map((s) => s.floor || 1), ...mk.map((m) => m.floor || 1)])].sort((a, b) => a - b);
        if (fs.length) setFloor(fs[0]);
      })
      .catch(() => {});
  }, []);

  const floors = useMemo(() => {
    const fs = new Set([...shapes.map((s) => s.floor || 1), ...markers.map((m) => m.floor || 1)]);
    return fs.size ? [...fs].sort((a, b) => a - b) : [];
  }, [shapes, markers]);

  const markerByKey = useMemo(() => Object.fromEntries(markers.map((m) => [m.key, m])), [markers]);
  const fShapes = shapes.filter((s) => (s.floor || 1) === floor);
  const fMarkers = markers.filter((m) => (m.floor || 1) === floor);
  const fRoutes = routes.filter((r) => (r.floor || 1) === floor);
  const hasMap = INTERACTIVE_MAP_ENABLED && (shapes.length > 0 || markers.length > 0);

  const visibleScenes = useMemo(() => {
    const rank = new Map(preferredSceneOrder.map((id, i) => [id, i]));
    return [...panoramaSceneList].sort((a, b) => (rank.get(a.id) ?? 1e9) - (rank.get(b.id) ?? 1e9));
  }, []);
  const activeScene = getPanoramaScene(activeSceneId);

  const routeLine = (r) => {
    const a = markerByKey[r.from_key];
    const b = markerByKey[r.to_key];
    if (!a || !b) return null;
    return [a, ...(r.points || []), b].map((p) => `${(p.x || 0) * VBW},${(p.y || 0) * VBH}`).join(" ");
  };

  return (
    <div className="ev-page" data-screen-label="Карта">
      <div className="ev-page-eyebrow">Навигация · Карта площадки</div>
      <h1 className="ev-page-h tight">Где что проходит</h1>

      {hasMap ? (
        <div className="ev-floor-layout">
          <div>
            {floors.length > 1 ? (
              <div className="ev-floor-tabs" role="group" aria-label="Этажи">
                {floors.map((f) => (
                  <button key={f} type="button" className={`ev-floor-tab${floor === f ? " active" : ""}`} aria-pressed={floor === f} onClick={() => { setFloor(f); setActivePin(null); }}>Этаж {f}</button>
                ))}
              </div>
            ) : null}
            <div className="ev-floor" onClick={() => setActivePin(null)}>
              <svg className="ev-floor-svg" viewBox={`0 0 ${VBW} ${VBH}`} preserveAspectRatio="none" role="img" aria-label={`Схема площадки, этаж ${floor}`}>
                <rect x="0" y="0" width={VBW} height={VBH} fill="var(--ev-surface-2, var(--ev-surface))" />
                {fShapes.map((s) => (
                  <g key={s.key}>
                    <rect x={s.x * VBW} y={s.y * VBH} width={(s.w || 0) * VBW} height={(s.h || 0) * VBH} rx="6" fill={s.color || "#e5e7eb"} stroke="rgba(0,0,0,.22)" strokeWidth="1.5" />
                    {s.label ? <text x={(s.x + (s.w || 0) / 2) * VBW} y={(s.y + (s.h || 0) / 2) * VBH} textAnchor="middle" dominantBaseline="middle" className="ev-floor-shape-tx">{fitLabel(s.label, s.w || 0)}</text> : null}
                  </g>
                ))}
                {fRoutes.map((r, i) => {
                  const pts = routeLine(r);
                  return pts ? <polyline key={i} points={pts} fill="none" stroke="#475569" strokeWidth="3" strokeDasharray="2 9" strokeLinecap="round" /> : null;
                })}
                {fMarkers.map((m) => {
                  const on = activePin === m.key || focusedPin === m.key;
                  return (
                    <g key={m.key} style={{ cursor: "pointer" }} tabIndex={0} role="button" aria-label={m.label} aria-current={activePin === m.key ? "true" : undefined}
                      onClick={(e) => { e.stopPropagation(); setActivePin(m.key); }}
                      onFocus={() => setFocusedPin(m.key)}
                      onBlur={() => setFocusedPin((p) => (p === m.key ? null : p))}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setActivePin(m.key); } }}>
                      <circle cx={m.x * VBW} cy={m.y * VBH} r="22" fill="transparent" />
                      <circle cx={m.x * VBW} cy={m.y * VBH} r={on ? 14 : 11} fill={hex(m.color)} stroke="#fff" strokeWidth="3" pointerEvents="none" />
                      {on ? <text x={m.x * VBW} y={m.y * VBH - 19} textAnchor="middle" className="ev-floor-pin-tx">{m.label}</text> : null}
                    </g>
                  );
                })}
              </svg>
            </div>
          </div>

          {fMarkers.length ? (
            <aside className="ev-floor-legend" aria-label="Точки на этаже">
              {fMarkers.map((m) => (
                <button key={m.key} type="button" className={`ev-floor-leg${activePin === m.key ? " active" : ""}`} aria-pressed={activePin === m.key} onClick={() => setActivePin(m.key)}>
                  <span className="ev-floor-leg-dot" style={{ background: hex(m.color) }} aria-hidden="true" />{m.label}
                </button>
              ))}
            </aside>
          ) : null}
        </div>
      ) : null}

      <div className="ev-page-eyebrow" style={{ marginTop: hasMap ? 28 : 0 }}>Карта 360°</div>
      <div className="ev-map-layout">
        <aside className="ev-map-list" aria-label="Список локаций">
          {visibleScenes.map((scene) => (
            <button key={scene.id} type="button" className={`ev-map-loc ${activeScene.id === scene.id ? "active" : ""}`} aria-pressed={activeScene.id === scene.id} onClick={() => setActiveSceneId(scene.id)}>{scene.title}</button>
          ))}
        </aside>
        <div className="ev-map-viewer">
          <div className="ev-map-toolbar">{activeScene.title}</div>
          <div className="ev-map-shell">
            <PanoramaViewer sceneId={activeScene.id} onSceneChange={setActiveSceneId} />
          </div>
        </div>
      </div>
    </div>
  );
}
