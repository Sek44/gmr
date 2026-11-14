"use strict";

// Builds the static 3D world from the same track data used for driving, AI,
// minimap and collisions. No renderer, DOM, vehicle or simulation state here.
const GcvWorld3D = (() => {
  function create({ THREE, TrackLayout, Barriers, Scenery }) {
    const ROAD_HALF_WIDTH = TrackLayout.ROAD_HALF_WIDTH;
    const GRAVEL_WIDTH = TrackLayout.SHOULDER_WIDTH;
    const OUTER_HALF_WIDTH = ROAD_HALF_WIDTH + GRAVEL_WIDTH;
    const SAMPLE_COUNT = TrackLayout.SAMPLE_COUNT;
    const closed = TrackLayout.CLOSED !== false;
    const rainbow = TrackLayout.RAINBOW || null;
    function heightAt(t) {
      // Shared continuous height profile for sampled road, AI and player.
      // Broad crests let the car launch clear of the descending roadway.
      return (TrackLayout.HUMP_PROFILES || []).reduce((height, hump) =>
        height + hump.height * Math.exp(-Math.pow((t - hump.at) / hump.width, 2)), 0);
    }
    const CURVE_POINTS = TrackLayout.WAYPOINTS.map(([x, z]) =>
      new THREE.Vector3(x, 0, z));
    const curve = new THREE.CatmullRomCurve3(CURVE_POINTS, closed, "catmullrom", 0.55);
    const trackLength = curve.getLength();
    const positions = [];
    const directions = [];
    const sides = [];

    for (let i = 0; i <= SAMPLE_COUNT; i++) {
      const t = i / SAMPLE_COUNT;
      const center = curve.getPointAt(t);
      center.y = heightAt(t);
      const tangent = curve.getTangentAt(t).normalize();
      positions.push(center);
      directions.push(tangent);
      sides.push(new THREE.Vector3(-tangent.z, 0, tangent.x));
    }

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x97cfe4);
    scene.fog = new THREE.Fog(0x97cfe4, 500, 2100);
    scene.add(new THREE.HemisphereLight(0xeaf8ff, 0x526d6c, 2.0));
    const sunlight = new THREE.DirectionalLight(0xffeed5, 2.35);
    sunlight.position.set(-70, 120, 45);
    scene.add(sunlight);

    // Earth/mud throughout: road and safety shoulders differ only by soil shade.
    const roadMaterial = new THREE.MeshStandardMaterial({
      color: 0x856044, roughness: 1, side: THREE.DoubleSide,
    });
    const shoulderMaterial = new THREE.MeshStandardMaterial({
      color: 0xb29871, roughness: 1, side: THREE.DoubleSide,
    });

    // Build ribbon meshes from a single closed centerline. The same geometry
    // drives minimap, collision/respawn and future AI waypoint navigation.
    function strip(offset, halfWidth, height, material) {
      const vertices = [], indices = [];
      for (let i = 0; i <= SAMPLE_COUNT; i++) {
        const p = positions[i], n = sides[i];
        for (const sign of [-1, 1]) {
          vertices.push(p.x + n.x * (offset + sign * halfWidth), p.y + height,
            p.z + n.z * (offset + sign * halfWidth));
        }
      }
      for (let i = 0; i < SAMPLE_COUNT; i++) {
        const v = 2 * i;
        indices.push(v, v + 1, v + 2, v + 2, v + 1, v + 3);
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
      geometry.setIndex(indices);
      geometry.computeVertexNormals();
      const mesh = new THREE.Mesh(geometry, material);
      scene.add(mesh);
      return mesh;
    }

    strip(0, OUTER_HALF_WIDTH, 0.02, shoulderMaterial);
    strip(0, ROAD_HALF_WIDTH, 0.07, roadMaterial);

    // Rainbow rails: a clearly visible run of parallel coloured driving
    // strips, bending with the centerline through the zigzag section.
    if (rainbow) {
      const colors = [0xf05c78, 0xfca33a, 0xf4df4e, 0x7fd56d,
        0x37b6d5, 0x5e74df, 0xc879da];
      const first = Math.round(rainbow[0] * SAMPLE_COUNT);
      const last = Math.round(rainbow[1] * SAMPLE_COUNT);
      for (let band = 0; band < colors.length; band++) {
        const vertices = [], indices = [];
        const bandWidth = ROAD_HALF_WIDTH * 2 / colors.length;
        for (let i = first; i <= last; i++) {
          const center = positions[i], side = sides[i];
          for (const edge of [0, 1]) {
            const lateral = -ROAD_HALF_WIDTH + (band + edge) * bandWidth;
            vertices.push(center.x + side.x * lateral, center.y + 0.125,
              center.z + side.z * lateral);
          }
        }
        for (let i = 0; i < last - first; i++) {
          const v = i * 2;
          indices.push(v, v + 1, v + 2, v + 2, v + 1, v + 3);
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
        geometry.setIndex(indices);
        geometry.computeVertexNormals();
        scene.add(new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
          color: colors[band], side: THREE.DoubleSide,
        })));
      }
    }

    // Continuous collision rails retain full sample precision; the visible
    // mesh is a much cheaper single flat strip per side at lower resolution.
    const barriers = closed
      ? Barriers.create(positions.slice(0, SAMPLE_COUNT), trackLength,
        OUTER_HALF_WIDTH, sides.slice(0, SAMPLE_COUNT), ROAD_HALF_WIDTH)
      : Barriers.createOpen(positions, trackLength, OUTER_HALF_WIDTH, sides);
    const railVertices = [], railIndices = [];
    function railQuad(a, b, low, high, y1 = 0, y2 = 0) {
      // Skip degenerate quads created where a hairpin loop was joined.
      if ((a.x - b.x) ** 2 + (a.z - b.z) ** 2 < 1e-8) return;
      const v = railVertices.length / 3;
      railVertices.push(a.x, y1 + low, a.z, b.x, y2 + low, b.z,
        a.x, y1 + high, a.z, b.x, y2 + high, b.z);
      railIndices.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
    }
    const railStep = closed ? 2 : 3;
    for (let i = 0; i < SAMPLE_COUNT; i += railStep) {
      const next = closed ? (i + railStep) % SAMPLE_COUNT :
        Math.min(SAMPLE_COUNT, i + railStep);
      for (const side of [-1, 1]) {
        const rail = side > 0 ? barriers.rails.left : barriers.rails.right;
        railQuad(rail.points[i], rail.points[next], 0.58, 1.38,
          positions[i].y, positions[next].y);
      }
    }
    // Close only the physical start and finish of the OPEN route, never its
    // two timing gates. The classic lap remains unobstructed.
    if (!closed) {
      for (const index of [0, SAMPLE_COUNT]) {
        railQuad(barriers.rails.left.points[index],
          barriers.rails.right.points[index], 0.58, 1.38,
          positions[index].y, positions[index].y);
      }
    }
    const railGeometry = new THREE.BufferGeometry();
    railGeometry.setAttribute("position",
      new THREE.Float32BufferAttribute(railVertices, 3));
    railGeometry.setIndex(railIndices);
    railGeometry.computeVertexNormals();
    scene.add(new THREE.Mesh(railGeometry, new THREE.MeshStandardMaterial({
      color: 0x9baeba, roughness: 0.57, metalness: 0.38,
      side: THREE.DoubleSide,
    })));

    const guardrailPostSamples = [];
    for (let i = 0; i < SAMPLE_COUNT; i += 15) {
      guardrailPostSamples.push(i);
    }
    const guardrailPosts = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.18, 1.55, 0.19),
      new THREE.MeshStandardMaterial({ color: 0x4c6371, roughness: 0.7,
        metalness: 0.33 }),
      guardrailPostSamples.length * 2);
    const postTransform = new THREE.Object3D();
    let postNumber = 0;
    for (const i of guardrailPostSamples) {
      for (const side of [-1, 1]) {
        const rail = side > 0 ? barriers.rails.left : barriers.rails.right;
        if (rail.skippedSamples[i]) continue;
        const point = rail.points[i];
        postTransform.position.set(point.x, positions[i].y + 0.73, point.z);
        postTransform.rotation.y = Math.atan2(
          -directions[i].x, -directions[i].z);
        postTransform.updateMatrix();
        guardrailPosts.setMatrixAt(postNumber++, postTransform.matrix);
      }
    }
    guardrailPosts.count = postNumber;
    guardrailPosts.instanceMatrix.needsUpdate = true;
    scene.add(guardrailPosts);

    // The previously flat ribbon is now a solid-looking elevated island road:
    // dark earth side walls and an underside along the complete closed curve.
    const TRACK_BOTTOM = -4.8;
    const solidVertices = [];
    const solidIndices = [];
    for (let i = 0; i <= SAMPLE_COUNT; i++) {
      const p = positions[i], normal = sides[i];
      const lx = p.x - normal.x * OUTER_HALF_WIDTH;
      const lz = p.z - normal.z * OUTER_HALF_WIDTH;
      const rx = p.x + normal.x * OUTER_HALF_WIDTH;
      const rz = p.z + normal.z * OUTER_HALF_WIDTH;
      solidVertices.push(
        lx, p.y + 0.02, lz, lx, TRACK_BOTTOM, lz,
        rx, p.y + 0.02, rz, rx, TRACK_BOTTOM, rz
      );
    }
    for (let i = 0; i < SAMPLE_COUNT; i++) {
      const a = i * 4, b = a + 4;
      // Left/right cliff faces and a real bottom face.
      solidIndices.push(
        a, b, a + 1, a + 1, b, b + 1,
        a + 2, a + 3, b + 2, a + 3, b + 3, b + 2,
        a + 1, b + 1, a + 3, a + 3, b + 1, b + 3
      );
    }
    const solidGeometry = new THREE.BufferGeometry();
    solidGeometry.setAttribute("position", new THREE.Float32BufferAttribute(solidVertices, 3));
    solidGeometry.setIndex(solidIndices);
    solidGeometry.computeVertexNormals();
    scene.add(new THREE.Mesh(solidGeometry, new THREE.MeshStandardMaterial({
      color: 0x674934, roughness: 1, side: THREE.DoubleSide,
    })));

    // Sparse, low-poly stones on the 6 m earth shoulders. Instancing keeps
    // rendering cheap on Android and never places stones on the asphalt.
    const pebbleCount = Math.ceil(SAMPLE_COUNT / 7) * 2 * 5;
    const pebbles = new THREE.InstancedMesh(
      new THREE.DodecahedronGeometry(0.12, 0),
      new THREE.MeshStandardMaterial({ color: 0x736e61, roughness: 1 }),
      pebbleCount
    );
    const pebble = new THREE.Object3D();
    let pebbleIndex = 0;
    for (let i = 0; i < SAMPLE_COUNT; i += 7) {
      for (const side of [-1, 1]) {
        for (let stone = 0; stone < 5; stone++) {
          const proportion = ((i * 13 + stone * 43) % 97) / 97;
          const offset = side * (ROAD_HALF_WIDTH + 0.22 + proportion * (GRAVEL_WIDTH - 0.44));
          const center = positions[i], normal = sides[i];
          pebble.position.set(center.x + normal.x * offset, center.y + 0.11,
            center.z + normal.z * offset);
          pebble.scale.set(0.5 + proportion * 0.6, 0.25, 0.7);
          pebble.rotation.set(0, proportion * Math.PI, 0);
          pebble.updateMatrix();
          pebbles.setMatrixAt(pebbleIndex++, pebble.matrix);
        }
      }
    }
    pebbles.instanceMatrix.needsUpdate = true;
    scene.add(pebbles);
    // Muddy patches give the road a rough, irregular surface without painted
    // white/yellow lane markings. All use a single instanced draw call.
    const patches = new THREE.InstancedMesh(
      new THREE.CircleGeometry(1, 10),
      new THREE.MeshStandardMaterial({
        color: 0x614a37, roughness: 1, transparent: true, opacity: 0.42,
        depthWrite: false, side: THREE.DoubleSide,
      }),
      Math.floor((SAMPLE_COUNT - 1) / 2)
    );
    const patch = new THREE.Object3D();
    let patchIndex = 0;
    for (let i = 2; i < SAMPLE_COUNT; i += 2) {
      const p = positions[i], normal = sides[i];
      const n = ((i * 61) % 97) / 97;
      const offset = (n * 2 - 1) * (ROAD_HALF_WIDTH - 1.5);
      patch.position.set(p.x + normal.x * offset, p.y + 0.096,
        p.z + normal.z * offset);
      patch.rotation.set(-Math.PI / 2, 0, i * 0.31);
      patch.scale.set(0.5 + n * 1.7, 1.2 + (i % 7) * 0.31, 1);
      patch.updateMatrix();
      patches.setMatrixAt(patchIndex++, patch.matrix);
    }
    patches.instanceMatrix.needsUpdate = true;
    scene.add(patches);

    // Shallow water puddles: purely decorative, no changes to grip or
    // physics. Instancing allows all puddles to render in two draw calls.
    // They sit slightly above the 0.07 m dirt road to prevent z-fighting.
    const puddleIndices = Array.from({ length: 19 }, (_, i) =>
      Math.round((i + 0.62) * SAMPLE_COUNT / 19));
    const puddleShape = new THREE.CircleGeometry(1, 20);
    const puddleWater = new THREE.InstancedMesh(
      puddleShape,
      new THREE.MeshStandardMaterial({
        color: 0x527d89, roughness: 0.14, metalness: 0.18,
        transparent: true, opacity: 0.77,
        depthWrite: false, side: THREE.DoubleSide,
      }),
      puddleIndices.length
    );
    const puddleReflection = new THREE.InstancedMesh(
      puddleShape,
      new THREE.MeshBasicMaterial({
        color: 0xadd6e0, transparent: true, opacity: 0.23,
        depthWrite: false, side: THREE.DoubleSide,
      }),
      puddleIndices.length
    );
    const puddleTransform = new THREE.Object3D();
    for (let i = 0; i < puddleIndices.length; i++) {
      const j = puddleIndices[i] % SAMPLE_COUNT;
      const center = positions[j], normal = sides[j];
      const variation = ((i * 37 + 13) % 89) / 89;
      const offset = (variation * 2 - 1) * (ROAD_HALF_WIDTH - 3.1);
      const radius = 1.2 + ((i * 19) % 11) / 11 * 1.7;
      const x = center.x + normal.x * offset;
      const z = center.z + normal.z * offset;
      const yaw = i * 0.71;
      puddleTransform.position.set(x, center.y + 0.086, z);
      puddleTransform.rotation.set(-Math.PI / 2, 0, yaw);
      puddleTransform.scale.set(radius, radius * (0.55 + variation * 0.25), 1);
      puddleTransform.updateMatrix();
      puddleWater.setMatrixAt(i, puddleTransform.matrix);
      // A narrow, pale reflected strip makes the standing water legible,
      // even in the low-poly lighting of the rest of the circuit.
      puddleTransform.position.set(x, center.y + 0.088, z);
      puddleTransform.scale.set(radius * 0.59, radius * 0.17, 1);
      puddleTransform.updateMatrix();
      puddleReflection.setMatrixAt(i, puddleTransform.matrix);
    }
    puddleWater.instanceMatrix.needsUpdate = true;
    puddleReflection.instanceMatrix.needsUpdate = true;
    scene.add(puddleWater, puddleReflection);

    // Checkered line across a straight section of the circuit.
    const startIndex = TrackLayout.nearestIndex(positions,
      TrackLayout.START || TrackLayout.FINISH);
    const finishIndex = TrackLayout.nearestIndex(positions, TrackLayout.FINISH);
    const startCenter = positions[startIndex], startSide = sides[startIndex];
    const finishCenter = positions[finishIndex];
    const startYaw = Math.atan2(-directions[startIndex].x, -directions[startIndex].z);
    // Shared checkered tile geometry: two draw calls per line instead of 24.
    // Instancing preserves each tile's original dimensions, orientation and
    // alternating colors, including the pale start on the open track.
    const lineTileGeometry = new THREE.BoxGeometry(1.47, 0.02, 1.35);
    const tileTransform = new THREE.Object3D();
    function markLine(index, checkered) {
      const center = positions[index], side = sides[index];
      const yaw = Math.atan2(-directions[index].x, -directions[index].z);
      const colors = checkered ? [0xf5ede6, 0x322b35] :
        [0xf9d966, 0xd9e0ed];
      const meshes = colors.map((color) => new THREE.InstancedMesh(
        lineTileGeometry, new THREE.MeshStandardMaterial({
          color, roughness: 1,
        }), 12));
      const count = [0, 0];
      for (let row = 0; row < 2; row++) {
        for (let col = 0; col < 12; col++) {
          const longitudinal = directions[index].clone().multiplyScalar(
            (row - .5) * 1.35);
          const across = side.clone().multiplyScalar((col - 5.5) * 1.47);
          tileTransform.position.copy(center).add(longitudinal).add(across);
          tileTransform.position.y = center.y + .14;
          tileTransform.rotation.set(0, yaw, 0);
          tileTransform.updateMatrix();
          const colorIndex = (row + col) % 2;
          meshes[colorIndex].setMatrixAt(count[colorIndex]++,
            tileTransform.matrix);
        }
      }
      for (let index = 0; index < meshes.length; index++) {
        meshes[index].count = count[index];
        meshes[index].instanceMatrix.needsUpdate = true;
        scene.add(meshes[index]);
      }
    }
    markLine(startIndex, closed);
    if (!closed) markLine(finishIndex, true);

    // Huge sea under the raised dirt course. It extends beyond the camera's
    // visibility so its rectangular edge cannot appear on the horizon.
    const WATER_LEVEL = -30;
    const abyss = new THREE.Mesh(
      new THREE.PlaneGeometry(4200, 4200),
      new THREE.MeshStandardMaterial({
        color: 0x417f91, roughness: 0.28, metalness: 0.04,
      })
    );
    abyss.rotation.x = -Math.PI / 2;
    abyss.position.y = WATER_LEVEL;
    scene.add(abyss);

    // Bare rock islets: the rocks rise directly out of the water, with
    // no beaches or sandy discs. Validate against the ENTIRE winding circuit
    // and previously placed rocks to avoid obstacles appearing on the road.
    const rockMaterial = new THREE.MeshStandardMaterial({
      color: 0x64737b, roughness: 1, flatShading: true,
    });
    const rockGeometry = new THREE.DodecahedronGeometry(1, 1);
    const islands = [];
    const rockCount = closed ? 22 : 12;
    for (let i = 0; i < rockCount; i++) {
      const index = Math.floor(i * SAMPLE_COUNT / rockCount);
      const side = i % 2 === 0 ? -1 : 1;
      const rockRadius = 8.5 + (i % 4) * 1.4;
      const rockHeight = 22 + (i % 5) * 3.5;
      const location = Scenery.placeRock({
        center: positions[index], normal: sides[index], side,
        startOffset: OUTER_HALF_WIDTH + 42 + (i % 3) * 13,
        radius: rockRadius, roadLimit: OUTER_HALF_WIDTH,
        trackPoints: positions, existing: islands,
      });
      if (!location) continue;
      const rock = new THREE.Mesh(rockGeometry, rockMaterial);
      rock.scale.set(rockRadius, rockHeight, rockRadius * 0.9);
      // Centre low enough that the rock penetrates the water surface.
      rock.position.set(location.x, WATER_LEVEL + rockHeight * 0.70, location.z);
      rock.rotation.y = i * 0.74;
      scene.add(rock);
      islands.push(location);
    }

    return {
      scene, ROAD_HALF_WIDTH, OUTER_HALF_WIDTH, SAMPLE_COUNT, curve,
      trackLength, positions, directions, sides, barriers,
      startIndex, finishIndex, startCenter, finishCenter, startSide, startYaw, islands,
      closed, heightAt,
    };
  }

  return Object.freeze({ create });
})();
if (typeof window !== "undefined") window.GcvWorld3D = GcvWorld3D;
if (typeof module !== "undefined" && module.exports) module.exports = GcvWorld3D;
