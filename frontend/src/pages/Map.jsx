import { useMemo, useState } from "react";
import PanoramaViewer from "../components/PanoramaViewer.jsx";
import { defaultPanoramaSceneId, getPanoramaScene, panoramaSceneList } from "../data/panoramaTour.js";

const preferredSceneOrder = ["hall", "highpark", "kvazar", "domafrica", "narnia", "pulsar"];

export default function CampusMap() {
  const [activeSceneId, setActiveSceneId] = useState(defaultPanoramaSceneId);

  const visibleScenes = useMemo(() => {
    const rank = new Map(preferredSceneOrder.map((sceneId, index) => [sceneId, index]));
    return [...panoramaSceneList].sort((left, right) => {
      const leftRank = rank.get(left.id) ?? Number.MAX_SAFE_INTEGER;
      const rightRank = rank.get(right.id) ?? Number.MAX_SAFE_INTEGER;
      return leftRank - rightRank;
    });
  }, []);

  const activeScene = getPanoramaScene(activeSceneId);

  return (
    <section className="panel map-page map-page-simple">
      <h2>Карта 360</h2>

      <div className="map-simple-layout">
        <aside className="map-location-sidebar" aria-label="Список локаций">
          <div className="map-location-list">
            {visibleScenes.map((scene) => (
              <button
                key={scene.id}
                className={`map-location-btn ${activeScene.id === scene.id ? "active" : ""}`}
                onClick={() => setActiveSceneId(scene.id)}
              >
                {scene.title}
              </button>
            ))}
          </div>
        </aside>

        <div className="map-location-viewer">
          <div className="map-location-toolbar">
            <strong>{activeScene.title}</strong>
          </div>
          <div className="panorama-shell">
            <PanoramaViewer sceneId={activeScene.id} onSceneChange={setActiveSceneId} />
          </div>
        </div>
      </div>
    </section>
  );
}
