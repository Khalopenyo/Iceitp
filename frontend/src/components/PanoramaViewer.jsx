import { useEffect, useRef } from "react";
import "pannellum/build/pannellum.css";
import "pannellum/build/pannellum.js";
import {
  defaultPanoramaSceneId,
  getPanoramaScene,
  getPanoramaViewerConfig,
  panoramaSceneList,
} from "../data/panoramaTour.js";

const getViewer = () => (typeof window !== "undefined" ? window.pannellum : null);
const preloadedPanoramas = new Set();

export default function PanoramaViewer({ sceneId, onSceneChange }) {
  const containerIdRef = useRef(`panorama-${Math.random().toString(36).slice(2, 10)}`);
  const viewerRef = useRef(null);
  const stableSceneId = getPanoramaScene(sceneId).id;

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    panoramaSceneList.forEach((scene) => {
      if (!scene?.panorama || preloadedPanoramas.has(scene.panorama)) {
        return;
      }

      const image = new window.Image();
      image.decoding = "async";
      image.loading = "eager";
      image.crossOrigin = "anonymous";
      image.src = scene.panorama;
      preloadedPanoramas.add(scene.panorama);
    });
  }, []);

  useEffect(() => {
    const pannellum = getViewer();
    if (!pannellum || viewerRef.current) {
      return undefined;
    }

    const viewer = pannellum.viewer(
      containerIdRef.current,
      getPanoramaViewerConfig(stableSceneId || defaultPanoramaSceneId)
    );

    viewer.on("scenechange", (nextSceneId) => {
      onSceneChange?.(nextSceneId);
    });

    viewerRef.current = viewer;

    return () => {
      viewerRef.current?.destroy?.();
      viewerRef.current = null;
    };
  }, [onSceneChange, stableSceneId]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) {
      return;
    }

    if (viewer.getScene?.() === stableSceneId) {
      return;
    }

    const nextScene = getPanoramaScene(stableSceneId);
    viewer.loadScene(nextScene.id, nextScene.pitch, nextScene.yaw, nextScene.hfov);
  }, [stableSceneId]);

  return <div id={containerIdRef.current} className="panorama-viewer" />;
}
