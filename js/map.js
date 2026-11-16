const worldBounds = [
  [-90, -180],
  [90, 180],
];
const switzerlandBounds = [
  [45.8, 5.9],
  [47.9, 10.6],
];
const map = L.map("map", {
  maxBounds: worldBounds,
  maxBoundsViscosity: 1,
  minZoom: 2,
  worldCopyJump: false,
});
map.fitBounds(switzerlandBounds);
window.worldMap = map;
const fogBoundary = [
  [-90, -180],
  [-90, 180],
  [90, 180],
  [90, -180],
];
const discoveredFogAreas = [];
const discoveredAreaLayers = [];
let fogLayer = null;

L.tileLayer(
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}",
  {
    attribution: "Tiles &copy; Esri",
    maxZoom: 19,
    noWrap: true,
  },
).addTo(map);

function createCirclePoints(area) {
  const points = [];
  const latitudeRadius = area.radius / 111320;
  const longitudeRadius =
    area.radius / (111320 * Math.cos((area.latitude * Math.PI) / 180));

  for (let index = 0; index < 64; index += 1) {
    const angle = (index / 64) * Math.PI * 2;
    points.push([
      area.latitude + Math.sin(angle) * latitudeRadius,
      area.longitude + Math.cos(angle) * longitudeRadius,
    ]);
  }

  return points;
}

function drawFogOfWar() {
  if (fogLayer) {
    map.removeLayer(fogLayer);
  }

  const holes = discoveredFogAreas.map(createCirclePoints);
  fogLayer = L.polygon([fogBoundary, ...holes], {
    stroke: false,
    fillColor: "#5c5c5c",
    fillOpacity: 0.8,
    interactive: false,
  }).addTo(map);

  discoveredAreaLayers.forEach((layer) => layer.bringToFront());
}

window.addFogArea = (area) => {
  discoveredFogAreas.push(area);
  drawFogOfWar();
};

window.registerDiscoveredAreaLayer = (layer) => {
  discoveredAreaLayers.push(layer);
  layer.bringToFront();
};

drawFogOfWar();
