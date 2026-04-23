import { useEffect, useRef, useState } from "react";
import "pannellum/build/pannellum.css";
import "pannellum/build/pannellum.js";
import {
  defaultPanoramaSceneId,
  getPanoramaScene,
  getPanoramaViewerConfig,
  panoramaViewerSceneList,
} from "../data/panoramaTour.js";

const getViewer = () => (typeof window !== "undefined" ? window.pannellum : null);
const preloadedPanoramas = new Set();
const isPanoramaDebugEnabled = () =>
  import.meta.env.DEV ||
  (typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("debugPanorama") === "1");
const emptyHotspotHints = { left: "", back: "", right: "" };

const getSignedYawDelta = (fromYaw, toYaw) => {
  const normalized = ((((toYaw - fromYaw) % 360) + 540) % 360) - 180;
  return normalized === -180 ? 180 : normalized;
};

const formatHintLabel = (hotSpots) => {
  const labels = [...new Set(hotSpots.map((spot) => spot.text).filter(Boolean))];
  if (!labels.length) {
    return "";
  }
  if (labels.length === 1) {
    return labels[0];
  }
  return `${labels[0]} и еще ${labels.length - 1}`;
};

function logPanoramaClickCoords(viewer, event) {
  if (!viewer?.mouseEventToCoords || typeof window === "undefined") {
    return;
  }

  const coords = viewer.mouseEventToCoords(event);
  if (!Array.isArray(coords) || coords.length < 2) {
    return;
  }

  const [pitch, yaw] = coords;
  const payload = {
    sceneId: viewer.getScene?.(),
    pitch: Number(pitch.toFixed(4)),
    yaw: Number(yaw.toFixed(4)),
  };

  window.__panoramaLastClick = payload;
  console.log("[panorama-coords]", payload);
}

export default function PanoramaViewer({ sceneId, onSceneChange }) {
  const containerIdRef = useRef(`panorama-${Math.random().toString(36).slice(2, 10)}`);
  const viewerRef = useRef(null);
  const [hotspotHints, setHotspotHints] = useState(emptyHotspotHints);
  const stableSceneId = getPanoramaScene(sceneId).id;

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    panoramaViewerSceneList.forEach((scene) => {
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

  useEffect(() => {
    if (!isPanoramaDebugEnabled()) {
      return undefined;
    }

    const viewer = viewerRef.current;
    const container = document.getElementById(containerIdRef.current);
    const debugTarget = container?.querySelector(".pnlm-dragfix") ?? container;
    if (!viewer || !debugTarget) {
      return undefined;
    }

    const handleClick = (event) => {
      logPanoramaClickCoords(viewer, event);
    };

    debugTarget.addEventListener("click", handleClick, true);
    console.info(
      "[panorama-debug] click panorama to log coordinates; last click is also stored in window.__panoramaLastClick"
    );

    return () => {
      debugTarget.removeEventListener("click", handleClick, true);
    };
  }, [stableSceneId]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) {
      return undefined;
    }

    const updateHotspotHints = () => {
      const currentScene = getPanoramaScene(viewer.getScene?.());
      const hotSpots = (currentScene.hotSpots || []).filter(
        (spot) => Number.isFinite(spot.yaw) && Number.isFinite(spot.pitch)
      );

      if (!hotSpots.length) {
        setHotspotHints((current) =>
          current.left || current.back || current.right ? emptyHotspotHints : current
        );
        return;
      }

      const yaw = viewer.getYaw?.() ?? currentScene.yaw ?? 0;
      const hfov = viewer.getHfov?.() ?? currentScene.hfov ?? 120;
      const visibleThreshold = Math.max(12, hfov * 0.42);

      const leftHotSpots = [];
      const backHotSpots = [];
      const rightHotSpots = [];
      const backThreshold = 135;
      hotSpots.forEach((spot) => {
        const delta = getSignedYawDelta(yaw, spot.yaw);
        if (Math.abs(delta) <= visibleThreshold) {
          return;
        }
        if (Math.abs(delta) >= backThreshold) {
          backHotSpots.push({ ...spot, delta: Math.abs(delta) });
        } else if (delta < 0) {
          leftHotSpots.push({ ...spot, delta: Math.abs(delta) });
        } else if (delta > 0) {
          rightHotSpots.push({ ...spot, delta: Math.abs(delta) });
        }
      });

      leftHotSpots.sort((left, right) => left.delta - right.delta);
      backHotSpots.sort((left, right) => left.delta - right.delta);
      rightHotSpots.sort((left, right) => left.delta - right.delta);

      const nextHints = {
        left: formatHintLabel(leftHotSpots),
        back: formatHintLabel(backHotSpots),
        right: formatHintLabel(rightHotSpots),
      };

      setHotspotHints((current) =>
        current.left === nextHints.left &&
        current.back === nextHints.back &&
        current.right === nextHints.right
          ? current
          : nextHints
      );
    };

    updateHotspotHints();
    const intervalId = window.setInterval(updateHotspotHints, 180);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [stableSceneId]);

  return (
    <>
      <div id={containerIdRef.current} className="panorama-viewer" />
      {(hotspotHints.left || hotspotHints.back || hotspotHints.right) && (
        <div className="panorama-direction-hints" aria-live="polite">
          {hotspotHints.left && (
            <div className="panorama-direction-hint panorama-direction-hint-left">
              <span className="panorama-direction-arrow">←</span>
              <span>Слева: {hotspotHints.left}</span>
            </div>
          )}
          {hotspotHints.back && (
            <div className="panorama-direction-hint panorama-direction-hint-back">
              <span className="panorama-direction-arrow">↺</span>
              <span>Сзади: {hotspotHints.back}</span>
            </div>
          )}
          {hotspotHints.right && (
            <div className="panorama-direction-hint panorama-direction-hint-right">
              <span>Справа: {hotspotHints.right}</span>
              <span className="panorama-direction-arrow">→</span>
            </div>
          )}
        </div>
      )}
    </>
  );
}
