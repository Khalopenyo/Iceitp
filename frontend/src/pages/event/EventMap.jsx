import { useMemo, useState } from "react";
import PanoramaViewer from "../../components/PanoramaViewer.jsx";
import { defaultPanoramaSceneId, getPanoramaScene, panoramaSceneList } from "../../data/panoramaTour.js";
import "./event.css";

const preferredSceneOrder = ["hall", "highpark", "kvazar", "domafrica", "narnia", "pulsar"];

// EventMap — «Карта 360°» участника в зоне EventShell: список локаций + панорама.
// Логика/панорамы из старого Map (panoramaTour.js — пер-тенант данные, отдельная фича).
export default function EventMap() {
  const [activeSceneId, setActiveSceneId] = useState(defaultPanoramaSceneId);

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
    <div className="ev-page" data-screen-label="Карта 360">
      <div className="ev-page-eyebrow">Навигация · Карта 360°</div>
      <h1 className="ev-page-h tight">Где что проходит</h1>

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
