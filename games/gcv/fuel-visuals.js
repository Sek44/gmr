"use strict";
// Two shared GPU batches for all fuel cans; only update matrices on a change.
const GcvFuelVisuals = (() => {
  function create({ THREE, scene, fuel }) {
    const bodyGeometry = new THREE.BoxGeometry(1.6, 2.15, 0.9);
    const handleGeometry = new THREE.BoxGeometry(0.95, 0.32, 0.62);
    const bodyMaterial = new THREE.MeshBasicMaterial({ color: 0xff7526 });
    const handleMaterial = new THREE.MeshBasicMaterial({ color: 0x283342 });
    const count = fuel.pickups.length;
    const bodies = new THREE.InstancedMesh(bodyGeometry, bodyMaterial, count);
    const handles = new THREE.InstancedMesh(handleGeometry, handleMaterial, count);
    bodies.frustumCulled = false;
    handles.frustumCulled = false;
    scene.add(bodies, handles);
    const dummy = new THREE.Object3D();
    let lastVersion = -1;

    function sync() {
      if (lastVersion === fuel.version) return;
      lastVersion = fuel.version;
      fuel.pickups.forEach((p, i) => {
        dummy.position.set(p.x, p.y + 1.22, p.z);
        dummy.scale.setScalar(p.collectedAt === null ? 1 : 0);
        dummy.updateMatrix();
        bodies.setMatrixAt(i, dummy.matrix);
        dummy.position.y += 1.24;
        dummy.updateMatrix();
        handles.setMatrixAt(i, dummy.matrix);
      });
      bodies.instanceMatrix.needsUpdate = true;
      handles.instanceMatrix.needsUpdate = true;
    }

    sync();
    return { sync, dispose() {
      scene.remove(bodies, handles);
      bodyGeometry.dispose();
      handleGeometry.dispose();
      bodyMaterial.dispose();
      handleMaterial.dispose();
    } };
  }
  return { create };
})();
if (typeof window !== "undefined") window.GcvFuelVisuals = GcvFuelVisuals;
if (typeof module !== "undefined" && module.exports) module.exports = GcvFuelVisuals;
