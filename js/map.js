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
const discoveredFogAreas = [];
const discoveredAreaLayers = [];
const fogCanvas = document.createElement("canvas");
const fogContext = fogCanvas.getContext("2d");
const fogPane = map.getPanes().overlayPane;
fogCanvas.className = "fog-canvas";
fogCanvas.style.position = "absolute";
fogCanvas.style.left = "0";
fogCanvas.style.top = "0";
fogCanvas.style.pointerEvents = "none";
fogPane.appendChild(fogCanvas);

L.tileLayer(
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}",
  {
    attribution: "Tiles &copy; Esri",
    maxZoom: 19,
    noWrap: true,
  },
).addTo(map);

function getAreaEndpoints(area) {
  if (
    Number.isFinite(area.startLatitude) &&
    Number.isFinite(area.startLongitude)
  ) {
    return [
      [area.startLatitude, area.startLongitude],
      [area.latitude, area.longitude],
    ];
  }

  return [[area.latitude, area.longitude]];
}

function drawFogOfWar() {
  const size = map.getSize();
  const layerOrigin = map.containerPointToLayerPoint(L.point(0, 0));
  const layerEnd = map.containerPointToLayerPoint(L.point(size.x, size.y));
  const layerSize = layerEnd.subtract(layerOrigin);
  const pixelRatio = window.devicePixelRatio || 1;
  fogCanvas.width = layerSize.x * pixelRatio;
  fogCanvas.height = layerSize.y * pixelRatio;
  fogCanvas.style.left = `${layerOrigin.x}px`;
  fogCanvas.style.top = `${layerOrigin.y}px`;
  fogCanvas.style.width = `${layerSize.x}px`;
  fogCanvas.style.height = `${layerSize.y}px`;
  fogContext.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  fogContext.globalCompositeOperation = "source-over";
  fogContext.fillStyle = "rgba(8, 20, 27, 0.9)";
  fogContext.fillRect(0, 0, size.x, size.y);
  fogContext.globalCompositeOperation = "destination-out";
  fogContext.shadowColor = "rgba(255, 255, 255, 0.25)";

  discoveredFogAreas.forEach((area) => {
    const endpointCoordinates = getAreaEndpoints(area);
    const endpoints = endpointCoordinates.map(([latitude, longitude]) =>
      map.latLngToLayerPoint([latitude, longitude]).subtract(layerOrigin),
    );
    const radiusInPixels = map
      .latLngToLayerPoint([
        endpointCoordinates[0][0],
        endpointCoordinates[0][1] +
          area.radius /
          (111320 *
            Math.cos((endpointCoordinates[0][0] * Math.PI) / 180)),
      ])
      .distanceTo(
        map.latLngToLayerPoint(endpointCoordinates[0]),
      );

    fogContext.beginPath();
    fogContext.shadowBlur = 2;
    if (endpoints.length === 1) {
      fogContext.arc(
        endpoints[0].x,
        endpoints[0].y,
        radiusInPixels,
        0,
        Math.PI * 2,
      );
    } else {
      fogContext.moveTo(endpoints[0].x, endpoints[0].y);
      fogContext.lineTo(endpoints[1].x, endpoints[1].y);
      fogContext.lineWidth = radiusInPixels * 2;
      fogContext.lineCap = "round";
      fogContext.lineJoin = "round";
      fogContext.stroke();
    }
    fogContext.fill();
  });
  fogContext.shadowBlur = 0;
  fogContext.globalCompositeOperation = "source-over";

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

window.clearDiscoveredAreas = () => {
  discoveredAreaLayers.forEach((layer) => map.removeLayer(layer));
  discoveredAreaLayers.length = 0;
  discoveredFogAreas.length = 0;
  drawFogOfWar();
};

window.updateLocationAvatar = (coordinates, avatar, accuracy) => {
  if (Number.isFinite(accuracy)) {
    if (!window.locationAccuracyCircle) {
      window.locationAccuracyCircle = L.circle(coordinates, {
        radius: accuracy,
        color: "#8edbef",
        weight: 1,
        fillColor: "#8edbef",
        fillOpacity: 0.12,
        interactive: false,
      }).addTo(map);
    } else {
      window.locationAccuracyCircle.setLatLng(coordinates);
      window.locationAccuracyCircle.setRadius(accuracy);
    }
  }
  if (!window.locationAvatar) {
    window.locationAvatar = L.marker(coordinates, {
      icon: L.divIcon({
        className: "location-avatar",
        html: `<span aria-label="${avatar.label}">${avatar.svg}</span>`,
        iconSize: [36, 36],
        iconAnchor: [18, 18],
      }),
    }).addTo(map);
    return;
  }
  window.locationAvatar.setLatLng(coordinates);
  window.locationAvatar.setIcon(L.divIcon({
    className: "location-avatar",
    html: `<span aria-label="${avatar.label}">${avatar.svg}</span>`,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
  }));
};

window.clearLocationAvatar = () => {
  if (window.locationAvatar) {
    map.removeLayer(window.locationAvatar);
    window.locationAvatar = null;
  }
  if (window.locationAccuracyCircle) {
    map.removeLayer(window.locationAccuracyCircle);
    window.locationAccuracyCircle = null;
  }
};

map.on("move zoom resize", drawFogOfWar);
drawFogOfWar();
