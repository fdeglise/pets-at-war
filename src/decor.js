// Haven Isle's village and wildlife (cottages, windmill, lamp posts, well, pier and boat,
// bushes, mushrooms, gulls and butterflies) and the Easy-mode shelter with its barrier dome.
// Everything here is decoration plus a few colliders; buildWorld() calls buildDecor().
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { std, rbox, mesh, group, glowMat } from './models.js';

const tmpV = new THREE.Vector3();

// Merge every static mesh under root into one mesh per material (far fewer draw calls).
// Subtrees marked userData.keep (animated parts) are left alone.
function bake(root) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const rel = new THREE.Matrix4();
  const byMat = new Map();
  const done = [];
  const walk = (o) => {
    if (o.userData.keep) return;
    if (o.isMesh && !o.isInstancedMesh) {
      const geo = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') geo.deleteAttribute(k);
      geo.morphAttributes = {};
      geo.applyMatrix4(rel.multiplyMatrices(inv, o.matrixWorld));
      const key = `${o.material.uuid}:${o.castShadow ? 1 : 0}`;
      if (!byMat.has(key)) byMat.set(key, { mat: o.material, cast: o.castShadow, geos: [] });
      byMat.get(key).geos.push(geo);
      done.push(o);
    }
    for (const c of o.children) walk(c);
  };
  walk(root);
  for (const o of done) o.parent.remove(o);
  for (const { mat, cast, geos } of byMat.values()) {
    const m = new THREE.Mesh(mergeGeometries(geos), mat);
    m.castShadow = cast;
    m.receiveShadow = true;
    root.add(m);
  }
}

export function buildDecor(ctx) {
  const { scene, R, getHeight, okSpot, farFromPlaced, placed, addCol, pathDist, portals, clearZones, HAVEN, PLAZA_R } = ctx;
  const S = ctx.shelterSpot;
  const animated = [];
  const smoke = [];
  // static village pieces go in here and get merged at the end
  const village = new THREE.Group();
  scene.add(village);
  const clear = (x, z, r) => clearZones.push({ x, z, r });
  const slopeAround = (x, z, r) => {
    const h = getHeight(x, z);
    let m = 0;
    for (let k = 0; k < 8; k++) {
      const q = (k / 8) * Math.PI * 2;
      m = Math.max(m, Math.abs(getHeight(x + Math.cos(q) * r, z + Math.sin(q) * r) - h));
    }
    return m;
  };
  const awayFromShelter = (x, z, r) => Math.hypot(x - S.x, z - S.z) > 13 + r;
  const awayFromPortals = (x, z, r) => portals.every((p) => Math.hypot(x - p.x, z - p.z) > 12 + r);

  // ---------- shared materials ----------
  const M = {
    stone: std(0xb3a893, { rough: 0.95, flat: true }),
    stoneDark: std(0x857b6c, { rough: 0.95, flat: true }),
    timber: std(0x6b4426, { rough: 0.85 }),
    wood: std(0x9a6a3d, { rough: 0.8 }),
    door: std(0x5a3418, { rough: 0.75 }),
    plank: std(0xffffff, { rough: 0.85 }),
    window: std(0xffd88a, { rough: 0.3, emissive: 0xffa53a, ei: 0.85 }),
    frame: std(0x4a2e18, { rough: 0.8 }),
    straw: std(0xe0c068, { rough: 0.9, flat: true }),
    cloth: std(0xf4ecd8, { rough: 0.9 }),
    leaf: std(0xffffff, { rough: 0.8, flat: true }),
  };
  const roofColors = [0xc4553a, 0x3f6fb5, 0x8a4a2a, 0x2f8f7a, 0xb8443f];
  const wallColors = [0xf3e6cc, 0xf6efe2, 0xf2d9bf, 0xe9e2d0, 0xf5e3c8];
  const flowerMats = [0xff5a6e, 0xffd23f, 0xffffff, 0xb07cff, 0xff9a3c].map((c) => std(c, { rough: 0.6 }));
  const doorKnob = glowMat(0xffd27a, 2);

  // ---------- cottages ----------
  function cottage(x, z, yaw, k) {
    const g = group(village, x, getHeight(x, z) - 0.05, z);
    g.rotation.y = yaw;
    const W = 5.2, D = 4.2, H = 2.9, base = 0.35, top = base + H;
    const th = 0.62, gh = (D / 2) * Math.tan(th);
    const wall = std(wallColors[k % wallColors.length], { rough: 0.9 });
    const roof = std(roofColors[k % roofColors.length], { rough: 0.75, flat: true });
    mesh(rbox(W + 0.5, 1.1, D + 0.5, 0.08), M.stoneDark, 0, -0.2, 0, g);
    mesh(rbox(W, H, D, 0.05), wall, 0, base + H / 2, 0, g);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) mesh(rbox(0.3, H + 0.1, 0.3, 0.04), M.timber, sx * W / 2, base + H / 2, sz * D / 2, g);
    for (const sz of [-1, 1]) mesh(rbox(W + 0.2, 0.26, 0.3, 0.04), M.timber, 0, top, sz * D / 2, g);
    // gable ends
    const tri = new THREE.Shape([new THREE.Vector2(-D / 2, 0), new THREE.Vector2(D / 2, 0), new THREE.Vector2(0, gh)]);
    const gable = new THREE.ExtrudeGeometry(tri, { depth: 0.24, bevelEnabled: false }).rotateY(Math.PI / 2);
    for (const sx of [-1, 1]) mesh(gable, wall, sx * (W / 2) - 0.12, top, 0, g);
    // roof
    const L = (D / 2 + 0.6) / Math.cos(th);
    const slab = rbox(W + 0.9, 0.24, L, 0.06);
    for (const sz of [-1, 1]) {
      const r = mesh(slab, roof, 0, top + gh - (L / 2) * Math.sin(th) + 0.12, sz * (L / 2) * Math.cos(th), g);
      r.rotation.x = sz * th;
    }
    mesh(rbox(W + 1.0, 0.3, 0.36, 0.08), roof, 0, top + gh + 0.12, 0, g);
    // door, windows, flower box
    mesh(rbox(1.05, 1.95, 0.14, 0.04), M.door, -1.0, base + 0.98, D / 2 + 0.04, g);
    mesh(rbox(0.12, 0.12, 0.1, 0.03), doorKnob, -0.62, base + 0.95, D / 2 + 0.14, g, false);
    const win = (wx, wy, wz, ry) => {
      const w = group(g, wx, wy, wz);
      w.rotation.y = ry;
      mesh(rbox(0.95, 0.85, 0.1, 0.03), M.window, 0, 0, 0, w, false);
      mesh(rbox(1.1, 0.12, 0.16, 0.03), M.frame, 0, -0.48, 0.02, w);
      mesh(rbox(1.1, 0.1, 0.14, 0.03), M.frame, 0, 0.47, 0.02, w);
      mesh(rbox(0.08, 0.85, 0.14, 0.02), M.frame, 0, 0, 0.03, w, false);
      mesh(rbox(0.95, 0.08, 0.14, 0.02), M.frame, 0, 0, 0.03, w, false);
      return w;
    };
    const fw = win(1.15, base + 1.75, D / 2 + 0.05, 0);
    mesh(rbox(1.15, 0.28, 0.34, 0.05), M.wood, 0, -0.72, 0.18, fw);
    for (let i = 0; i < 5; i++) mesh(rbox(0.16, 0.16, 0.16, 0.05), flowerMats[(i + k) % flowerMats.length], -0.42 + i * 0.21, -0.5, 0.2, fw, false);
    win(W / 2 + 0.05, base + 1.75, 0, Math.PI / 2);
    win(-W / 2 - 0.05, base + 1.75, 0, -Math.PI / 2);
    // chimney
    const chim = mesh(rbox(0.65, 2.0, 0.65, 0.05), M.stone, 1.5, top + 1.0, -0.95, g);
    mesh(rbox(0.8, 0.18, 0.8, 0.04), M.stoneDark, 1.5, top + 2.05, -0.95, g);
    g.updateMatrixWorld(true);
    smoke.push({ pos: chim.localToWorld(new THREE.Vector3(0, 1.25, 0)), big: false });
    // colliders and the space around the house
    const c = Math.cos(yaw), s = Math.sin(yaw);
    for (const o of [-1.4, 1.4]) addCol(x + c * o, z - s * o, 2.25);
    placed.push({ x, z, r: 5 });
    clear(x, z, 4.4);
  }

  // Houses line the dirt paths, their doors facing the path.
  {
    let n = 0;
    for (let tries = 0; n < 6 && tries < 3000; tries++) {
      const a = R(0, Math.PI * 2), d = R(PLAZA_R + 9, 60);
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      const pd = pathDist(x, z);
      if (pd < 6.5 || pd > 13) continue;
      if (!okSpot(HAVEN, x, z, PLAZA_R + 8, 64, 1.2) || slopeAround(x, z, 3.2) > 1.3) continue;
      if (!farFromPlaced(x, z, 6) || !awayFromShelter(x, z, 4) || !awayFromPortals(x, z, 4)) continue;
      // face down the slope of the distance-to-path field, i.e. toward the path
      const gx = pathDist(x + 0.5, z) - pathDist(x - 0.5, z), gz = pathDist(x, z + 0.5) - pathDist(x, z - 0.5);
      cottage(x, z, Math.atan2(-gx, -gz), n);
      n++;
    }
  }

  // ---------- windmill on a hill ----------
  const windmill = (() => {
    let best = null, bs = -1e9;
    for (let tries = 0; tries < 900; tries++) {
      const a = R(0, Math.PI * 2), d = R(38, 88);
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (!okSpot(HAVEN, x, z, 36, 92, 1.4) || pathDist(x, z) < 9 || !farFromPlaced(x, z, 6)) continue;
      if (!awayFromShelter(x, z, 6) || !awayFromPortals(x, z, 6)) continue;
      const sl = slopeAround(x, z, 3);
      if (sl > 1.4) continue;
      const sc = getHeight(x, z) - sl * 3 - d * 0.04;
      if (sc > bs) { bs = sc; best = { x, z }; }
    }
    if (!best) return null;
    const { x, z } = best;
    const g = group(village, x, getHeight(x, z) - 0.1, z);
    g.rotation.y = Math.atan2(-x, -z); // sails face the plaza
    const plaster = std(0xf2ead8, { rough: 0.9, flat: true });
    const roof = std(0x9a3d2c, { rough: 0.75, flat: true });
    mesh(new THREE.CylinderGeometry(2.4, 2.8, 1.4, 8), M.stone, 0, 0.3, 0, g);
    mesh(new THREE.CylinderGeometry(1.55, 2.3, 7.6, 8), plaster, 0, 4.7, 0, g);
    mesh(new THREE.CylinderGeometry(1.62, 1.62, 0.3, 8), M.timber, 0, 8.45, 0, g);
    mesh(new THREE.ConeGeometry(2.15, 2.7, 8), roof, 0, 9.9, 0, g);
    mesh(rbox(1.0, 1.9, 0.3, 0.05), M.door, 0, 1.9, 2.15, g);
    for (const [wy, wz] of [[4.6, 1.95], [6.7, 1.72]]) mesh(rbox(0.6, 0.7, 0.12, 0.03), M.window, 0, wy, wz, g, false);
    const hub = group(g, 0, 7.7, 1.75);
    hub.userData.keep = true;
    mesh(new THREE.CylinderGeometry(0.32, 0.4, 1.0, 10).rotateX(Math.PI / 2), M.timber, 0, 0, 0.1, hub);
    const sails = group(hub, 0, 0, 0.62);
    mesh(rbox(0.6, 0.6, 0.3, 0.1), M.timber, 0, 0, 0, sails);
    for (let i = 0; i < 4; i++) {
      const arm = group(sails);
      arm.rotation.z = (i / 4) * Math.PI * 2;
      mesh(rbox(0.2, 5.6, 0.18, 0.04), M.timber, 0, 2.9, 0, arm);
      mesh(rbox(1.15, 4.2, 0.06, 0.02), M.cloth, 0.68, 3.4, 0.02, arm);
      for (let q = 0; q < 4; q++) mesh(rbox(1.2, 0.07, 0.1, 0.02), M.timber, 0.68, 1.75 + q * 1.1, 0.06, arm, false);
    }
    sails.rotation.z = 0.4;
    animated.push((dt) => { sails.rotation.z += dt * 0.55; });
    addCol(x, z, 2.6);
    placed.push({ x, z, r: 6.5 });
    clear(x, z, 3.4);
    // hay bales
    for (let i = 0; i < 4; i++) {
      const a = Math.atan2(-x, -z) + 1.2 + i * 0.45, d2 = 4.6 + (i % 2) * 0.6;
      const hx = x + Math.sin(a) * d2, hz = z + Math.cos(a) * d2;
      const bale = mesh(new THREE.CylinderGeometry(0.62, 0.62, 1.2, 12).rotateZ(Math.PI / 2), M.straw, hx, getHeight(hx, hz) + 0.55, hz, village);
      bale.rotation.y = a + R(-0.4, 0.4);
      addCol(hx, hz, 0.65);
    }
    return { x, z };
  })();

  // ---------- a stone well by the plaza ----------
  {
    for (let tries = 0; tries < 400; tries++) {
      const a = R(0, Math.PI * 2), d = R(PLAZA_R + 5, PLAZA_R + 14);
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (pathDist(x, z) < 4.5 || !okSpot(HAVEN, x, z, PLAZA_R + 4, PLAZA_R + 16, 1.0) || !farFromPlaced(x, z, 3)) continue;
      if (!awayFromShelter(x, z, 2)) continue;
      const g = group(village, x, getHeight(x, z), z);
      mesh(new THREE.CylinderGeometry(1.15, 1.25, 1.0, 12, 1, true), M.stone, 0, 0.5, 0, g);
      mesh(new THREE.TorusGeometry(1.15, 0.16, 6, 14).rotateX(Math.PI / 2), M.stoneDark, 0, 1.0, 0, g);
      mesh(new THREE.CircleGeometry(1.05, 14).rotateX(-Math.PI / 2), std(0x2a6fa0, { rough: 0.1, metal: 0.2 }), 0, 0.55, 0, g, false);
      for (const sx of [-1, 1]) mesh(rbox(0.2, 2.4, 0.2, 0.04), M.timber, sx * 1.0, 1.4, 0, g);
      const rf = std(0x8a4a2a, { rough: 0.75, flat: true });
      for (const sx of [-1, 1]) {
        const r = mesh(rbox(1.5, 0.12, 2.0, 0.03), rf, sx * 0.62, 2.85, 0, g);
        r.rotation.z = -sx * 0.6;
      }
      mesh(new THREE.CylinderGeometry(0.1, 0.1, 2.1, 8).rotateZ(Math.PI / 2), M.wood, 0, 2.05, 0, g);
      mesh(rbox(0.36, 0.4, 0.36, 0.05), M.wood, 0, 1.55, 0, g);
      addCol(x, z, 1.35);
      placed.push({ x, z, r: 2.2 });
      clear(x, z, 1.6);
      break;
    }
  }

  // ---------- lamp posts along the dirt paths ----------
  const lampMat = glowMat(0xffc36b, 2.4);
  for (const p of portals) {
    if (p.island !== 'haven') continue;
    const ax = Math.cos(p.a) * PLAZA_R, az = Math.sin(p.a) * PLAZA_R;
    const vx = p.x - ax, vz = p.z - az, len = Math.hypot(vx, vz);
    const nx = -vz / len, nz = vx / len;
    [0.2, 0.42, 0.64].forEach((t, i) => {
      const side = i % 2 ? 1 : -1;
      const x = ax + vx * t + nx * 2.8 * side, z = az + vz * t + nz * 2.8 * side;
      if (getHeight(x, z) < 1.0) return;
      const g = group(village, x, getHeight(x, z) - 0.05, z);
      g.rotation.y = Math.atan2(nx * side, nz * side) + Math.PI;
      mesh(rbox(0.5, 0.35, 0.5, 0.06), M.stoneDark, 0, 0.17, 0, g);
      mesh(rbox(0.2, 3.3, 0.2, 0.04), M.timber, 0, 1.8, 0, g);
      mesh(rbox(0.12, 0.12, 0.9, 0.03), M.timber, 0, 3.35, 0.38, g);
      mesh(rbox(0.42, 0.5, 0.42, 0.06), lampMat, 0, 3.0, 0.78, g, false);
      mesh(rbox(0.56, 0.12, 0.56, 0.04), M.frame, 0, 3.3, 0.78, g);
      addCol(x, z, 0.3);
    });
  }
  animated.push((dt, t) => {
    const f = 0.92 + Math.sin(t * 6.1) * 0.05 + Math.sin(t * 11.7) * 0.03;
    lampMat.color.setRGB(2.4 * f, 1.3 * f, 0.38 * f);
  });

  // ---------- the pier and a rowboat ----------
  const P = ctx.pier;
  if (P) {
    const ca = Math.cos(P.a), sa = Math.sin(P.a);
    const at = (along, across) => [ca * (P.r0 + along) - sa * across, sa * (P.r0 + along) + ca * across];
    const yaw = Math.atan2(ca, sa);
    const n = Math.floor(P.len / 0.56);
    const planks = new THREE.InstancedMesh(rbox(P.w, 0.16, 0.5, 0.03), M.plank, n);
    planks.castShadow = planks.receiveShadow = true;
    const dm = new THREE.Object3D();
    for (let i = 0; i < n; i++) {
      const [x, z] = at(0.3 + i * 0.56, R(-0.05, 0.05));
      dm.position.set(x, P.y - 0.08, z);
      dm.rotation.set(0, yaw + R(-0.02, 0.02), 0);
      dm.updateMatrix();
      planks.setMatrixAt(i, dm.matrix);
      planks.setColorAt(i, new THREE.Color().setHSL(0.08, 0.42, R(0.32, 0.42)));
    }
    scene.add(planks);
    const postGeo = new THREE.CylinderGeometry(0.16, 0.18, 1, 8);
    for (let along = 2; along <= P.len; along += 3) {
      for (const side of [-1, 1]) {
        const [x, z] = at(along, side * (P.w / 2 + 0.05));
        const ground = getHeight(x, z);
        const topY = along > 4 ? P.y + 0.9 : P.y + 0.1;
        const post = mesh(postGeo, M.timber, x, (ground + topY) / 2 - 0.2, z, village);
        post.scale.y = topY - ground + 0.4;
      }
    }
    // rope railing on the outer part
    for (const side of [-1, 1]) {
      const [x0, z0] = at(5, side * (P.w / 2 + 0.05));
      const [x1, z1] = at(P.len - 1, side * (P.w / 2 + 0.05));
      const rope = mesh(new THREE.CylinderGeometry(0.04, 0.04, Math.hypot(x1 - x0, z1 - z0), 5).rotateX(Math.PI / 2), std(0xc8a676, { rough: 0.9 }), (x0 + x1) / 2, P.y + 0.75, (z0 + z1) / 2, village, false);
      rope.rotation.y = yaw;
    }
    // a lantern at the end
    const [lx, lz] = at(P.len - 0.4, 0);
    mesh(rbox(0.2, 2.2, 0.2, 0.04), M.timber, lx, P.y + 1.1, lz, village);
    mesh(rbox(0.38, 0.44, 0.38, 0.06), lampMat, lx, P.y + 2.35, lz, village, false);
    addCol(lx, lz, 0.25);
    // rowboat tied alongside
    const [bx, bz] = at(P.len - 3.5, P.w / 2 + 1.6);
    const boat = group(scene, bx, -0.05, bz);
    boat.rotation.y = yaw + 0.12;
    const hullM = std(0x8a5530, { rough: 0.8 });
    const hull = mesh(rbox(1.7, 0.7, 4.0, 0.25), hullM, 0, 0, 0, boat);
    hull.scale.set(1, 1, 1);
    mesh(rbox(1.35, 0.2, 3.5, 0.15), std(0x5e3a1e, { rough: 0.85 }), 0, 0.28, 0, boat, false);
    mesh(rbox(1.75, 0.12, 4.05, 0.05), std(0xe8e0cc, { rough: 0.7 }), 0, 0.36, 0, boat);
    for (const z of [-0.9, 0.7]) mesh(rbox(1.4, 0.1, 0.4, 0.03), M.wood, 0, 0.34, z, boat);
    for (const sx of [-1, 1]) {
      const oar = mesh(rbox(0.08, 0.08, 2.6, 0.02), M.wood, sx * 0.95, 0.45, 0.1, boat);
      oar.rotation.set(0.1, sx * 0.35, sx * 0.3);
    }
    animated.push((dt, t) => {
      boat.position.y = -0.1 + Math.sin(t * 1.3) * 0.08;
      boat.rotation.z = Math.sin(t * 1.1) * 0.05;
      boat.rotation.x = Math.sin(t * 0.9 + 1) * 0.03;
    });
    clear(...at(-2, 0), 2.5);
  }

  // ---------- bushes and mushrooms ----------
  {
    const icoG = (r, x, y, z) => new THREE.IcosahedronGeometry(r, 0).translate(x, y, z);
    const bushGeo = mergeGeometries([icoG(0.85, 0, 0.55, 0), icoG(0.65, 0.6, 0.45, 0.2), icoG(0.6, -0.55, 0.4, -0.15), icoG(0.5, 0.1, 0.95, -0.3)]);
    const BN = 110;
    const bushes = new THREE.InstancedMesh(bushGeo, M.leaf, BN);
    bushes.castShadow = bushes.receiveShadow = true;
    const dm = new THREE.Object3D();
    const greens = [0x4caa48, 0x3f9a3f, 0x5dba4c, 0x6fbf55, 0x4a9e52];
    let bn = 0;
    for (let tries = 0; bn < BN && tries < 4000; tries++) {
      const a = R(0, Math.PI * 2), d = R(PLAZA_R + 4, HAVEN.r - 8);
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (!okSpot(HAVEN, x, z, PLAZA_R + 3, HAVEN.r - 6, 1.4) || !farFromPlaced(x, z, 1.1) || !awayFromShelter(x, z, 0)) continue;
      const s = R(0.7, 1.35);
      dm.position.set(x, getHeight(x, z) - 0.15, z);
      dm.rotation.set(0, R(0, Math.PI * 2), 0);
      dm.scale.set(s, s * R(0.8, 1.1), s);
      dm.updateMatrix();
      bushes.setMatrixAt(bn, dm.matrix);
      bushes.setColorAt(bn, new THREE.Color(greens[bn % greens.length]).offsetHSL(0, 0, R(-0.04, 0.04)));
      placed.push({ x, z, r: 0.9 * s });
      bn++;
    }
    bushes.count = bn;
    scene.add(bushes);

    const MN = 140;
    const stems = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.06, 0.09, 0.34, 6).translate(0, 0.17, 0), std(0xf4ecdc, { rough: 0.8 }), MN);
    const caps = new THREE.InstancedMesh(new THREE.SphereGeometry(0.24, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.75, 1).translate(0, 0.3, 0), std(0xffffff, { rough: 0.55 }), MN);
    const capColors = [0xe0402f, 0xe0402f, 0xd9822b, 0xb0784a, 0xf0e6d0];
    let mn = 0;
    for (let tries = 0; mn < MN && tries < 3000; tries++) {
      const a = R(0, Math.PI * 2), d = R(PLAZA_R + 4, HAVEN.r - 10);
      const cx = Math.cos(a) * d, cz = Math.sin(a) * d;
      if (!okSpot(HAVEN, cx, cz, PLAZA_R + 3, HAVEN.r - 6, 1.2) || !awayFromShelter(cx, cz, 0)) continue;
      const col = capColors[Math.floor(R(0, capColors.length))];
      for (let q = 0; q < 4 && mn < MN; q++) {
        const x = cx + R(-0.9, 0.9), z = cz + R(-0.9, 0.9);
        const s = R(0.6, 1.4);
        dm.position.set(x, getHeight(x, z) - 0.03, z);
        dm.rotation.set(R(-0.15, 0.15), R(0, 3), R(-0.15, 0.15));
        dm.scale.setScalar(s);
        dm.updateMatrix();
        stems.setMatrixAt(mn, dm.matrix);
        caps.setMatrixAt(mn, dm.matrix);
        caps.setColorAt(mn, new THREE.Color(col).offsetHSL(0, 0, R(-0.04, 0.04)));
        mn++;
      }
    }
    stems.count = caps.count = mn;
    stems.castShadow = caps.castShadow = true;
    scene.add(stems, caps);
  }

  // ---------- gulls circling over Haven and the sea ----------
  {
    const birdM = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 });
    const painted = (geo, hex) => {
      const g = geo.index ? geo.toNonIndexed() : geo;
      const c = new THREE.Color(hex), n = g.attributes.position.count, arr = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
      g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
      g.deleteAttribute('uv');
      return g;
    };
    const bodyGeo = mergeGeometries([
      painted(new THREE.BoxGeometry(0.36, 0.32, 1.05), 0xf4f6f8),
      painted(new THREE.BoxGeometry(0.28, 0.27, 0.32).translate(0, 0.12, 0.6), 0xf4f6f8),
      painted(new THREE.BoxGeometry(0.1, 0.08, 0.24).translate(0, 0.08, 0.86), 0xf0a030),
    ]);
    const wingGeoFor = (sx) => mergeGeometries([
      painted(new THREE.BoxGeometry(0.85, 0.05, 0.46).translate(sx * 0.43, 0, 0), 0xdfe5ea),
      painted(new THREE.BoxGeometry(0.6, 0.04, 0.34).translate(sx * 1.15, 0, -0.04), 0x50555c),
    ]);
    const wingGeos = { '-1': wingGeoFor(-1), 1: wingGeoFor(1) };
    const birds = [];
    const flocks = [
      { c: new THREE.Vector3(10, 44, -8), r: 62, n: 8 },
      { c: new THREE.Vector3(-120, 34, -40), r: 38, n: 5 },
      { c: new THREE.Vector3(120, 38, 120), r: 45, n: 5 },
    ];
    for (const F of flocks) {
      for (let i = 0; i < F.n; i++) {
        const g = new THREE.Group();
        mesh(bodyGeo, birdM, 0, 0, 0, g, false);
        const wings = [];
        for (const sx of [-1, 1]) {
          const w = mesh(wingGeos[sx], birdM, sx * 0.16, 0.06, 0.05, g, false);
          wings.push({ w, sx });
        }
        g.scale.setScalar(1.35);
        scene.add(g);
        birds.push({ g, wings, F, a: R(0, Math.PI * 2), rr: F.r + R(-14, 14), sp: R(8, 12), ph: R(0, 100), h: R(-4, 6) });
      }
    }
    animated.push((dt, t, camera) => {
      for (const b of birds) {
        b.a += (b.sp / b.rr) * dt;
        const x = b.F.c.x + Math.cos(b.a) * b.rr, z = b.F.c.z + Math.sin(b.a) * b.rr;
        b.g.position.set(x, b.F.c.y + b.h + Math.sin(t * 0.4 + b.ph) * 3, z);
        b.g.rotation.set(0, Math.atan2(-Math.sin(b.a), Math.cos(b.a)), -0.32, 'YXZ');
        const far = camera.position.distanceToSquared(b.g.position) > 260 * 260;
        b.g.visible = !far;
        if (far) continue;
        const flapping = Math.sin(t * 0.35 + b.ph) > -0.2;
        const f = flapping ? Math.sin(t * 8 + b.ph) : 0.1;
        for (const w of b.wings) w.w.rotation.z = w.sx * f * 0.55;
      }
    });
  }

  // ---------- butterflies over the meadow ----------
  {
    const wingGeo = new THREE.PlaneGeometry(0.36, 0.3).translate(0.18, 0, 0).rotateX(-Math.PI / 2);
    const colors = [0xffb627, 0xff6fa8, 0x8fe8ff, 0xffffff, 0xc06bff, 0xff7a2f];
    const flies = [];
    for (let i = 0; i < 30; i++) {
      let x = 0, z = 0;
      for (let tries = 0; tries < 50; tries++) {
        const a = R(0, Math.PI * 2), d = R(PLAZA_R + 3, 70);
        x = Math.cos(a) * d; z = Math.sin(a) * d;
        if (getHeight(x, z) > 1.2) break;
      }
      const g = new THREE.Group();
      const mat = new THREE.MeshStandardMaterial({ color: colors[i % colors.length], roughness: 0.6, side: THREE.DoubleSide, emissive: colors[i % colors.length], emissiveIntensity: 0.25 });
      const L = mesh(wingGeo, mat, 0.02, 0, 0, g, false);
      const Rw = mesh(wingGeo, mat, -0.02, 0, 0, g, false);
      Rw.scale.x = -1;
      scene.add(g);
      flies.push({ g, L, Rw, c: new THREE.Vector2(x, z), ph: R(0, 100), k: R(0.7, 1.3) });
    }
    let prev = new THREE.Vector3();
    animated.push((dt, t, camera) => {
      for (const f of flies) {
        const near = camera.position.distanceToSquared(tmpV.set(f.c.x, camera.position.y, f.c.y)) < 85 * 85;
        f.g.visible = near;
        if (!near) continue;
        const tt = t * f.k + f.ph;
        const x = f.c.x + Math.sin(tt * 0.7) * 3.2 + Math.sin(tt * 1.9) * 0.7;
        const z = f.c.y + Math.cos(tt * 0.53) * 3.2 + Math.cos(tt * 2.3) * 0.6;
        prev.copy(f.g.position);
        f.g.position.set(x, getHeight(x, z) + 1.1 + Math.sin(tt * 1.7) * 0.45, z);
        const dx = x - prev.x, dz = z - prev.z;
        if (dx * dx + dz * dz > 1e-6) f.g.rotation.y = Math.atan2(dx, dz);
        const flap = 0.15 + Math.abs(Math.sin(tt * 15)) * 1.15;
        f.L.rotation.z = flap;
        f.Rw.rotation.z = -flap;
      }
    });
  }

  // ---------- the Easy-mode shelter ----------
  const shelter = (() => {
    const BR = 9.5; // barrier radius
    const g = group(scene, S.x, S.y, S.z);
    const cols = [];
    const roofM = std(0x3f8f7a, { rough: 0.7, flat: true });
    const trimM = std(0xf0e2c0, { rough: 0.8 });
    // the roof fades out while you stand under it, so it never hides you from the camera
    const roofTrimM = std(0xf0e2c0, { rough: 0.8 });
    const beamM = std(0x6b4426, { rough: 0.85 });
    const fadeMats = [roofM, roofTrimM, beamM];
    for (const m of fadeMats) m.transparent = true;
    let roofK = 1;
    mesh(new THREE.CylinderGeometry(7.9, 8.3, 0.5, 24), M.stoneDark, 0, -0.18, 0, g);
    mesh(new THREE.CylinderGeometry(7.4, 7.4, 0.5, 24), M.stone, 0, -0.14, 0, g);
    const tileM = std(0xd8c9a8, { rough: 0.9, flat: true });
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const tl = mesh(rbox(1.5, 0.1, 0.6, 0.03), tileM, Math.cos(a) * 4.6, 0.12, Math.sin(a) * 4.6, g, false);
      tl.rotation.y = -a;
    }
    // posts, ring beam and roof
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      const px = Math.cos(a) * 7.0, pz = Math.sin(a) * 7.0;
      mesh(rbox(0.5, 4.4, 0.5, 0.06), M.timber, px, 2.2, pz, g);
      mesh(rbox(0.8, 0.4, 0.8, 0.06), M.stoneDark, px, 0.2, pz, g);
      cols.push(addCol(S.x + px, S.z + pz, 0.4));
    }
    mesh(new THREE.CylinderGeometry(7.35, 7.35, 0.4, 8, 1, true), beamM, 0, 4.35, 0, g);
    const roof = mesh(new THREE.ConeGeometry(9.4, 3.6, 8), roofM, 0, 4.4 + 1.8, 0, g);
    roof.rotation.y = Math.PI / 8;
    mesh(new THREE.CylinderGeometry(9.45, 9.45, 0.28, 8), roofTrimM, 0, 4.45, 0, g).rotation.y = Math.PI / 8;
    // the warding crystal on top
    const crystalMat = glowMat(0x6bffd8, 2.2);
    const crystal = mesh(new THREE.OctahedronGeometry(0.75, 0), crystalMat, 0, 9.0, 0, g, false);
    crystal.userData.keep = true;
    crystal.scale.set(1, 1.6, 1);
    // healing spring in the middle
    mesh(new THREE.CylinderGeometry(1.7, 1.85, 0.6, 14, 1, true), M.stone, 0, 0.3, 0, g);
    mesh(new THREE.TorusGeometry(1.7, 0.18, 6, 16).rotateX(Math.PI / 2), M.stoneDark, 0, 0.6, 0, g);
    const springMat = glowMat(0x5effc8, 1.25);
    mesh(new THREE.CircleGeometry(1.6, 18).rotateX(-Math.PI / 2), springMat, 0, 0.45, 0, g, false);
    cols.push(addCol(S.x, S.z, 1.6));
    // bedrolls and cushions
    const rollColors = [0xc4553a, 0x3f6fb5, 0xe0b040];
    for (let i = 0; i < 3; i++) {
      const a = 0.6 + i * 2.1;
      const b = mesh(rbox(1.2, 0.3, 2.2, 0.12), std(rollColors[i], { rough: 0.9 }), Math.cos(a) * 4.4, 0.25, Math.sin(a) * 4.4, g);
      b.rotation.y = -a;
      mesh(rbox(0.9, 0.3, 0.5, 0.14), trimM, Math.cos(a) * 5.2, 0.42, Math.sin(a) * 5.2, g).rotation.y = -a;
    }
    // barrier dome
    const domeU = { uTime: { value: 0 }, uHit: { value: 0 }, uColor: { value: new THREE.Color(0x5effd0) }, uR: { value: BR } };
    const domeMat = new THREE.ShaderMaterial({
      uniforms: domeU,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      vertexShader: `varying vec3 vLocal; varying vec3 vWorld; varying vec3 vN;
        void main(){ vLocal = position; vec4 wp = modelMatrix * vec4(position, 1.0); vWorld = wp.xyz;
          vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * wp; }`,
      fragmentShader: `uniform float uTime; uniform float uHit; uniform vec3 uColor; uniform float uR;
        varying vec3 vLocal; varying vec3 vWorld; varying vec3 vN;
        void main(){
          vec3 V = normalize(cameraPosition - vWorld);
          float fres = pow(1.0 - abs(dot(normalize(vN), V)), 3.0);
          float lat = clamp(vLocal.y / uR, 0.0, 1.0);
          float lon = atan(vLocal.z, vLocal.x);
          vec2 gp = vec2(lon * 2.865, lat * 7.0);
          gp.x += mod(floor(gp.y), 2.0) * 0.5;
          vec2 cell = abs(fract(gp) - 0.5);
          float line = smoothstep(0.43, 0.5, max(cell.x, cell.y));
          float scan = smoothstep(0.97, 1.0, sin(lat * 16.0 - uTime * 2.2)) * 0.7;
          float base = 1.0 - smoothstep(0.0, 0.22, lat);
          float a = fres * 0.42 + line * 0.1 * (1.0 - lat * 0.5) + scan * 0.1 + base * 0.3;
          a *= 0.8 + 0.2 * sin(uTime * 1.6);
          a += uHit * (0.12 + line * 0.5);
          gl_FragColor = vec4(uColor * a * 1.5, 1.0);
        }`,
    });
    const dome = mesh(new THREE.SphereGeometry(BR, 48, 18, 0, Math.PI * 2, 0, Math.PI / 2), domeMat, 0, 0, 0, g, false);
    dome.renderOrder = 4;
    dome.userData.keep = true;
    const ringMat = glowMat(0x5effd0, 1.6, { transparent: true, opacity: 0.8 });
    mesh(new THREE.RingGeometry(BR - 0.25, BR + 0.08, 72).rotateX(-Math.PI / 2), ringMat, 0, 0.08, 0, g, false);

    const sh = {
      x: S.x, y: S.y, z: S.z, r: BR, active: true, group: g,
      hitT: 0,
      setActive(on) {
        this.active = on;
        g.visible = on;
        for (const c of cols) c.off = !on;
      },
      // Is a point (pad > 0 is more generous) inside the safe zone?
      contains(pos, pad = 0) {
        if (!this.active) return false;
        if (pos.y !== undefined && pos.y > this.y + BR) return false;
        return Math.hypot(pos.x - this.x, pos.z - this.z) < BR - 0.2 + pad;
      },
      // Does the dome stop a projectile here?
      blocks(pos) {
        if (!this.active) return false;
        const dx = pos.x - this.x, dy = pos.y - this.y, dz = pos.z - this.z;
        return dy > -1 && dx * dx + dy * dy + dz * dz < BR * BR;
      },
      // Push an enemy back out through the barrier.
      repel(m) {
        if (!this.active || m.def.flying) return;
        const rr = BR + m.radius * 0.8;
        let dx = m.pos.x - this.x, dz = m.pos.z - this.z;
        let d = Math.hypot(dx, dz);
        if (d >= rr) return;
        if (d < 1e-3) { dx = 1; dz = 0; d = 1; }
        m.pos.x = this.x + (dx / d) * rr;
        m.pos.z = this.z + (dz / d) * rr;
        this.bump(m.pos, 0.35);
      },
      bump(pos, k = 0.5) { this.hitT = Math.max(this.hitT, k); },
    };
    animated.push((dt, t, camera, focus) => {
      if (!sh.active) return;
      const under = focus && Math.hypot(focus.x - S.x, focus.z - S.z) < 9.8 && focus.y < S.y + 6;
      const want = under ? 0.15 : 1;
      if (roofK !== want) {
        roofK = Math.abs(want - roofK) < 0.01 ? want : roofK + (want - roofK) * Math.min(1, dt * 6);
        for (const m of fadeMats) { m.opacity = roofK; m.depthWrite = roofK > 0.99; }
      }
      domeU.uTime.value = t;
      sh.hitT = Math.max(0, sh.hitT - dt * 1.8);
      domeU.uHit.value = sh.hitT;
      crystal.rotation.y = t * 0.9;
      crystal.position.y = 9.0 + Math.sin(t * 1.5) * 0.25;
      const p = 1 + Math.sin(t * 2.2) * 0.15;
      crystalMat.color.setRGB(0.42 * 2.2 * p, 2.2 * p, 1.8 * p);
      springMat.color.setRGB(0.37 * 1.25, 1.25 * (1 + Math.sin(t * 3) * 0.1), 0.98 * 1.25);
    });
    clear(S.x, S.z, 10);
    placed.push({ x: S.x, z: S.z, r: 11 });
    bake(g);
    return sh;
  })();

  bake(village);

  return {
    shelter,
    smoke,
    windmill,
    update(dt, t, camera, focus) {
      for (const f of animated) f(dt, t, camera, focus);
    },
  };
}
