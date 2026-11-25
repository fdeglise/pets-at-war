// Procedural models added for the quest line: the Elder, Sky Wings, phoenix feathers,
// the Frost Titan and Ignis the Dragon.
import * as THREE from 'three';
import { makeAvatar, std, rbox, mesh, group, glowMat, cached } from './models.js';

// ---------- the Elder (quest giver on the Haven plaza) ----------
export function makeElder() {
  const av = makeAvatar({ shirt: 0x2f5a9a, pants: 0x24406e, skin: 0xf0c8a0, shoes: 0x3a2a1a });
  const robe = std(0x2a4f8c, { rough: 0.75 });
  const white = std(0xf4f1ea, { rough: 0.85 });
  const gold = std(0xffc94a, { metal: 0.6, rough: 0.3 });
  mesh(rbox(1.16, 1.05, 0.7, 0.12), robe, 0, 0.55, 0, av.body);
  mesh(rbox(1.18, 0.1, 0.72, 0.03), gold, 0, 1.07, 0, av.body);
  mesh(rbox(0.56, 0.4, 0.14, 0.06), white, 0, 0.12, 0.37, av.neck);
  mesh(rbox(0.34, 0.3, 0.12, 0.05), white, 0, -0.18, 0.36, av.neck);
  mesh(rbox(0.76, 0.42, 0.22, 0.06), white, 0, 0.44, -0.29, av.neck);
  for (const x of [-0.37, 0.37]) mesh(rbox(0.06, 0.3, 0.5, 0.02), white, x, 0.42, -0.02, av.neck);
  // pointed hat
  mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.07, 20), robe, 0, 0.7, 0, av.neck);
  const hat = mesh(new THREE.ConeGeometry(0.42, 1.15, 10), robe, 0, 1.28, -0.04, av.neck);
  hat.rotation.x = -0.12;
  mesh(new THREE.CylinderGeometry(0.43, 0.43, 0.1, 16), gold, 0, 0.8, 0, av.neck);
  // staff with a glowing orb
  av.shR.rotation.x = -0.3;
  const staff = group(av.handR, 0, 0, 0.05);
  staff.rotation.x = 0.3;
  mesh(new THREE.CylinderGeometry(0.06, 0.07, 3.0, 8), std(0x6b4423, { rough: 0.8 }), 0, 0.45, 0, staff);
  mesh(rbox(0.3, 0.12, 0.3, 0.04), gold, 0, 1.95, 0, staff);
  const orb = mesh(new THREE.IcosahedronGeometry(0.22, 1), glowMat(0x5effa8, 2.4), 0, 2.2, 0, staff, false);
  return { root: av.root, rig: av, orb };
}

// ---------- Sky Wings for the pet ----------
// side: 1 = right, -1 = left. The pivot sits on the pet's back; animate pivot.rotation.
export function makeWing(side) {
  const pivot = new THREE.Group();
  const inner = group(pivot);
  const white = cached('wingWhite', () => std(0xfdfbff, { rough: 0.55 }));
  const blue = cached('wingBlue', () => std(0xbfe9ff, { rough: 0.5 }));
  const gold = cached('wingGold', () => std(0xffcf5a, { metal: 0.55, rough: 0.3 }));
  const tip = cached('wingTip', () => glowMat(0x8fe8ff, 2.4));
  mesh(rbox(1.15, 0.13, 0.2, 0.05), gold, side * 0.55, 0.04, 0.1, inner);
  for (let i = 0; i < 6; i++) {
    const len = 1.05 - i * 0.09;
    const f = group(inner, side * (0.12 + i * 0.2), 0, 0.1);
    f.rotation.y = side * (0.12 + i * 0.13);
    mesh(rbox(0.22, 0.06, len, 0.03), i % 2 ? blue : white, 0, 0, -len * 0.5, f);
    mesh(rbox(0.16, 0.07, 0.16, 0.03), tip, 0, 0, -len + 0.02, f, false);
  }
  for (let i = 0; i < 4; i++) {
    const f = group(inner, side * (0.2 + i * 0.22), 0.04, 0.12);
    f.rotation.y = side * (0.1 + i * 0.1);
    mesh(rbox(0.2, 0.07, 0.45, 0.03), white, 0, 0, -0.2, f);
  }
  return pivot;
}

// ---------- phoenix feather pickup ----------
export function makeFeather() {
  const g = new THREE.Group();
  const quill = glowMat(0xffe08a, 2.2);
  const vane = glowMat(0xff7a1a, 2.6);
  const vane2 = glowMat(0xff3a10, 2.2);
  mesh(rbox(0.07, 1.5, 0.07, 0.03), quill, 0, 0, 0, g, false);
  for (let i = 0; i < 6; i++) {
    const y = -0.45 + i * 0.17;
    const w = 0.42 - Math.abs(i - 2.2) * 0.08;
    for (const s of [-1, 1]) {
      const v = mesh(rbox(w, 0.13, 0.04, 0.02), i > 3 ? vane2 : vane, s * w * 0.5, y, 0, g, false);
      v.rotation.z = s * 0.45;
    }
  }
  g.rotation.z = 0.35;
  return g;
}

// ---------- Frost Titan (boss 2) ----------
export function makeTitan() {
  const root = new THREE.Group();
  const body = group(root);
  const ice = std(0xc4ecff, { rough: 0.12, metal: 0.1, emissive: 0x2a7fc0, ei: 0.35, flat: true });
  const deep = std(0x6fa6d6, { rough: 0.3, emissive: 0x10335a, ei: 0.3, flat: true });
  const snow = std(0xf4f8ff, { rough: 0.9, flat: true });
  const glow = glowMat(0x7fe8ff, 3.2);
  const spikeG = cached('titanSpike', () => new THREE.OctahedronGeometry(0.5, 0));
  const hipL = group(body, -1.0, 2.0, 0);
  const hipR = group(body, 1.0, 2.0, 0);
  for (const h of [hipL, hipR]) {
    mesh(rbox(1.45, 2.0, 1.45, 0.16, 1), deep, 0, -1.0, 0, h);
    mesh(rbox(1.65, 0.55, 1.8, 0.12, 1), ice, 0, -1.8, 0.1, h);
  }
  mesh(rbox(3.7, 2.7, 2.3, 0.25, 1), ice, 0, 3.5, 0, body);
  mesh(rbox(3.0, 1.2, 0.4, 0.1, 1), deep, 0, 3.3, 1.08, body);
  mesh(rbox(0.8, 0.8, 0.2, 0.08, 1), glow, 0, 3.5, 1.25, body, false);
  mesh(rbox(3.9, 0.5, 2.5, 0.15, 1), snow, 0, 4.9, -0.05, body);
  for (let i = 0; i < 5; i++) {
    const s = mesh(spikeG, ice, -1.4 + i * 0.7, 5.3 + (i % 2) * 0.3, -0.7, body);
    s.scale.set(0.7, 1.8 + (i % 2) * 0.7, 0.7);
    s.rotation.x = -0.35;
  }
  const neck = group(body, 0, 4.9, 0.55);
  mesh(rbox(1.5, 1.25, 1.35, 0.16, 1), ice, 0, 0.5, 0, neck);
  mesh(rbox(0.32, 0.14, 0.06, 0.03), glow, -0.35, 0.62, 0.69, neck, false);
  mesh(rbox(0.32, 0.14, 0.06, 0.03), glow, 0.35, 0.62, 0.69, neck, false);
  const icicle = cached('titanIcicle', () => new THREE.ConeGeometry(0.12, 0.6, 5));
  for (let i = 0; i < 5; i++) {
    const c = mesh(icicle, ice, -0.48 + i * 0.24, -0.1 - (i % 2) * 0.1, 0.6, neck);
    c.rotation.x = Math.PI;
  }
  const shL = group(body, -2.35, 4.4, 0);
  const shR = group(body, 2.35, 4.4, 0);
  for (const [s, side] of [[shL, -1], [shR, 1]]) {
    mesh(rbox(1.3, 2.3, 1.3, 0.16, 1), deep, 0, -1.0, 0, s);
    mesh(rbox(1.75, 1.45, 1.75, 0.2, 1), ice, 0, -2.55, 0, s);
    const sp = mesh(spikeG, ice, side * 0.3, 0.6, 0, s);
    sp.scale.set(0.9, 2.2, 0.9);
    sp.rotation.z = -side * 0.4;
    mesh(rbox(1.5, 0.45, 1.5, 0.12, 1), snow, 0, 0.2, 0, s);
  }
  const handR = group(shR, 0, -3.1, 0.2);
  const boulder = mesh(cached('titanBoulder', () => new THREE.IcosahedronGeometry(1.0, 0)), ice, 0, -0.2, 0, handR);
  boulder.visible = false;
  return { root, body, hipL, hipR, shL, shR, neck, handR, boulder, kind: 'titan', height: 6.8, radius: 2.3 };
}

// ---------- Ignis the Dragon (final boss) ----------
export function makeDragon() {
  const root = new THREE.Group();
  const body = group(root, 0, 3.6, 0);
  const scale = std(0xb3231a, { rough: 0.42, metal: 0.18 });
  const dark = std(0x3f0d0b, { rough: 0.55, metal: 0.1 });
  const belly = std(0xf2a447, { rough: 0.5, emissive: 0xff5a10, ei: 0.3 });
  const horn = std(0xf0e2c4, { rough: 0.4 });
  const mem = std(0x7a1712, { rough: 0.75, side: THREE.DoubleSide, emissive: 0x3a0804, ei: 0.4 });
  const eye = glowMat(0xffe14a, 4);
  const ember = glowMat(0xff7a2a, 3);
  const spikeG = cached('dragonSpike', () => new THREE.ConeGeometry(0.28, 0.9, 5));

  // torso
  mesh(rbox(3.0, 2.5, 5.4, 0.7, 2), scale, 0, 0, 0, body);
  mesh(rbox(3.3, 2.8, 2.2, 0.8, 2), scale, 0, 0.15, 2.0, body);
  mesh(rbox(2.2, 0.45, 5.6, 0.2), belly, 0, -1.15, 0.4, body);
  for (let i = 0; i < 6; i++) {
    const s = mesh(spikeG, dark, 0, 1.35 + (i < 3 ? 0.15 : 0), 2.6 - i * 0.95, body);
    s.rotation.x = -0.5;
  }
  // neck chain + head
  const neck = [];
  let parent = body;
  let nz = 2.8;
  for (let i = 0; i < 3; i++) {
    const n = group(parent, 0, i === 0 ? 0.6 : 0, nz);
    mesh(rbox(1.55 - i * 0.12, 1.45 - i * 0.1, 1.8, 0.45), scale, 0, 0, 0.7, n);
    mesh(rbox(1.0, 0.35, 1.6, 0.15), belly, 0, -0.65 + i * 0.04, 0.7, n);
    const sp = mesh(spikeG, dark, 0, 0.8, 0.6, n);
    sp.rotation.x = -0.6;
    neck.push(n);
    parent = n;
    nz = 1.45;
  }
  const head = group(parent, 0, 0.15, 1.6);
  mesh(rbox(1.9, 1.35, 2.0, 0.4), scale, 0, 0.1, 0.5, head);
  mesh(rbox(1.35, 0.85, 1.7, 0.3), scale, 0, -0.05, 2.0, head);
  mesh(rbox(1.0, 0.18, 0.2, 0.05), dark, 0, 0.42, 1.05, head);
  for (const x of [-0.6, 0.6]) {
    mesh(rbox(0.36, 0.18, 0.1, 0.04), eye, x, 0.4, 1.52, head, false);
    const h = mesh(cached('dragonHorn', () => new THREE.ConeGeometry(0.22, 1.7, 6)), horn, x * 0.9, 0.85, -0.2, head);
    h.rotation.x = -2.2;
    h.rotation.z = -x * 0.3;
    mesh(rbox(0.12, 0.08, 0.06, 0.02), ember, x * 0.35, 0.05, 2.86, head, false);
  }
  const jaw = group(head, 0, -0.45, 0.9);
  mesh(rbox(1.2, 0.32, 1.9, 0.12), scale, 0, -0.1, 0.95, jaw);
  const tooth = cached('dragonTooth', () => new THREE.ConeGeometry(0.06, 0.24, 4));
  for (let i = 0; i < 4; i++) for (const x of [-0.45, 0.45]) {
    mesh(tooth, horn, x, 0.12, 0.4 + i * 0.42, jaw);
    const t2 = mesh(tooth, horn, x, -0.38 + 0.0, 1.2 + i * 0.42, head);
    t2.rotation.x = Math.PI;
  }
  const throat = mesh(rbox(0.8, 0.3, 1.3, 0.1), ember, 0, -0.32, 1.4, head, false);
  throat.visible = false;
  const mouth = new THREE.Object3D();
  mouth.position.set(0, -0.35, 2.9);
  head.add(mouth);

  // tail
  const tail = [];
  parent = body;
  let tz = -2.6;
  for (let i = 0; i < 7; i++) {
    const s = 1 - i * 0.12;
    const t = group(parent, 0, i === 0 ? 0.1 : 0, tz);
    mesh(rbox(1.7 * s, 1.5 * s, 1.7, 0.35 * s), scale, 0, 0, -0.75, t);
    const sp = mesh(spikeG, dark, 0, 0.85 * s, -0.6, t);
    sp.rotation.x = -0.7;
    sp.scale.setScalar(s);
    tail.push(t);
    parent = t;
    tz = -1.45;
  }
  const spade = mesh(cached('dragonSpade', () => new THREE.OctahedronGeometry(0.8, 0)), dark, 0, 0, -1.8, parent);
  spade.scale.set(1.2, 0.25, 1.0);

  // wings
  const wingShape = cached('dragonWingGeo', () => {
    const s = new THREE.Shape();
    s.moveTo(0, -0.8);
    s.lineTo(3.2, -0.6);
    s.lineTo(6.4, -0.4);
    s.lineTo(9.2, 0.4);
    s.lineTo(7.6, 2.4);
    s.lineTo(6.6, 4.6);
    s.lineTo(5.0, 3.3);
    s.lineTo(3.6, 5.2);
    s.lineTo(2.3, 3.8);
    s.lineTo(0.8, 4.4);
    s.lineTo(0, 2.8);
    s.closePath();
    return new THREE.ShapeGeometry(s).rotateX(-Math.PI / 2);
  });
  const bone = cached('dragonWingBone', () => new THREE.BoxGeometry(1, 0.22, 0.22));
  function wing(side) {
    const pivot = group(body, side * 1.35, 0.9, 1.4);
    const inner = group(pivot);
    inner.scale.x = side;
    mesh(wingShape, mem, 0, 0, 0, inner);
    const arm = mesh(bone, dark, 4.6, 0.06, -0.4, inner);
    arm.scale.x = 9.2;
    for (const [x, z, len, rot] of [[7.8, 1.6, 4.4, 1.05], [5.8, 2.2, 5.2, 1.35], [4.0, 2.6, 5.6, 1.55], [2.2, 2.0, 4.6, 1.75]]) {
      const f = mesh(bone, dark, x, 0.05, z, inner);
      f.scale.set(len, 0.7, 0.7);
      f.rotation.y = rot - Math.PI / 2;
    }
    const claw = mesh(spikeG, horn, 9.3, 0.1, -0.3, inner);
    claw.rotation.z = -Math.PI / 2;
    return pivot;
  }
  const wingL = wing(-1);
  const wingR = wing(1);

  // legs
  const legs = [];
  for (const [x, z, front] of [[-1.15, 1.9, true], [1.15, 1.9, true], [-1.2, -1.6, false], [1.2, -1.6, false]]) {
    const hip = group(body, x, -0.6, z);
    mesh(rbox(0.85, 1.6, 1.0, 0.3), scale, 0, -0.7, 0, hip);
    const knee = group(hip, 0, -1.4, 0);
    mesh(rbox(0.6, 1.3, 0.7, 0.2), dark, 0, -0.55, front ? 0.15 : -0.1, knee);
    for (let c = -1; c <= 1; c++) {
      const cl = mesh(spikeG, horn, c * 0.22, -1.25, 0.5, knee);
      cl.rotation.x = Math.PI / 2;
      cl.scale.set(0.6, 0.6, 0.6);
    }
    legs.push({ hip, knee, front });
  }
  root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return { root, body, neck, head, jaw, mouth, throat, tail, wingL, wingR, legs, kind: 'dragon', height: 6.2, radius: 3.4 };
}
