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
const domAfricaHint = "Пройдите по коридору к стеклянной двери слева — там вход в Дом Африки.";
const assemblyHallHint = "Поднимитесь на второй этаж.";

const createPanoramaHotspotTooltip = (hotSpotDiv, args = {}) => {
  hotSpotDiv.textContent = "";
  hotSpotDiv.setAttribute("role", "button");
  hotSpotDiv.setAttribute("aria-label", args.label || "Точка маршрута");

  const marker = document.createElement("span");
  marker.className = "panorama-hotspot-marker";

  const label = document.createElement("span");
  label.className = "panorama-hotspot-label";
  label.textContent = args.label || "";

  const caption = document.createElement("span");
  caption.className = "panorama-hotspot-caption";
  caption.append(label);

  if (args.description) {
    const description = document.createElement("span");
    description.className = "panorama-hotspot-description";
    description.textContent = args.description;
    caption.append(description);
  }

  hotSpotDiv.append(marker, caption);
};

const decorateHotSpot = (hotSpot) => ({
  ...hotSpot,
  cssClass: `panorama-hotspot-trigger panorama-hotspot-trigger-${hotSpot.type || "info"}`,
  createTooltipFunc: createPanoramaHotspotTooltip,
  createTooltipArgs: {
    label: hotSpot.text || "",
    description: hotSpot.hint || "",
  },
});

const getSceneInitialView = (scene) => {
  const positionedHotSpots = (scene.hotSpots || []).filter(
    (spot) => Number.isFinite(spot.pitch) && Number.isFinite(spot.yaw)
  );
  const transitions = positionedHotSpots.filter(
    (spot) => spot.type === "scene" && Number.isFinite(spot.pitch) && Number.isFinite(spot.yaw)
  );
  const viewTargets = transitions.length ? transitions : positionedHotSpots;

  if (!viewTargets.length) {
    return { pitch: scene.pitch, yaw: scene.yaw };
  }

  if (viewTargets.length === 1) {
    return { pitch: viewTargets[0].pitch, yaw: viewTargets[0].yaw };
  }

  const anchor = viewTargets.reduce((best, candidate) => {
    const candidateScore =
      viewTargets.reduce((sum, item) => sum + circularDistance(candidate.yaw, item.yaw), 0) / viewTargets.length;
    const bestScore =
      viewTargets.reduce((sum, item) => sum + circularDistance(best.yaw, item.yaw), 0) / viewTargets.length;
    return candidateScore < bestScore ? candidate : best;
  });

  const cluster = viewTargets.filter((item) => circularDistance(anchor.yaw, item.yaw) <= 60);
  const relevantTransitions = cluster.length ? cluster : viewTargets;

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
        sceneId: "highparkroad",
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
      {
        pitch: -1.2944,
        yaw: -64.2597,
        type: "scene",
        text: "Актовый зал",
        sceneId: "akt",
        targetPitch: "same",
        targetYaw: "same",
        targetHfov: "same",
      },
    ],
  },
  akt: {
    id: "akt",
    title: "Актовый зал",
    shortTitle: "Актовый зал",
    description: "Панорама актового зала.",
    panorama: "/panoramas/akt.jpeg",
    pitch: 0,
    yaw: 0,
    hfov: initialHfov,
    hotSpots: [
      {
        pitch: 3.4595,
        yaw: -159.2162,
        type: "info",
        text: "Актовый зал",
        hint: assemblyHallHint,
      },
    ],
  },
  highparkroad: {
    id: "highparkroad",
    title: "Переход к Хайпарку",
    shortTitle: "К Хайпарку",
    description: "Промежуточная точка маршрута из холла в Хайпарк.",
    panorama: "/panoramas/highparkroad.jpeg",
    pitch: 0,
    yaw: 0,
    hfov: initialHfov,
    hotSpots: [
      {
        pitch: -0.0612,
        yaw: -168.5889,
        type: "scene",
        text: "Хайпарк",
        sceneId: "highpark",
        targetPitch: "same",
        targetYaw: "same",
        targetHfov: "same",
      },
      {
        pitch: 0.984,
        yaw: 62.5551,
        type: "scene",
        text: "Холл",
        sceneId: "hall",
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
    panorama: "/panoramas/houseafrica.jpeg",
    pitch: 0,
    yaw: 0,
    hfov: initialHfov,
    hotSpots: [
      {
        pitch: 1.8762,
        yaw: -173.1565,
        type: "scene",
        text: "Дом Африки",
        sceneId: "africa1",
        targetPitch: "same",
        targetYaw: "same",
        targetHfov: "same",
      },
    ],
  },
  africa1: {
    id: "africa1",
    title: "Дом Африки 2",
    shortTitle: "Дом Африки 2",
    description: "Следующая панорама после Дома Африки.",
    panorama: "/panoramas/africa1.jpeg",
    pitch: 0,
    yaw: 0,
    hfov: initialHfov,
    hotSpots: [
      {
        pitch: 0.2081,
        yaw: 157.5248,
        type: "scene",
        text: "Дом Африки",
        hint: domAfricaHint,
        sceneId: "domafricafinal",
        targetPitch: "same",
        targetYaw: "same",
        targetHfov: "same",
      },
    ],
  },
  domafricafinal: {
    id: "domafricafinal",
    title: "Дом Африки",
    shortTitle: "Дом Африки",
    description: "Финальная панорама Дома Африки.",
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
export const panoramaViewerSceneList = Object.values(panoramaScenes);

export const defaultPanoramaSceneId = sceneOrder[0];

export const roomSceneMap = {
  "холл": "hall",
  "актовый зал": "akt",
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
    panoramaViewerSceneList.map((scene) => [
      scene.id,
      {
        title: scene.title,
        type: "equirectangular",
        panorama: scene.panorama,
        pitch: scene.pitch,
        yaw: scene.yaw,
        hfov: scene.hfov,
        maxHfov: initialHfov,
        hotSpots: scene.hotSpots,
      },
    ])
  ),
});
