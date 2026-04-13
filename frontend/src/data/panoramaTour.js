const sceneOrder = ["highpark", "pulsar", "lab", "kvazar"];

export const panoramaScenes = {
  highpark: {
    id: "highpark",
    title: "Хайпарк",
    shortTitle: "Хайпарк",
    description:
      "Стартовая точка 360-маршрута. Отсюда можно перейти к соседним площадкам и быстро сориентироваться перед офлайн-сессией.",
    panorama:
      "https://raw.githubusercontent.com/ramz777/konficeitp/refs/heads/main/%D1%85%D0%B0%D0%B8%CC%86%D0%BF%D0%B0%D1%80%D0%BA111.jpg",
    pitch: 0,
    yaw: -140,
    hfov: 80,
    hotSpots: [
      {
        pitch: -1,
        yaw: -129,
        text: "Пульсар",
        sceneId: "pulsar",
      },
      {
        pitch: -2,
        yaw: -138,
        text: "Центр прототипирования",
        sceneId: "lab",
      },
      {
        pitch: -5,
        yaw: 85,
        text: "Квазар",
        sceneId: "kvazar",
      },
    ],
  },
  pulsar: {
    id: "pulsar",
    title: "Пульсар",
    shortTitle: "Пульсар",
    description:
      "Панорама площадки Пульсар. Используйте ее, чтобы заранее понять, как выглядит помещение и как вернуться к основной точке маршрута.",
    panorama:
      "https://raw.githubusercontent.com/ramz777/konficeitp/refs/heads/main/%D0%BF%D1%83%D0%BB%D1%8C%D1%81%D0%B0%D1%80111.jpg",
    pitch: 0,
    yaw: 0,
    hfov: 80,
    hotSpots: [
      {
        pitch: -2,
        yaw: 12,
        text: "Вернуться в Хайпарк",
        sceneId: "highpark",
      },
    ],
  },
  lab: {
    id: "lab",
    title: "Центр прототипирования",
    shortTitle: "Прототипирование",
    description:
      "Вид на лабораторную площадку. Подходит для предварительного просмотра локации и проверки, куда идти после входной зоны.",
    panorama:
      "https://raw.githubusercontent.com/ramz777/konficeitp/refs/heads/main/%D0%BB%D0%B0%D0%B1%D0%BE%D1%80%D0%B0%D1%82%D0%BE%D1%80%D0%B8111.jpg",
    pitch: 0,
    yaw: 0,
    hfov: 80,
    hotSpots: [
      {
        pitch: -2,
        yaw: 10,
        text: "Вернуться в Хайпарк",
        sceneId: "highpark",
      },
    ],
  },
  kvazar: {
    id: "kvazar",
    title: "Квазар",
    shortTitle: "Квазар",
    description:
      "Панорама площадки Квазар. Используйте ее как финальную точку обхода или для быстрого возврата к стартовой обзорной зоне.",
    panorama:
      "https://raw.githubusercontent.com/ramz777/konficeitp/refs/heads/main/%D0%BA%D0%B2%D0%B0%D0%B7%D0%B0%D1%80111.jpg",
    pitch: 0,
    yaw: 0,
    hfov: 80,
    hotSpots: [
      {
        pitch: -2,
        yaw: 8,
        text: "Вернуться в Хайпарк",
        sceneId: "highpark",
      },
    ],
  },
};

export const panoramaSceneList = sceneOrder.map((sceneId) => panoramaScenes[sceneId]);

export const defaultPanoramaSceneId = sceneOrder[0];

export const roomSceneMap = {
  "хайпарк": "highpark",
};

export const getPanoramaScene = (sceneId) => panoramaScenes[sceneId] || panoramaScenes[defaultPanoramaSceneId];

export const getPanoramaViewerConfig = (initialSceneId = defaultPanoramaSceneId) => ({
  default: {
    firstScene: getPanoramaScene(initialSceneId).id,
    autoLoad: true,
    sceneFadeDuration: 350,
    showControls: true,
    hfov: 80,
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
        hotSpots: scene.hotSpots,
      },
    ])
  ),
});
