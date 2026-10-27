"use strict";

// Satellite-style track background (cached) and live player/opponent markers.
const GcvMiniMap = (() => {
  function create({ document, canvas: mapCanvas, positions, sides, SAMPLE_COUNT,
    ROAD_HALF_WIDTH, OUTER_HALF_WIDTH, islands, LapTimes, startIndex, startCenter, startSide }) {
    const map = mapCanvas.getContext("2d");
    const bounds = positions.slice(0, SAMPLE_COUNT).reduce((acc, p) => ({
      minX: Math.min(acc.minX, p.x), maxX: Math.max(acc.maxX, p.x),
      minZ: Math.min(acc.minZ, p.z), maxZ: Math.max(acc.maxZ, p.z),
    }), { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity });
    const mapWidth = mapCanvas.width, mapHeight = mapCanvas.height;
    const mapScale = Math.min((mapWidth - 74) / (bounds.maxX - bounds.minX),
      (mapHeight - 56) / (bounds.maxZ - bounds.minZ));
    const mapCenterX = (bounds.minX + bounds.maxX) / 2;
    const mapCenterZ = (bounds.minZ + bounds.maxZ) / 2;
    const toMap = (x, z) => [
      mapWidth / 2 + (x - mapCenterX) * mapScale,
      mapHeight / 2 + (z - mapCenterZ) * mapScale,
    ];

    // Pre-render the static satellite-style minimap just once. Colors match
    // sea, sandy islands, muddy roadway and light earth safety shoulders.
    const mapBackground = document.createElement("canvas");
    mapBackground.width = mapWidth;
    mapBackground.height = mapHeight;
    const satellite = mapBackground.getContext("2d");
    if (satellite) {
      const waterGradient = satellite.createLinearGradient(0, 0, 0, mapHeight);
      waterGradient.addColorStop(0, "#376e7f");
      waterGradient.addColorStop(1, "#28566b");
      satellite.fillStyle = waterGradient;
      satellite.fillRect(0, 0, mapWidth, mapHeight);

      function islandCircle(x, y, radius, color) {
        satellite.beginPath();
        satellite.arc(x, y, radius, 0, Math.PI * 2);
        satellite.fillStyle = color;
        satellite.fill();
      }
      for (const island of islands) {
        const [x, y] = toMap(island.x, island.z);
        islandCircle(x, y, island.rockRadius * mapScale, "#485b64");
        islandCircle(x - 2, y - 2, island.rockRadius * mapScale * 0.72, "#71828a");
      }

      function drawCourse(width, color) {
        satellite.beginPath();
        positions.forEach((p, index) => {
          const [x, y] = toMap(p.x, p.z);
          if (index === 0) satellite.moveTo(x, y);
          else satellite.lineTo(x, y);
        });
        satellite.closePath();
        satellite.lineCap = "round";
        satellite.lineJoin = "round";
        satellite.strokeStyle = color;
        satellite.lineWidth = width;
        satellite.stroke();
      }
      drawCourse(OUTER_HALF_WIDTH * 2 * mapScale + 3, "#534c3e");
      drawCourse(OUTER_HALF_WIDTH * 2 * mapScale, "#b29871");
      drawCourse(ROAD_HALF_WIDTH * 2 * mapScale, "#856044");

      // Uneven muddy details visible from above; no painted centerline.
      for (let i = 0; i < SAMPLE_COUNT; i += 9) {
        const position = positions[i], normal = sides[i];
        const offset = ((i * 17) % 19 - 9) * 0.65;
        const [x, y] = toMap(position.x + normal.x * offset,
          position.z + normal.z * offset);
        islandCircle(x, y, 1.6 + (i % 3), "#6f523c");
      }

      // Three visual sector checkpoints correspond exactly to the timer.
      LapTimes.SPLIT_FRACTIONS.forEach((fraction, index) => {
        const splitIndex = (startIndex + Math.round(SAMPLE_COUNT * fraction)) % SAMPLE_COUNT;
        const [sx, sy] = toMap(positions[splitIndex].x, positions[splitIndex].z);
        islandCircle(sx, sy, 7, "#15354d");
        islandCircle(sx, sy, 5, "#f8d690");
        satellite.font = "bold 9px system-ui";
        satellite.textAlign = "center";
        satellite.textBaseline = "middle";
        satellite.fillStyle = "#1d2834";
        satellite.fillText(String(index + 1), sx, sy);
      });

      // Finish line marker: a short contrasting crossing and flag, separate
      // from roadway lane markings.
      const [fx, fy] = toMap(startCenter.x, startCenter.z);
      satellite.save();
      satellite.translate(fx, fy);
      satellite.rotate(Math.atan2(startSide.z, startSide.x));
      satellite.fillStyle = "#332b28";
      satellite.fillRect(-ROAD_HALF_WIDTH * mapScale, -2, ROAD_HALF_WIDTH * 2 * mapScale, 4);
      satellite.fillStyle = "#ebd2a0";
      for (let i = 0; i < 8; i += 2) {
        satellite.fillRect(-ROAD_HALF_WIDTH * mapScale + i * ROAD_HALF_WIDTH * mapScale / 4,
          -2, ROAD_HALF_WIDTH * mapScale / 4, 2);
      }
      satellite.restore();
      satellite.fillStyle = "#ffffff";
      satellite.strokeStyle = "#243f4e";
      satellite.lineWidth = 3;
      satellite.font = "bold 17px system-ui";
      satellite.strokeText("⚑", fx + 9, fy - 10);
      satellite.fillText("⚑", fx + 9, fy - 10);
    }

    function draw(player, opponents, opponentMeshes) {
      if (!map) return;
      map.clearRect(0, 0, mapWidth, mapHeight);
      if (satellite) map.drawImage(mapBackground, 0, 0);
      if (opponents) {
        // Tiny opponent markers on the same map as the player.
        for (const ai of opponents) {
          const mesh = opponentMeshes.get(ai.id);
          if (!mesh) continue;
          const [ax, ay] = toMap(mesh.position.x, mesh.position.z);
          map.beginPath();
          map.arc(ax, ay, 4.4, 0, Math.PI * 2);
          map.fillStyle = "#" + ai.color.toString(16).padStart(6, "0");
          map.strokeStyle = "#152e42";
          map.lineWidth = 1.5;
          map.fill();
          map.stroke();
        }
      }
      const x = player.x;
      const z = player.z;
      const [px, py] = toMap(x, z);
      map.save();
      map.shadowColor = "#16212a";
      map.shadowBlur = 7;
      map.fillStyle = "#ed4857";
      map.strokeStyle = "#ffffff";
      map.lineWidth = 3;
      map.beginPath();
      map.arc(px, py, 8, 0, Math.PI * 2);
      map.fill();
      map.stroke();
      map.shadowBlur = 0;
      map.beginPath();
      map.moveTo(px, py);
      map.lineTo(px - Math.sin(player.yaw) * 17, py - Math.cos(player.yaw) * 17);
      map.stroke();
      map.restore();
    }
    return { draw };
  }

  return { create };
})();

if (typeof window !== "undefined") window.GcvMiniMap = GcvMiniMap;
if (typeof module !== "undefined" && module.exports) module.exports = GcvMiniMap;
