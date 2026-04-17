const sceneOrder = ["hall", "highpark", "kvazar", "domafrica", "narnia", "pulsar"];
const initialHfov = 120;

const circularDistance = (leftYaw, rightYaw) => {
  const diff = Math.abs(leftYaw - rightYaw) % 360;
  return diff > 180 ? 360 - diff : diff;
};

const meanAngle = (angles) => {
  const x = angles.reduce((sum, angle) => sum + Math.cos((angle * Math.PI) / 180), 0);
  const y = angles.reduce((sum, angle) => sum + Math.sin((angle * Math.PI) / 180), 0);
  return (Math.atan2(y, x) * 180) / Math.PI;
};

const createPanoramaHotspotTooltip = (hotSpotDiv, args = {}) => {
  hotSpotDiv.textContent = "";
  hotSpotDiv.setAttribute("role", "button");
  hotSpotDiv.setAttribute("aria-label", args.label || "Точка маршрута");

  const marker = document.createElement("span");
  marker.className = "panorama-hotspot-marker";

  const label = document.createElement("span");
  label.className = "panorama-hotspot-label";
  label.textContent = args.label || "";

  hotSpotDiv.append(marker, label);
};

const decorateHotSpot = (hotSpot) => ({
  ...hotSpot,
  cssClass: `panorama-hotspot-trigger panorama-hotspot-trigger-${hotSpot.type || "info"}`,
  createTooltipFunc: createPanoramaHotspotTooltip,
  createTooltipArgs: {
    label: hotSpot.text || "",
  },
});

const getSceneInitialView = (scene) => {
  const transitions = (scene.hotSpots || []).filter(
    (spot) => spot.type === "scene" && Number.isFinite(spot.pitch) && Number.isFinite(spot.yaw)
  );

  if (!transitions.length) {
    return { pitch: scene.pitch, yaw: scene.yaw };
  }

  if (transitions.length === 1) {
    return { pitch: transitions[0].pitch, yaw: transitions[0].yaw };
  }

  const anchor = transitions.reduce((best, candidate) => {
    const candidateScore =
      transitions.reduce((sum, item) => sum + circularDistance(candidate.yaw, item.yaw), 0) / transitions.length;
    const bestScore =
      transitions.reduce((sum, item) => sum + circularDistance(best.yaw, item.yaw), 0) / transitions.length;
    return candidateScore < bestScore ? candidate : best;
  });

  const cluster = transitions.filter((item) => circularDistance(anchor.yaw, item.yaw) <= 60);
  const relevantTransitions = cluster.length ? cluster : transitions;

  return {
    pitch: relevantTransitions.reduce((sum, item) => sum + item.pitch, 0) / relevantTransitions.length,
    yaw: meanAngle(relevantTransitions.map((item) => item.yaw)),
  };
};

export const panoramaScenes = {
  hall: {
    id: "hall",
    title: "Холл",
    shortTitle: "Холл",
    description:
      "Тестовая 360-панорама холла. Подходит как стартовая точка для проверки нового indoor-маршрута прямо в проекте.",
    panorama: "/panoramas/hallggntu.jpeg",
    pitch: 0,
    yaw: 0,
    hfov: initialHfov,
    hotSpots: [
      {
        pitch: -1.1904223265424279,
        yaw: 115.15171623569356,
        type: "scene",
        text: "Хайпарк",
        sceneId: "highpark",
        targetPitch: "same",
        targetYaw: "same",
        targetHfov: "same",
      },
      {
        pitch: 0.2852803561646235,
        yaw: 157.08151574316653,
        type: "scene",
        text: "Дом Африки",
        sceneId: "domafrica",
        targetPitch: "same",
        targetYaw: "same",
        targetHfov: "same",
      },
    ],
  },
  highpark: {
    id: "highpark",
    title: "Хайпарк",
    shortTitle: "Хайпарк",
    description:
      "Панорама Хайпарка. Сейчас она подключена как следующая точка маршрута от холла; позже можно заменить источник на локальный файл.",
    panorama:
      "https://raw.githubusercontent.com/ramz777/konficeitp/refs/heads/main/%D1%85%D0%B0%D0%B8%CC%86%D0%BF%D0%B0%D1%80%D0%BA111.jpg",
    pitch: 0,
    yaw: -140,
    hfov: initialHfov,
    hotSpots: [],
  },
  kvazar: {
    id: "kvazar",
    title: "Квазар",
    shortTitle: "Квазар",
    description:
      "Панорама Квазара. Сейчас она подключена как следующая точка маршрута от Хайпарка; позже можно заменить источник на локальный файл.",
    panorama: "/panoramas/kvazar.jpeg",
    pitch: 0,
    yaw: 0,
    hfov: initialHfov,
    hotSpots: [],
  },
  domafrica: {
    id: "domafrica",
    title: "Дом Африки",
    shortTitle: "Дом Африки",
    description: "Панорама Дома Африки.",
    panorama: "/panoramas/domafriki.jpeg",
    pitch: 0,
    yaw: 0,
    hfov: initialHfov,
    hotSpots: [],
  },
  narnia: {
    id: "narnia",
    title: "Нарния",
    shortTitle: "Нарния",
    description:
      "Панорама Нарнии. Сейчас она подключена как следующая точка маршрута от Квазара и использует локальный файл.",
    panorama: "/panoramas/narnia.jpeg",
    pitch: 0,
    yaw: 0,
    hfov: initialHfov,
    hotSpots: [],
  },
  pulsar: {
    id: "pulsar",
    title: "Пульсар",
    shortTitle: "Пульсар",
    description:
      "Панорама Пульсара. Сейчас она подключена как следующая точка маршрута от Хайпарка и использует локальный файл.",
    panorama: "/panoramas/pulsar.jpeg",
    pitch: 0,
    yaw: 0,
    hfov: initialHfov,
    hotSpots: [],
  },
};

panoramaScenes.highpark.hotSpots.push({
  pitch: -2.2258470234707133,
  yaw: 88.59724066893915,
  type: "scene",
  text: "Квазар",
  sceneId: "kvazar",
  targetPitch: "same",
  targetYaw: "same",
  targetHfov: "same",
});

panoramaScenes.highpark.hotSpots.push({
  pitch: 0.01644064853766478,
  yaw: -133.93854081924542,
  type: "scene",
  text: "Нарния",
  sceneId: "narnia",
  targetPitch: "same",
  targetYaw: "same",
  targetHfov: "same",
});

panoramaScenes.highpark.hotSpots.push({
  pitch: 0.019607485791036845,
  yaw: -128.52091885799794,
  type: "scene",
  text: "Пульсар",
  sceneId: "pulsar",
  targetPitch: "same",
  targetYaw: "same",
  targetHfov: "same",
});

Object.values(panoramaScenes).forEach((scene) => {
  scene.hotSpots = (scene.hotSpots || []).map(decorateHotSpot);
  const initialView = getSceneInitialView(scene);
  scene.pitch = initialView.pitch;
  scene.yaw = initialView.yaw;
});

export const panoramaSceneList = sceneOrder.map((sceneId) => panoramaScenes[sceneId]);
const debugSceneIds = new Set();

export const defaultPanoramaSceneId = sceneOrder[0];

export const roomSceneMap = {
  "холл": "hall",
  "хайпарк": "highpark",
  "квазар": "kvazar",
  "дом африки": "domafrica",
  "нарния": "narnia",
  "пульсар": "pulsar",
};

export const getPanoramaScene = (sceneId) => panoramaScenes[sceneId] || panoramaScenes[defaultPanoramaSceneId];

export const getPanoramaViewerConfig = (initialSceneId = defaultPanoramaSceneId) => ({
  default: {
    firstScene: getPanoramaScene(initialSceneId).id,
    autoLoad: true,
    sceneFadeDuration: 350,
    showControls: true,
    hfov: initialHfov,
    maxHfov: initialHfov,
  },
  scenes: Object.fromEntries(
    panoramaSceneList.map((scene) => [
      scene.id,
      {
        title: scene.title,
        type: "equirectangular",
        panorama: scene.panorama,
        pitch: scene.pitch,
        yaw: scene.yaw,
        hfov: scene.hfov,
        maxHfov: initialHfov,
        hotSpotDebug: debugSceneIds.has(scene.id),
        hotSpots: scene.hotSpots,
      },
    ])
  ),
});
