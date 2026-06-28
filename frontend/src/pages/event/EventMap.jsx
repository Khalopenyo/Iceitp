import { useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import PanoramaViewer from "../../components/PanoramaViewer.jsx";
import { apiGet } from "../../lib/api.js";
import { defaultPanoramaSceneId, getPanoramaScene, panoramaSceneList } from "../../data/panoramaTour.js";
import "./event.css";

const preferredSceneOrder = ["hall", "highpark", "kvazar", "domafrica", "narnia", "pulsar"];

// Цвет точки приходит из набора маркеров; принимаем только строгий hex, иначе —
// акцент темы (устойчивость к легаси-значениям вроде "primary").
const pinColor = (c) => (typeof c === "string" && /^#[0-9a-fA-F]{6}$/.test(c) ? c : "var(--ev-accent)");

// EventMap — навигация участника: интерактивный 2D-план площадки (если задан организатором)
// + «Карта 360°» (панорамы). План и маркеры приходят из конструктора консоли.
export default function EventMap() {
  const { conference } = useOutletContext();
  const [activeSceneId, setActiveSceneId] = useState(defaultPanoramaSceneId);
  const [markers, setMarkers] = useState([]);
  const [activePin, setActivePin] = useState(null);

  const floorPlanUrl = conference?.floor_plan_url || "";

  useEffect(() => {
    if (!floorPlanUrl) return;
    apiGet("/map/markers")
      .then((r) => setMarkers(Array.isArray(r) ? r : []))
      .catch(() => setMarkers([]));
  }, [floorPlanUrl]);

  const visibleScenes = useMemo(() => {
    const rank = new Map(preferredSceneOrder.map((id, i) => [id, i]));
    return [...panoramaSceneList].sort((a, b) => {
      const ra = rank.get(a.id) ?? Number.MAX_SAFE_INTEGER;
      const rb = rank.get(b.id) ?? Number.MAX_SAFE_INTEGER;
      return ra - rb;
    });
  }, []);

  const activeScene = getPanoramaScene(activeSceneId);

  return (
    <div className="ev-page" data-screen-label="Карта">
      <div className="ev-page-eyebrow">Навигация · Карта площадки</div>
      <h1 className="ev-page-h tight">Где что проходит</h1>

      {floorPlanUrl ? (
        <div className="ev-floor-layout">
          <div className="ev-floor" onClick={() => setActivePin(null)}>
            <img src={floorPlanUrl} alt="План площадки" draggable={false} />
            {markers.map((m) => (
              <button
                key={m.key}
                type="button"
                className={`ev-floor-pin${activePin === m.key ? " active" : ""}`}
                style={{ left: `${(m.x || 0) * 100}%`, top: `${(m.y || 0) * 100}%`, background: pinColor(m.color) }}
                title={m.label}
                aria-label={m.label}
                aria-pressed={activePin === m.key}
                onClick={(e) => { e.stopPropagation(); setActivePin(m.key); }}
              >
                <span className="ev-floor-pin-label">{m.label}</span>
              </button>
            ))}
          </div>
          {markers.length ? (
            <aside className="ev-floor-legend" aria-label="Точки на плане">
              {markers.map((m) => (
                <button
                  key={m.key}
                  type="button"
                  className={`ev-floor-leg${activePin === m.key ? " active" : ""}`}
                  aria-pressed={activePin === m.key}
                  onClick={() => setActivePin(m.key)}
                >
                  <span className="ev-floor-leg-dot" style={{ background: pinColor(m.color) }} aria-hidden="true" />
                  {m.label}
                </button>
              ))}
            </aside>
          ) : null}
        </div>
      ) : null}

      <div className="ev-page-eyebrow" style={{ marginTop: floorPlanUrl ? 28 : 0 }}>Карта 360°</div>
      <div className="ev-map-layout">
        <aside className="ev-map-list" aria-label="Список локаций">
          {visibleScenes.map((scene) => (
            <button
              key={scene.id}
              type="button"
              className={`ev-map-loc ${activeScene.id === scene.id ? "active" : ""}`}
              aria-pressed={activeScene.id === scene.id}
              onClick={() => setActiveSceneId(scene.id)}
            >
              {scene.title}
            </button>
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
