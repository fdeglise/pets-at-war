// Procedural blocky models: avatars, pets, monsters, weapons, armor, loot.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { WEAPONS, ARMORS, ELEMENTS } from './data.js';
import { makeTitan, makeDragon } from './bigModels.js';

// ---------- shared helpers ----------
const gcache = new Map();
export function rbox(w, h, d, r = 0.08, seg = 2) {
  const key = `${w},${h},${d},${r},${seg}`;
  let g = gcache.get(key);
  if (!g) {
    g = new RoundedBoxGeometry(w, h, d, seg, Math.min(r, Math.min(w, h, d) * 0.49));
    gcache.set(key, g);
  }
  return g;
}
const shared = {};
export const cached = (key, fn) => shared[key] || (shared[key] = fn());

export function std(color, o = {}) {
  const m = new THREE.MeshStandardMaterial({
    color,
    roughness: o.rough ?? 0.55,
    metalness: o.metal ?? 0,
    flatShading: !!o.flat,
  });
  if (o.emissive !== undefined && o.emissive !== null) {
    m.emissive.set(o.emissive);
    m.emissiveIntensity = o.ei ?? 1;
  }
  if (o.opacity !== undefined) {
    m.transparent = true;
    m.opacity = o.opacity;
  }
  if (o.side) m.side = o.side;
  return m;
}

// Basic (unlit) glowing material; values above 1 feed the bloom pass.
export function glowMat(hex, intensity = 2.5, o = {}) {
  const c = new THREE.Color(hex).multiplyScalar(intensity);
  return new THREE.MeshBasicMaterial({ color: c, transparent: !!o.transparent, opacity: o.opacity ?? 1, ...o.extra });
}

export function mesh(geo, mat, x = 0, y = 0, z = 0, parent = null, shadow = true) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = shadow;
  m.receiveShadow = true;
  if (parent) parent.add(m);
  return m;
}
export function group(parent, x = 0, y = 0, z = 0) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  if (parent) parent.add(g);
  return g;
}

// Materials that should flash white when hit.
export function collectMats(root) {
  const s = new Set();
  root.traverse((o) => {
    if (o.isMesh && o.material && o.material.emissive) s.add(o.material);
  });
  return [...s].map((m) => {
    m.userData.baseEmissive = m.emissive.clone();
    m.userData.baseEI = m.emissiveIntensity;
    return m;
  });
}
export function setFlash(mats, k, color = 0xffffff) {
  for (const m of mats) {
    if (k > 0) {
      m.emissive.set(color);
      m.emissiveIntensity = k;
    } else {
      m.emissive.copy(m.userData.baseEmissive);
      m.emissiveIntensity = m.userData.baseEI;
    }
  }
}
export function disposeMats(root) {
  root.traverse((o) => {
    if (o.isMesh && o.material && !o.material.userData.shared) o.material.dispose();
  });
}

// ---------- faces ----------
const faceCache = {};
function faceTex(kind) {
  if (faceCache[kind]) return faceCache[kind];
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const rr = (x, y, w, h, r) => {
    g.beginPath();
    if (g.roundRect) g.roundRect(x, y, w, h, r);
    else g.rect(x, y, w, h);
    g.fill();
  };
  const ell = (x, y, rx, ry, rot = 0) => {
    g.beginPath();
    g.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
    g.fill();
  };
  if (kind === 'smile' || kind === 'merchant') {
    g.fillStyle = '#1d1a22';
    rr(35, 32, 16, 27, 8);
    rr(77, 32, 16, 27, 8);
    g.fillStyle = '#ffffff';
    ell(45, 40, 4, 4);
    ell(87, 40, 4, 4);
    g.fillStyle = 'rgba(255,105,120,0.35)';
    ell(28, 74, 10, 6);
    ell(100, 74, 10, 6);
    g.strokeStyle = '#1d1a22';
    g.lineWidth = 6;
    g.lineCap = 'round';
    g.beginPath();
    g.arc(64, 66, 20, 0.15 * Math.PI, 0.85 * Math.PI);
    g.stroke();
    if (kind === 'merchant') {
      g.fillStyle = '#6b4226';
      ell(52, 80, 14, 6, 0.25);
      ell(76, 80, 14, 6, -0.25);
    }
  } else if (kind === 'skull') {
    g.fillStyle = '#211818';
    ell(44, 52, 15, 17);
    ell(84, 52, 15, 17);
    g.beginPath();
    g.moveTo(64, 70);
    g.lineTo(57, 84);
    g.lineTo(71, 84);
    g.closePath();
    g.fill();
    g.fillRect(38, 96, 52, 14);
    g.fillStyle = '#ece6d6';
    for (let i = 0; i < 6; i++) g.fillRect(40 + i * 8.6, 98, 6, 10);
  } else if (kind === 'angry') {
    g.fillStyle = '#1a0f1f';
    g.save();
    g.translate(42, 46); g.rotate(0.35); g.fillRect(-18, -5, 36, 9); g.restore();
    g.save();
    g.translate(86, 46); g.rotate(-0.35); g.fillRect(-18, -5, 36, 9); g.restore();
    g.fillStyle = '#ffe04a';
    ell(44, 60, 9, 7);
    ell(84, 60, 9, 7);
    g.fillStyle = '#1a0f1f';
    ell(44, 60, 3.5, 5);
    ell(84, 60, 3.5, 5);
    g.beginPath();
    g.moveTo(36, 92); g.lineTo(92, 92); g.lineTo(84, 106); g.lineTo(44, 106);
    g.closePath(); g.fill();
    g.fillStyle = '#f3ead2';
    g.beginPath(); g.moveTo(42, 93); g.lineTo(50, 93); g.lineTo(46, 80); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(78, 93); g.lineTo(86, 93); g.lineTo(82, 80); g.closePath(); g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return (faceCache[kind] = t);
}
function facePlane(kind, w, h) {
  const m = new THREE.MeshStandardMaterial({ map: faceTex(kind), transparent: true, alphaTest: 0.05, roughness: 0.7, depthWrite: false });
  m.polygonOffset = true;
  m.polygonOffsetFactor = -2;
  const p = new THREE.Mesh(cached('faceGeo' + w + h, () => new THREE.PlaneGeometry(w, h)), m);
  return p;
}

// ---------- humanoid avatar ----------
export function makeAvatar(o = {}) {
  const root = new THREE.Group();
  const body = group(root);
  const mats = {
    skin: std(o.skin ?? 0xf2c79a, { rough: 0.6 }),
    shirt: std(o.shirt ?? 0x2f80ed, { rough: 0.7 }),
    pants: std(o.pants ?? 0x2b3245, { rough: 0.75 }),
    shoes: std(o.shoes ?? 0x1d1f27, { rough: 0.8 }),
  };
  const hipL = group(body, -0.255, 1.0, 0);
  const hipR = group(body, 0.255, 1.0, 0);
  for (const hip of [hipL, hipR]) {
    mesh(rbox(0.46, 1.0, 0.5, 0.07), mats.pants, 0, -0.5, 0, hip);
    mesh(rbox(0.5, 0.2, 0.58, 0.07), mats.shoes, 0, -0.9, 0.03, hip);
  }
  const torso = mesh(rbox(1.04, 1.02, 0.54, 0.1), mats.shirt, 0, 1.5, 0, body);
  mesh(rbox(1.07, 0.12, 0.57, 0.04), mats.shoes, 0, 1.05, 0, body);
  const shL = group(body, -0.78, 1.93, 0);
  const shR = group(body, 0.78, 1.93, 0);
  for (const sh of [shL, shR]) {
    mesh(rbox(0.5, 0.5, 0.54, 0.08), mats.shirt, 0, -0.2, 0, sh);
    mesh(rbox(0.44, 0.62, 0.48, 0.08), mats.skin, 0, -0.68, 0, sh);
  }
  const handL = group(shL, 0, -0.95, 0.02);
  const handR = group(shR, 0, -0.95, 0.02);
  const neck = group(body, 0, 2.02, 0);
  const head = mesh(rbox(0.7, 0.66, 0.7, 0.18, 3), mats.skin, 0, 0.34, 0, neck);
  const face = facePlane(o.face ?? 'smile', 0.62, 0.58);
  face.position.set(0, 0.32, 0.352);
  neck.add(face);
  if (o.hair) {
    const hm = std(o.hair, { rough: 0.8 });
    mesh(rbox(0.76, 0.2, 0.76, 0.08), hm, 0, 0.66, 0, neck);
    mesh(rbox(0.76, 0.44, 0.2, 0.06), hm, 0, 0.46, -0.3, neck);
  }
  if (o.hat === 'merchant') {
    const hm = std(0x5a2d7a, { rough: 0.7 });
    mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.06, 20), hm, 0, 0.68, 0, neck);
    mesh(new THREE.CylinderGeometry(0.3, 0.36, 0.42, 16), hm, 0, 0.9, 0, neck);
    mesh(new THREE.CylinderGeometry(0.365, 0.365, 0.08, 16), std(0xffc23d, { metal: 0.6, rough: 0.3 }), 0, 0.74, 0, neck);
  }
  return { root, body, torso, hipL, hipR, shL, shR, handL, handR, neck, head, mats, armor: [] };
}

export function applyArmor(av, armorId) {
  for (const m of av.armor) m.parent && m.parent.remove(m);
  av.armor = [];
  if (!armorId) return;
  const d = ARMORS[armorId];
  const m = std(d.color, { metal: d.metal, rough: d.rough, emissive: d.emissive, ei: 0.55 });
  const trim = std(d.trim, { metal: Math.min(1, d.metal + 0.1), rough: 0.5 });
  const add = (geo, mat, parent, x, y, z) => {
    const p = mesh(geo, mat, x, y, z, parent);
    av.armor.push(p);
    return p;
  };
  add(rbox(1.12, 0.84, 0.64, 0.1), m, av.body, 0, 1.6, 0);
  add(rbox(0.34, 0.3, 0.06, 0.04), trim, av.body, 0, 1.66, 0.33);
  add(rbox(1.14, 0.14, 0.66, 0.04), trim, av.body, 0, 1.2, 0);
  for (const [sh, s] of [[av.shL, -1], [av.shR, 1]]) {
    add(rbox(0.62, 0.3, 0.64, 0.1), m, sh, s * 0.03, -0.02, 0);
    add(rbox(0.5, 0.16, 0.54, 0.05), trim, sh, 0, -0.66, 0);
  }
  for (const hip of [av.hipL, av.hipR]) add(rbox(0.52, 0.46, 0.56, 0.08), m, hip, 0, -0.27, 0);
  add(rbox(0.8, 0.3, 0.8, 0.14), m, av.neck, 0, 0.66, 0);
  add(rbox(0.82, 0.08, 0.82, 0.03), trim, av.neck, 0, 0.53, 0);
  add(rbox(0.12, 0.42, 0.62, 0.04), m, av.neck, -0.39, 0.42, -0.04);
  add(rbox(0.12, 0.42, 0.62, 0.04), m, av.neck, 0.39, 0.42, -0.04);
  if (d.horns) {
    const hg = cached('hornGeo', () => new THREE.ConeGeometry(0.09, 0.4, 6));
    const h1 = add(hg, trim, av.neck, -0.3, 0.92, 0);
    h1.rotation.z = 0.5;
    const h2 = add(hg, trim, av.neck, 0.3, 0.92, 0);
    h2.rotation.z = -0.5;
  }
}

export function walkRig(r, phase, amt, armSwing = 0.8) {
  const s = Math.sin(phase) * 0.8 * amt;
  r.hipL.rotation.x = s;
  r.hipR.rotation.x = -s;
  if (r.shL) r.shL.rotation.x = -s * armSwing;
  if (r.shR) r.shR.rotation.x = s * armSwing;
  r.body.position.y = Math.abs(Math.cos(phase)) * 0.08 * amt;
}

// ---------- weapons ----------
export function makeSword(id, element = null) {
  const d = WEAPONS[id];
  const g = new THREE.Group();
  const len = d.len ?? 1.2;
  const w = d.width ?? 0.11;
  const shape = new THREE.Shape();
  shape.moveTo(-w, 0);
  shape.lineTo(w, 0);
  shape.lineTo(w, len * 0.8);
  shape.lineTo(0, len);
  shape.lineTo(-w, len * 0.8);
  shape.closePath();
  const bgeo = cached('blade' + id, () => {
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.035, bevelEnabled: true, bevelThickness: 0.018, bevelSize: 0.022, bevelSegments: 1 });
    geo.translate(0, 0, -0.0175);
    return geo;
  });
  const el = element ? ELEMENTS[element] : null;
  const glow = el ? el.hex : d.glow;
  const bmat = std(d.blade, {
    metal: d.metal ?? 0.75,
    rough: d.rough ?? 0.22,
    emissive: glow ?? null,
    ei: el ? 1.4 : 0.9,
  });
  mesh(bgeo, bmat, 0, 0.12, 0, g);
  const gm = std(d.guard ?? 0x6b4a2b, { metal: 0.55, rough: 0.35 });
  mesh(rbox(0.5, 0.09, 0.15, 0.03), gm, 0, 0.1, 0, g);
  mesh(cached('swordHandle', () => new THREE.CylinderGeometry(0.045, 0.05, 0.34, 8)), std(0x3b2a1e, { rough: 0.8 }), 0, -0.08, 0, g);
  mesh(cached('swordPommel', () => new THREE.SphereGeometry(0.075, 10, 8)), gm, 0, -0.27, 0, g);
  if (id === 'dragonfang') {
    const sp = cached('spike', () => new THREE.ConeGeometry(0.05, 0.22, 5));
    const s1 = mesh(sp, gm, -0.3, 0.16, 0, g); s1.rotation.z = 0.9;
    const s2 = mesh(sp, gm, 0.3, 0.16, 0, g); s2.rotation.z = -0.9;
  }
  g.userData.kind = 'sword';
  return g;
}

export function makeBow(id, element = null, tint = null) {
  const d = WEAPONS[id];
  const g = new THREE.Group();
  const r = d.size ?? 0.7;
  const el = element ? ELEMENTS[element] : null;
  const wood = std(tint ?? d.wood, { rough: 0.6, metal: 0.05, emissive: el ? el.hex : d.glow ?? null, ei: el ? 0.35 : 0.25 });
  const arc = cached('bowArc' + r, () => {
    const a = new THREE.TorusGeometry(r, 0.05, 6, 22, Math.PI * 0.9);
    a.rotateZ(Math.PI * 0.55);
    a.translate(r, 0, 0);
    return a;
  });
  mesh(arc, wood, 0, 0, 0, g);
  const tipY = r * Math.sin(Math.PI * 0.55);
  const stringX = r + r * Math.cos(Math.PI * 0.55);
  const str = mesh(cached('bowStr' + r, () => new THREE.CylinderGeometry(0.012, 0.012, tipY * 2, 4)), std(0xf5efe0, { rough: 0.9 }), stringX, 0, 0, g, false);
  str.castShadow = false;
  mesh(rbox(0.13, 0.26, 0.13, 0.04), std(d.trim ?? 0x3b2a1e, { rough: 0.7, metal: d.trim ? 0.6 : 0 }), 0, 0, 0, g);
  if (el || d.glow) {
    const gm = glowMat(el ? el.hex : d.glow, 2.2);
    const tg = cached('bowTip', () => new THREE.OctahedronGeometry(0.07));
    mesh(tg, gm, stringX, tipY, 0, g, false);
    mesh(tg, gm, stringX, -tipY, 0, g, false);
  }
  g.userData.kind = 'bow';
  return g;
}

// Orientations of weapons inside hand pivots.
const _m = new THREE.Matrix4();
export const BOW_AIM_Q = new THREE.Quaternion().setFromRotationMatrix(
  _m.makeBasis(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0))
);
export const BOW_IDLE_Q = new THREE.Quaternion().setFromRotationMatrix(
  _m.makeBasis(new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0))
);

export function makeArrow(color = 0xd9c7a0, glowHex = null) {
  const g = new THREE.Group();
  const shaft = cached('arrowShaft', () => new THREE.CylinderGeometry(0.03, 0.03, 1.1, 5).rotateX(Math.PI / 2));
  const tip = cached('arrowTip', () => new THREE.ConeGeometry(0.075, 0.24, 4).rotateX(Math.PI / 2));
  const fl = cached('arrowFl', () => new THREE.BoxGeometry(0.02, 0.16, 0.26));
  mesh(shaft, cached('arrowShaftM' + color, () => std(color, { rough: 0.8 })), 0, 0, 0, g, false);
  mesh(tip, glowHex ? cached('arrowTipG' + glowHex, () => glowMat(glowHex, 3)) : cached('arrowTipM', () => std(0x9aa3ad, { metal: 0.8, rough: 0.3 })), 0, 0, 0.62, g, false);
  const fm = cached('arrowFlM' + (glowHex ?? 0), () => std(glowHex ?? 0xe8e8e8, { rough: 0.9 }));
  mesh(fl, fm, 0, 0, -0.48, g, false);
  const f2 = mesh(fl, fm, 0, 0, -0.48, g, false);
  f2.rotation.z = Math.PI / 2;
  g.traverse((o) => { if (o.material) o.material.userData.shared = true; });
  return g;
}

export function makeArmorModel(id) {
  const d = ARMORS[id];
  const g = new THREE.Group();
  const m = std(d.color, { metal: d.metal, rough: d.rough, emissive: d.emissive, ei: 0.55 });
  const trim = std(d.trim, { metal: Math.min(1, d.metal + 0.1), rough: 0.5 });
  mesh(rbox(1.12, 0.9, 0.62, 0.12), m, 0, 0, 0, g);
  mesh(rbox(0.36, 0.32, 0.06, 0.04), trim, 0, 0.08, 0.32, g);
  mesh(rbox(1.14, 0.14, 0.64, 0.04), trim, 0, -0.4, 0, g);
  mesh(rbox(0.6, 0.3, 0.64, 0.1), m, -0.72, 0.36, 0, g);
  mesh(rbox(0.6, 0.3, 0.64, 0.1), m, 0.72, 0.36, 0, g);
  if (d.horns) {
    const hg = cached('hornGeo', () => new THREE.ConeGeometry(0.09, 0.4, 6));
    mesh(hg, trim, -0.72, 0.65, 0, g);
    mesh(hg, trim, 0.72, 0.65, 0, g);
  }
  return g;
}

export function makeItemModel(item) {
  if (item.type === 'weapon') {
    const d = WEAPONS[item.id];
    return d.kind === 'sword' ? makeSword(item.id, item.element) : makeBow(item.id, item.element);
  }
  return makeArmorModel(item.id);
}

// ---------- pets ----------
function petEyes(head, z, y = 0.08, gap = 0.17, s = 1) {
  const eye = cached('petEyeM', () => std(0x161418, { rough: 0.25 }));
  const glint = cached('petGlintM', () => glowMat(0xffffff, 1.2));
  for (const x of [-gap, gap]) {
    mesh(rbox(0.11 * s, 0.15 * s, 0.05, 0.03), eye, x, y, z, head, false);
    mesh(cached('glintGeo', () => new THREE.BoxGeometry(0.04, 0.04, 0.02)), glint, x + 0.02, y + 0.04, z + 0.03, head, false);
  }
}
function healerGem(root, y) {
  const gem = mesh(cached('gemGeo', () => new THREE.OctahedronGeometry(0.16)), glowMat(0x5effa8, 2.2), 0, y, 0, root, false);
  return gem;
}

export function makePet(id) {
  const root = new THREE.Group();
  const r = { root, legs: [], kind: id };
  if (id === 'fox') {
    const body = (r.body = group(root, 0, 0.58, 0));
    const orange = std(0xff8a3d, { rough: 0.75 });
    const cream = std(0xfff1dc, { rough: 0.8 });
    const dark = std(0x2b1d14, { rough: 0.7 });
    mesh(rbox(0.7, 0.55, 1.0, 0.16), orange, 0, 0, 0, body);
    mesh(rbox(0.5, 0.26, 0.7, 0.1), cream, 0, -0.18, 0.06, body);
    const head = (r.head = group(body, 0, 0.36, 0.56));
    mesh(rbox(0.72, 0.6, 0.6, 0.17), orange, 0, 0, 0, head);
    mesh(rbox(0.38, 0.24, 0.3, 0.08), cream, 0, -0.13, 0.36, head);
    mesh(rbox(0.13, 0.1, 0.08, 0.03), dark, 0, -0.05, 0.52, head);
    mesh(rbox(0.5, 0.16, 0.05, 0.04), cream, 0, -0.17, 0.3, head);
    petEyes(head, 0.3);
    const ear = cached('foxEar', () => new THREE.ConeGeometry(0.15, 0.34, 4));
    for (const x of [-0.22, 0.22]) {
      const e = mesh(ear, orange, x, 0.42, -0.02, head);
      e.rotation.y = Math.PI / 4;
      const ei = mesh(cached('foxEarIn', () => new THREE.ConeGeometry(0.08, 0.2, 4)), dark, x, 0.4, 0.06, head, false);
      ei.rotation.y = Math.PI / 4;
    }
    const tail = (r.tail = group(body, 0, 0.12, -0.5));
    mesh(rbox(0.32, 0.32, 0.62, 0.14), orange, 0, 0, -0.3, tail);
    mesh(rbox(0.34, 0.34, 0.24, 0.12), cream, 0, 0, -0.68, tail);
    tail.rotation.x = 0.55;
    for (const [x, z] of [[-0.22, 0.32], [0.22, 0.32], [-0.22, -0.32], [0.22, -0.32]]) {
      const p = group(body, x, -0.2, z);
      mesh(rbox(0.18, 0.4, 0.2, 0.06), dark, 0, -0.18, 0, p);
      r.legs.push(p);
    }
    r.gem = healerGem(root, 1.75);
    r.height = 1.4;
  } else if (id === 'bunny') {
    const body = (r.body = group(root, 0, 0.45, 0));
    const white = std(0xfbf7f2, { rough: 0.85 });
    const pink = std(0xffa9c4, { rough: 0.7 });
    mesh(rbox(0.72, 0.62, 0.82, 0.26), white, 0, 0, 0, body);
    const head = (r.head = group(body, 0, 0.42, 0.34));
    mesh(rbox(0.64, 0.58, 0.56, 0.22), white, 0, 0, 0, head);
    mesh(rbox(0.12, 0.08, 0.06, 0.03), pink, 0, -0.06, 0.29, head);
    petEyes(head, 0.27, 0.06, 0.16);
    mesh(rbox(0.12, 0.08, 0.04, 0.03), pink, -0.24, -0.08, 0.27, head, false);
    mesh(rbox(0.12, 0.08, 0.04, 0.03), pink, 0.24, -0.08, 0.27, head, false);
    r.ears = [];
    for (const x of [-0.14, 0.14]) {
      const ep = group(head, x, 0.26, -0.04);
      mesh(rbox(0.15, 0.6, 0.1, 0.06), white, 0, 0.28, 0, ep);
      mesh(rbox(0.08, 0.44, 0.04, 0.03), pink, 0, 0.28, 0.04, ep, false);
      ep.rotation.z = x < 0 ? 0.12 : -0.12;
      r.ears.push(ep);
    }
    mesh(cached('bunTail', () => new THREE.SphereGeometry(0.17, 10, 8)), white, 0, 0.02, -0.44, body);
    for (const [x, z] of [[-0.2, 0.28], [0.2, 0.28], [-0.22, -0.26], [0.22, -0.26]]) {
      const p = group(body, x, -0.24, z);
      mesh(rbox(0.2, 0.2, 0.28, 0.08), white, 0, -0.08, 0.04, p);
      r.legs.push(p);
    }
    r.gem = healerGem(root, 1.95);
    r.height = 1.6;
  } else {
    const body = (r.body = group(root, 0, 0.34, 0));
    const skin = std(0x86d06a, { rough: 0.7 });
    const shell = std(0x8a6a3a, { rough: 0.6 });
    const plate = std(0xb48b4c, { rough: 0.55 });
    mesh(rbox(0.82, 0.3, 1.0, 0.12), skin, 0, -0.02, 0, body);
    mesh(rbox(1.02, 0.5, 1.12, 0.24), shell, 0, 0.26, -0.02, body);
    mesh(rbox(0.38, 0.1, 0.38, 0.05), plate, 0, 0.53, 0.0, body);
    mesh(rbox(0.3, 0.1, 0.3, 0.05), plate, -0.3, 0.48, -0.25, body);
    mesh(rbox(0.3, 0.1, 0.3, 0.05), plate, 0.3, 0.48, -0.25, body);
    mesh(rbox(0.3, 0.1, 0.3, 0.05), plate, -0.3, 0.48, 0.25, body);
    mesh(rbox(0.3, 0.1, 0.3, 0.05), plate, 0.3, 0.48, 0.25, body);
    const head = (r.head = group(body, 0, 0.16, 0.66));
    mesh(rbox(0.46, 0.42, 0.46, 0.17), skin, 0, 0, 0, head);
    petEyes(head, 0.22, 0.06, 0.12, 0.85);
    for (const [x, z] of [[-0.36, 0.34], [0.36, 0.34], [-0.36, -0.34], [0.36, -0.34]]) {
      const p = group(body, x, -0.1, z);
      mesh(rbox(0.24, 0.26, 0.26, 0.08), skin, 0, -0.1, 0, p);
      r.legs.push(p);
    }
    r.gem = healerGem(root, 1.45);
    r.height = 1.2;
  }
  return r;
}

// ---------- monsters ----------
export function makeSlime() {
  const root = new THREE.Group();
  const body = group(root);
  const jelly = std(0x63d95a, { rough: 0.12, opacity: 0.82, emissive: 0x1b5a14, ei: 0.4 });
  const core = std(0x2f8f2c, { rough: 0.5 });
  const eye = std(0x14201a, { rough: 0.3 });
  mesh(rbox(1.35, 1.15, 1.35, 0.34, 3), jelly, 0, 0.575, 0, body);
  mesh(rbox(0.55, 0.45, 0.55, 0.14), core, 0, 0.5, -0.1, body, false);
  mesh(rbox(0.17, 0.27, 0.06, 0.05), eye, -0.25, 0.72, 0.67, body, false);
  mesh(rbox(0.17, 0.27, 0.06, 0.05), eye, 0.25, 0.72, 0.67, body, false);
  mesh(rbox(0.32, 0.07, 0.05, 0.02), eye, 0, 0.46, 0.675, body, false);
  return { root, body, kind: 'slime', height: 1.3, radius: 0.75 };
}

export function makeWolf() {
  const root = new THREE.Group();
  const body = group(root, 0, 0.95, 0);
  const fur = std(0xe3edf7, { rough: 0.85 });
  const back = std(0x8fb0cc, { rough: 0.85 });
  const dark = std(0x2a3442, { rough: 0.6 });
  const eyeM = glowMat(0x9ff3ff, 3);
  mesh(rbox(0.82, 0.72, 1.55, 0.2), fur, 0, 0, 0, body);
  mesh(rbox(0.7, 0.2, 1.3, 0.08), back, 0, 0.36, -0.05, body);
  mesh(rbox(0.92, 0.86, 0.5, 0.22), fur, 0, 0.06, 0.62, body);
  const head = group(body, 0, 0.44, 0.98);
  mesh(rbox(0.66, 0.6, 0.6, 0.16), fur, 0, 0, 0, head);
  mesh(rbox(0.36, 0.28, 0.42, 0.1), fur, 0, -0.12, 0.42, head);
  mesh(rbox(0.14, 0.1, 0.08, 0.03), dark, 0, -0.03, 0.64, head);
  mesh(rbox(0.13, 0.08, 0.04, 0.02), eyeM, -0.17, 0.08, 0.3, head, false);
  mesh(rbox(0.13, 0.08, 0.04, 0.02), eyeM, 0.17, 0.08, 0.3, head, false);
  const ear = cached('wolfEar', () => new THREE.ConeGeometry(0.13, 0.32, 4));
  for (const x of [-0.2, 0.2]) {
    const e = mesh(ear, back, x, 0.4, -0.06, head);
    e.rotation.y = Math.PI / 4;
  }
  const legs = [];
  for (const [x, z] of [[-0.27, 0.55], [0.27, 0.55], [-0.27, -0.55], [0.27, -0.55]]) {
    const p = group(body, x, -0.2, z);
    mesh(rbox(0.22, 0.75, 0.24, 0.07), fur, 0, -0.38, 0, p);
    mesh(rbox(0.25, 0.12, 0.3, 0.04), back, 0, -0.71, 0.03, p);
    legs.push(p);
  }
  const tail = group(body, 0, 0.22, -0.78);
  mesh(rbox(0.26, 0.26, 0.75, 0.1), back, 0, 0, -0.35, tail);
  tail.rotation.x = 0.5;
  return { root, body, head, legs, tail, kind: 'wolf', height: 1.9, radius: 0.85 };
}

export function makeImp() {
  const root = new THREE.Group();
  const body = group(root);
  const red = std(0xd9412b, { rough: 0.6 });
  const belly = std(0xf07a4a, { rough: 0.7 });
  const horn = std(0xf1e3c8, { rough: 0.5 });
  const eyeM = glowMat(0xffe45c, 3);
  const wingM = std(0x7a1c14, { rough: 0.7, side: THREE.DoubleSide });
  const hipL = group(body, -0.17, 0.6, 0);
  const hipR = group(body, 0.17, 0.6, 0);
  for (const h of [hipL, hipR]) mesh(rbox(0.24, 0.55, 0.26, 0.07), red, 0, -0.28, 0, h);
  mesh(rbox(0.66, 0.62, 0.42, 0.12), red, 0, 0.92, 0, body);
  mesh(rbox(0.44, 0.4, 0.06, 0.08), belly, 0, 0.88, 0.21, body, false);
  const neck = group(body, 0, 1.22, 0);
  mesh(rbox(0.72, 0.62, 0.62, 0.18), red, 0, 0.3, 0, neck);
  const hornG = cached('impHorn', () => new THREE.ConeGeometry(0.08, 0.34, 6));
  const h1 = mesh(hornG, horn, -0.24, 0.72, 0, neck); h1.rotation.z = 0.45;
  const h2 = mesh(hornG, horn, 0.24, 0.72, 0, neck); h2.rotation.z = -0.45;
  mesh(rbox(0.16, 0.08, 0.04, 0.02), eyeM, -0.16, 0.36, 0.31, neck, false);
  mesh(rbox(0.16, 0.08, 0.04, 0.02), eyeM, 0.16, 0.36, 0.31, neck, false);
  mesh(rbox(0.3, 0.06, 0.04, 0.02), std(0x2a0a08), 0, 0.16, 0.31, neck, false);
  const shL = group(body, -0.44, 1.14, 0);
  const shR = group(body, 0.44, 1.14, 0);
  for (const s of [shL, shR]) mesh(rbox(0.2, 0.55, 0.22, 0.07), red, 0, -0.25, 0, s);
  const handR = group(shR, 0, -0.58, 0.05);
  const fireball = mesh(cached('fbGeo', () => new THREE.IcosahedronGeometry(0.24, 1)), glowMat(0xff7a2a, 3), 0, -0.1, 0, handR, false);
  fireball.visible = false;
  const wingG = cached('impWing', () => {
    const s = new THREE.Shape();
    s.moveTo(0, 0); s.lineTo(-0.9, 0.45); s.lineTo(-0.75, 0.05); s.lineTo(-0.85, -0.2); s.lineTo(-0.45, -0.1); s.lineTo(0, -0.25);
    s.closePath();
    return new THREE.ShapeGeometry(s);
  });
  const wingL = group(body, -0.12, 1.05, -0.22);
  mesh(wingG, wingM, 0, 0, 0, wingL);
  const wingR = group(body, 0.12, 1.05, -0.22);
  const wr = mesh(wingG, wingM, 0, 0, 0, wingR);
  wr.scale.x = -1;
  const tail = group(body, 0, 0.7, -0.2);
  mesh(rbox(0.08, 0.08, 0.6, 0.03), red, 0, 0, -0.3, tail);
  mesh(cached('impTailTip', () => new THREE.ConeGeometry(0.1, 0.2, 4).rotateX(-Math.PI / 2)), red, 0, 0, -0.65, tail);
  tail.rotation.x = -0.3;
  return { root, body, hipL, hipR, shL, shR, handR, neck, wingL, wingR, tail, fireball, kind: 'imp', height: 2.6, radius: 0.6 };
}

export function makeSkeleton() {
  const root = new THREE.Group();
  const body = group(root);
  const bone = std(0xece6d6, { rough: 0.7 });
  const bone2 = std(0xc9c1aa, { rough: 0.8 });
  const eyeM = glowMat(0xff5a3a, 3);
  const hipL = group(body, -0.2, 1.0, 0);
  const hipR = group(body, 0.2, 1.0, 0);
  for (const h of [hipL, hipR]) {
    mesh(rbox(0.2, 1.0, 0.22, 0.06), bone, 0, -0.5, 0, h);
    mesh(rbox(0.26, 0.12, 0.34, 0.04), bone2, 0, -0.95, 0.04, h);
  }
  mesh(rbox(0.6, 0.2, 0.32, 0.06), bone2, 0, 1.05, 0, body);
  mesh(rbox(0.14, 0.8, 0.14, 0.04), bone, 0, 1.45, -0.04, body);
  for (const y of [1.3, 1.5, 1.7]) mesh(rbox(0.8, 0.1, 0.42, 0.04), bone, 0, y, 0, body);
  mesh(rbox(1.0, 0.14, 0.36, 0.05), bone, 0, 1.88, 0, body);
  const shL = group(body, -0.55, 1.88, 0);
  const shR = group(body, 0.55, 1.88, 0);
  for (const s of [shL, shR]) mesh(rbox(0.18, 0.95, 0.2, 0.06), bone, 0, -0.47, 0, s);
  const handL = group(shL, 0, -0.95, 0);
  const handR = group(shR, 0, -0.95, 0);
  const neck = group(body, 0, 1.96, 0);
  mesh(rbox(0.64, 0.6, 0.62, 0.16), bone, 0, 0.34, 0, neck);
  const face = facePlane('skull', 0.58, 0.54);
  face.position.set(0, 0.32, 0.316);
  neck.add(face);
  mesh(cached('skelEye', () => new THREE.BoxGeometry(0.08, 0.08, 0.02)), eyeM, -0.15, 0.37, 0.33, neck, false);
  mesh(cached('skelEye', () => new THREE.BoxGeometry(0.08, 0.08, 0.02)), eyeM, 0.15, 0.37, 0.33, neck, false);
  const bow = makeBow('short_bow', null, 0x3a2a22);
  bow.quaternion.copy(BOW_AIM_Q);
  handL.add(bow);
  return { root, body, hipL, hipR, shL, shR, handL, handR, neck, bow, kind: 'skeleton', height: 2.6, radius: 0.6 };
}

export function makeGolem() {
  const root = new THREE.Group();
  const body = group(root);
  const stone = std(0x8d8d88, { rough: 0.95, flat: true });
  const stone2 = std(0x6e6e6b, { rough: 0.95, flat: true });
  const moss = std(0x5d9b3c, { rough: 1, flat: true });
  const glow = glowMat(0xff8a2a, 3);
  const hipL = group(body, -0.6, 1.2, 0);
  const hipR = group(body, 0.6, 1.2, 0);
  for (const h of [hipL, hipR]) mesh(rbox(0.95, 1.2, 0.95, 0.12, 1), stone2, 0, -0.6, 0, h);
  mesh(rbox(2.3, 1.7, 1.4, 0.2, 1), stone, 0, 2.1, 0, body);
  mesh(rbox(0.9, 0.22, 1.0, 0.06, 1), moss, -0.75, 2.98, 0, body);
  mesh(rbox(0.7, 0.2, 0.8, 0.06, 1), moss, 0.85, 2.96, 0.1, body);
  mesh(rbox(0.46, 0.46, 0.1, 0.04, 1), glow, 0, 2.2, 0.71, body, false);
  mesh(rbox(0.08, 0.6, 0.04, 0.02), glow, -0.6, 1.8, 0.71, body, false);
  mesh(rbox(0.5, 0.07, 0.04, 0.02), glow, 0.5, 2.6, 0.71, body, false);
  const neck = group(body, 0, 2.95, 0.25);
  mesh(rbox(0.95, 0.8, 0.9, 0.12, 1), stone, 0, 0.32, 0, neck);
  mesh(rbox(0.22, 0.1, 0.05, 0.02), glow, -0.22, 0.38, 0.46, neck, false);
  mesh(rbox(0.22, 0.1, 0.05, 0.02), glow, 0.22, 0.38, 0.46, neck, false);
  const shL = group(body, -1.45, 2.65, 0);
  const shR = group(body, 1.45, 2.65, 0);
  for (const s of [shL, shR]) {
    mesh(rbox(0.85, 1.5, 0.85, 0.12, 1), stone2, 0, -0.65, 0, s);
    mesh(rbox(1.05, 0.85, 1.05, 0.15, 1), stone, 0, -1.7, 0, s);
  }
  return { root, body, hipL, hipR, shL, shR, neck, kind: 'golem', height: 4.0, radius: 1.5 };
}

export function makeOgre() {
  const root = new THREE.Group();
  const av = makeAvatar({ skin: 0x8a5cc0, shirt: 0x4a2a1a, pants: 0x3a2a4a, shoes: 0x22182a, face: 'angry' });
  av.root.scale.setScalar(2.1);
  root.add(av.root);
  const horn = std(0xeadfc6, { rough: 0.5 });
  const hg = cached('ogreHorn', () => new THREE.ConeGeometry(0.1, 0.45, 6));
  const h1 = mesh(hg, horn, -0.3, 0.8, 0, av.neck); h1.rotation.z = 0.6;
  const h2 = mesh(hg, horn, 0.3, 0.8, 0, av.neck); h2.rotation.z = -0.6;
  const spike = std(0x2a2030, { metal: 0.6, rough: 0.4 });
  for (const sh of [av.shL, av.shR]) {
    mesh(rbox(0.62, 0.22, 0.62, 0.06), spike, 0, 0.08, 0, sh);
    mesh(cached('ogreSpike', () => new THREE.ConeGeometry(0.1, 0.3, 5)), spike, 0, 0.3, 0, sh);
  }
  const eyeGlow = glowMat(0xff4ad8, 3);
  mesh(rbox(0.1, 0.06, 0.02, 0.01), eyeGlow, -0.097, 0.338, 0.362, av.neck, false);
  mesh(rbox(0.1, 0.06, 0.02, 0.01), eyeGlow, 0.097, 0.338, 0.362, av.neck, false);
  const club = group(av.handR, 0, 0, 0);
  club.rotation.x = Math.PI / 2;
  const wood = std(0x5c3a22, { rough: 0.85 });
  mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.9, 8), wood, 0, 0.2, 0, club);
  mesh(rbox(0.42, 0.7, 0.42, 0.12), wood, 0, 0.85, 0, club);
  for (const [x, z] of [[0.22, 0], [-0.22, 0], [0, 0.22], [0, -0.22]]) {
    const s = mesh(cached('ogreClubSpike', () => new THREE.ConeGeometry(0.06, 0.18, 4)), spike, x, 0.9, z, club);
    s.rotation.z = x > 0 ? -Math.PI / 2 : x < 0 ? Math.PI / 2 : 0;
    s.rotation.x = z > 0 ? Math.PI / 2 : z < 0 ? -Math.PI / 2 : 0;
  }
  return { root, body: av.body, hipL: av.hipL, hipR: av.hipR, shL: av.shL, shR: av.shR, neck: av.neck, av, kind: 'ogre', height: 6.0, radius: 1.5 };
}

export function makeMonster(type) {
  switch (type) {
    case 'slime': return makeSlime();
    case 'wolf': return makeWolf();
    case 'imp': return makeImp();
    case 'skeleton': return makeSkeleton();
    case 'golem': return makeGolem();
    case 'titan': return makeTitan();
    case 'dragon': return makeDragon();
    default: return makeOgre();
  }
}

// ---------- loot ----------
export const coinGeo = () => cached('coinGeo', () => new THREE.CylinderGeometry(0.32, 0.32, 0.09, 18).rotateX(Math.PI / 2));
export const coinMat = () =>
  cached('coinMat', () => {
    const m = std(0xffc83a, { metal: 0.85, rough: 0.25, emissive: 0xc88400, ei: 0.55 });
    m.userData.shared = true;
    return m;
  });

export function makeChest() {
  const root = new THREE.Group();
  const wood = std(0x9a5f2e, { rough: 0.8 });
  const gold = std(0xffcf4a, { metal: 0.9, rough: 0.3, emissive: 0x553a00, ei: 0.5 });
  mesh(rbox(1.6, 0.9, 1.0, 0.06), wood, 0, 0.45, 0, root);
  mesh(rbox(1.64, 0.12, 1.04, 0.04), gold, 0, 0.06, 0, root);
  mesh(rbox(1.64, 0.12, 1.04, 0.04), gold, 0, 0.86, 0, root);
  mesh(rbox(0.12, 0.92, 1.04, 0.03), gold, -0.55, 0.45, 0, root);
  mesh(rbox(0.12, 0.92, 1.04, 0.03), gold, 0.55, 0.45, 0, root);
  const lid = group(root, 0, 0.9, -0.5);
  mesh(rbox(1.6, 0.4, 1.0, 0.14), wood, 0, 0.18, 0.5, lid);
  mesh(rbox(0.12, 0.42, 1.04, 0.03), gold, -0.55, 0.18, 0.5, lid);
  mesh(rbox(0.12, 0.42, 1.04, 0.03), gold, 0.55, 0.18, 0.5, lid);
  mesh(rbox(0.24, 0.3, 0.1, 0.04), gold, 0, 0.02, 1.02, lid);
  return { root, lid };
}

let gradTex = null;
function beamTexture() {
  if (gradTex) return gradTex;
  const c = document.createElement('canvas');
  c.width = 4; c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, 128);
  grd.addColorStop(0, 'rgba(255,255,255,0)');
  grd.addColorStop(0.7, 'rgba(255,255,255,0.45)');
  grd.addColorStop(1, 'rgba(255,255,255,1)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 4, 128);
  gradTex = new THREE.CanvasTexture(c);
  return gradTex;
}
export function makeBeam(hex, height = 7) {
  const m = new THREE.MeshBasicMaterial({
    color: new THREE.Color(hex).multiplyScalar(1.6),
    map: beamTexture(),
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const b = new THREE.Mesh(cached('beamGeo' + height, () => new THREE.CylinderGeometry(0.32, 0.5, height, 14, 1, true).translate(0, height / 2, 0)), m);
  return b;
}

// ---------- icon rendering (hotbar + shop thumbnails) ----------
let iconR = null, iconScene = null, iconCam = null;
const iconCache = new Map();
export function getIcon(key, build, view = 'diag') {
  if (iconCache.has(key)) return iconCache.get(key);
  try {
    if (!iconR) {
      iconR = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
      iconR.setPixelRatio(1);
      iconR.setSize(128, 128);
      iconR.toneMapping = THREE.ACESFilmicToneMapping;
      iconR.toneMappingExposure = 1.1;
      iconScene = new THREE.Scene();
      iconScene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 2.2));
      const dl = new THREE.DirectionalLight(0xffffff, 2.4);
      dl.position.set(2, 4, 5);
      iconScene.add(dl);
      iconCam = new THREE.PerspectiveCamera(28, 1, 0.05, 100);
    }
    const obj = build();
    const holder = new THREE.Group();
    holder.add(obj);
    if (view === 'diag') obj.rotation.z = -Math.PI / 4;
    iconScene.add(holder);
    holder.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(holder);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const r = Math.max(size.x, size.y, size.z) * 0.62;
    const dir = view === 'front' ? new THREE.Vector3(0.55, 0.35, 1).normalize() : new THREE.Vector3(0.15, 0.1, 1).normalize();
    iconCam.position.copy(center).addScaledVector(dir, r / Math.tan((14 * Math.PI) / 180));
    iconCam.lookAt(center);
    iconR.setClearColor(0x000000, 0);
    iconR.render(iconScene, iconCam);
    const url = iconR.domElement.toDataURL('image/png');
    iconScene.remove(holder);
    iconCache.set(key, url);
    return url;
  } catch (e) {
    iconCache.set(key, '');
    return '';
  }
}
export function itemIcon(item) {
  const key = `${item.type}:${item.id}:${item.element || ''}`;
  if (item.type === 'armor') return getIcon(key, () => makeArmorModel(item.id), 'front');
  return getIcon(key, () => makeItemModel(item), 'diag');
}
