// The archipelago: Haven Isle (home), Frostpeak, Ember Isle and Dragon's Roost.
// Terrain, water, lava, sky, vegetation, plaza, merchant, Elder, and travel portals.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeNoise, smoothstep, lerp, mulberry32, angleDiff } from './util.js';
import { makeAvatar, std, rbox, mesh, group, glowMat } from './models.js';
import { makeElder } from './bigModels.js';
import { buildDecor } from './decor.js';

export const CELL = 2;
export const HALF = 340; // the map covers [-HALF, HALF] on both axes
export const MAP_PX = (HALF * 2) / CELL;
const PLAZA_R = 16.5;
const SEA_FLOOR = -6;
const ARENA_H = 9; // Frostpeak summit arena
const NEST_H = 7; // Dragon's Roost nest plateau

export const ISLANDS = {
  haven: { id: 'haven', name: 'Haven Isle', cx: 0, cz: 0, r: 112, biome: 'meadow', level: 1, color: '#7dffb0', sub: 'Home of the Elder and the merchant' },
  frost: { id: 'frost', name: 'Frostpeak', cx: -188, cz: -178, r: 80, biome: 'snow', level: 3, color: '#8fe8ff', sub: 'The Frost Titan sleeps at the summit' },
  ember: { id: 'ember', name: 'Ember Isle', cx: 230, cz: -122, r: 78, biome: 'volcano', level: 4, color: '#ff9a4a', sub: 'Phoenix feathers glow among the lava' },
  roost: { id: 'roost', name: "Dragon's Roost", cx: 30, cz: 252, r: 80, biome: 'roost', level: 6, color: '#ff5a5a', sub: 'Lair of Ignis the Dragon' },
};
export const ISLAND_LIST = Object.values(ISLANDS);
// Which island a point belongs to (null over open sea).
export function islandAt(x, z, margin = 24) {
  for (const I of ISLAND_LIST) if (Math.hypot(x - I.cx, z - I.cz) < I.r + margin) return I.id;
  return null;
}
export function nearestIsland(x, z) {
  let best = ISLAND_LIST[0], bd = 1e9;
  for (const I of ISLAND_LIST) {
    const d = Math.hypot(x - I.cx, z - I.cz) - I.r;
    if (d < bd) { bd = d; best = I; }
  }
  return best;
}

// Per-location sky, fog and light moods (blended when you travel).
// cloud/cover: colour and amount of the painted clouds; mtn: tint of the far mountain ranges.
const ATMOS = {
  meadow:  { fog: 0xcde8ff, top: 0x2b78e4, horizon: 0xcde8ff, bottom: 0x8fc4ea, near: 150, far: 620, sun: 0xfff0d6, sunI: 2.7, hemiSky: 0xd2ebff, hemiGround: 0x5d7a3e, hemiI: 0.75, cloud: 0xffffff, cover: 0.42, mtn: 0x5f86b8 },
  snow:    { fog: 0xc3d6ec, top: 0x3f78cc, horizon: 0xd4e4f4, bottom: 0x9cbce0, near: 150, far: 580, sun: 0xf4f0ff, sunI: 2.25, hemiSky: 0xd8e8ff, hemiGround: 0x6a82a0, hemiI: 0.6, cloud: 0xf2f6ff, cover: 0.55, mtn: 0x7f9cc4 },
  volcano: { fog: 0xd8a07c, top: 0x5d5a8f, horizon: 0xf0b78a, bottom: 0xa06a58, near: 90, far: 470, sun: 0xffcf9a, sunI: 2.6, hemiSky: 0xffd2b0, hemiGround: 0x5a3a2e, hemiI: 0.7, cloud: 0xa89490, cover: 0.55, mtn: 0x6a4650 },
  roost:   { fog: 0xb98a8e, top: 0x352a5e, horizon: 0xd88b6c, bottom: 0x8a5a5a, near: 80, far: 450, sun: 0xffb27a, sunI: 2.5, hemiSky: 0xffc2a8, hemiGround: 0x4a2a2a, hemiI: 0.7, cloud: 0xd89a8a, cover: 0.48, mtn: 0x4a2e4c },
};

export function buildWorld(scene) {
  const rng = mulberry32(20261124);
  const R = (a = 0, b = 1) => a + rng() * (b - a);
  const { fbm } = makeNoise(4242);

  // ---------- island layout ----------
  for (const I of ISLAND_LIST) {
    const l = Math.hypot(I.cx, I.cz) || 1;
    I.ax = I.cx / l; // unit vector pointing away from Haven
    I.az = I.cz / l;
  }
  const FROST = ISLANDS.frost, EMBER = ISLANDS.ember, ROOST = ISLANDS.roost;
  const lake = { x: FROST.cx + 26, z: FROST.cz + 30, r: 13 };
  const volcano = { x: EMBER.cx + EMBER.ax * 10, z: EMBER.cz + EMBER.az * 10 };
  const crater = { x: volcano.x, z: volcano.z, r: 8.5, y: 16.4 };
  const lavaPools = [];
  const nest = new THREE.Vector3(ROOST.cx, NEST_H, ROOST.cz);
  const arena = new THREE.Vector3(FROST.cx, ARENA_H, FROST.cz);

  function edge(I, lx, lz, h, seed) {
    const d = Math.hypot(lx, lz);
    const ang = Math.atan2(lz, lx);
    const rEdge = I.r + (fbm(Math.cos(ang) * 1.6 + seed, Math.sin(ang) * 1.6 + seed, 3) - 0.5) * (I.id === 'haven' ? 26 : 20);
    return lerp(h, SEA_FLOOR, smoothstep(rEdge - 20, rEdge + 4, d));
  }

  function havenH(x, z) {
    const d = Math.hypot(x, z);
    let h = 2.2 + (fbm(x * 0.022 + 3.1, z * 0.022 - 7.3, 4) - 0.5) * 7;
    const hills = fbm(x * 0.009 + 11.7, z * 0.009 + 5.2, 3);
    h += Math.pow(Math.max(0, hills - 0.48) * 2.4, 1.5) * 18;
    h = edge(ISLANDS.haven, x, z, h, 9);
    return lerp(2.0, h, smoothstep(PLAZA_R + 1, 30, d));
  }
  function frostH(x, z) {
    const I = FROST, lx = x - I.cx, lz = z - I.cz;
    const d = Math.hypot(lx, lz);
    let h = 2.8 + (fbm(lx * 0.03 + 21, lz * 0.03 - 4, 4) - 0.5) * 6;
    const away = (lx * I.ax + lz * I.az) / Math.max(d, 1);
    const ridge = Math.pow(Math.max(0, fbm(lx * 0.022 + 40, lz * 0.022 + 13, 4) - 0.36) * 2.1, 1.35) * 36;
    h += ridge * smoothstep(-0.1, 0.7, away) * smoothstep(22, 46, d);
    h = lerp(ARENA_H, h, smoothstep(17, 31, d));
    const ld = Math.hypot(x - lake.x, z - lake.z);
    if (ld < lake.r + 9) h = lerp(1.25, h, smoothstep(lake.r - 1, lake.r + 9, ld));
    return edge(I, lx, lz, h, 30);
  }
  function emberBase(x, z) {
    const I = EMBER, lx = x - I.cx, lz = z - I.cz;
    let h = 2.1 + (fbm(lx * 0.035 - 8, lz * 0.035 + 17, 4) - 0.5) * 5;
    const vd = Math.hypot(x - volcano.x, z - volcano.z);
    const cone = Math.max(0, 1 - vd / 50);
    h = Math.max(h, 2 + Math.pow(cone, 1.25) * 27 + (fbm(x * 0.08, z * 0.08, 2) - 0.5) * 3 * cone);
    if (vd < 13) h = lerp(crater.y - 1.2, h, smoothstep(6.5, 13, vd));
    return h;
  }
  function emberH(x, z) {
    let h = emberBase(x, z);
    for (const L of lavaPools) {
      const ld = Math.hypot(x - L.x, z - L.z);
      if (ld < L.r + 3) h = lerp(L.y - 0.9, h, smoothstep(L.r - 0.6, L.r + 3, ld));
    }
    return edge(EMBER, x - EMBER.cx, z - EMBER.cz, h, 51);
  }
  function roostH(x, z) {
    const I = ROOST, lx = x - I.cx, lz = z - I.cz;
    const d = Math.hypot(lx, lz);
    let h = 3.0 + (fbm(lx * 0.03 + 55, lz * 0.03 - 21, 4) - 0.5) * 8;
    const hills = fbm(lx * 0.014 + 3, lz * 0.014 + 9, 3);
    h += Math.pow(Math.max(0, hills - 0.5) * 2.4, 1.5) * 18;
    h = lerp(NEST_H, h, smoothstep(21, 33, d));
    h += Math.exp(-Math.pow((d - 19.5) / 2.0, 2)) * 1.6;
    return edge(I, lx, lz, h, 77);
  }
  const rawFns = { haven: havenH, frost: frostH, ember: emberH, roost: roostH };

  // Lava pools on Ember Isle (placed before the height grid is built)
  {
    const prng = mulberry32(777);
    for (let tries = 0; lavaPools.length < 4 && tries < 300; tries++) {
      const a = prng() * Math.PI * 2, dd = 26 + prng() * 30;
      const x = volcano.x + Math.cos(a) * dd, z = volcano.z + Math.sin(a) * dd;
      if (Math.hypot(x - EMBER.cx, z - EMBER.cz) > EMBER.r - 22) continue;
      if (lavaPools.some((p) => Math.hypot(p.x - x, p.z - z) < 22)) continue;
      const r = 3.5 + prng() * 2.5;
      lavaPools.push({ x, z, r, y: emberBase(x, z) - 0.35 });
    }
  }

  function inLava(x, z, pad = 0) {
    if (Math.hypot(x - crater.x, z - crater.z) < crater.r + pad) return true;
    for (const L of lavaPools) if (Math.hypot(x - L.x, z - L.z) < L.r + pad) return true;
    return false;
  }

  // ---------- portals ----------
  // Haven has one portal per destination; every other island has one portal home.
  const PORTAL_COLORS = {
    frost: { c1: 0x0b2a6a, c2: 0x58e0ff, rim: 0xb8f4ff, rune: 0x7fe0ff },
    ember: { c1: 0x5a1004, c2: 0xff8a2a, rim: 0xffd08a, rune: 0xffa04a },
    roost: { c1: 0x3a0418, c2: 0xff3a5a, rim: 0xffa0b0, rune: 0xff4a6a },
    haven: { c1: 0x08402a, c2: 0x5effa8, rim: 0xd8ffe8, rune: 0x7dffb8 },
  };
  const portals = [];
  for (const dest of ['frost', 'ember', 'roost']) {
    const D = ISLANDS[dest];
    const a = Math.atan2(D.cz, D.cx);
    let r = 80;
    while (r > 40 && havenH(Math.cos(a) * r, Math.sin(a) * r) < 1.6) r -= 2;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    portals.push({ island: 'haven', dest, x, z, a, y: Math.max(1.6, havenH(x, z)), glow: 0, sealed: dest === 'roost', facing: Math.atan2(-x, -z) });
  }
  // Outer portals sit on the side facing Haven, on dry and fairly flat ground, well away from the centre.
  for (const id of ['frost', 'ember', 'roost']) {
    const I = ISLANDS[id];
    const f = rawFns[id];
    const base = Math.atan2(-I.az, -I.ax);
    let best = null;
    search: for (const off of [0, 0.25, -0.25, 0.5, -0.5, 0.8, -0.8, 1.1, -1.1]) {
      for (let r = I.r * 0.66; r >= I.r * 0.5; r -= 2) {
        const x = I.cx + Math.cos(base + off) * r, z = I.cz + Math.sin(base + off) * r;
        const h = f(x, z);
        if (h < 1.8) continue;
        if (id === 'ember' && inLava(x, z, 8)) continue;
        let flat = true;
        for (const [dx, dz] of [[5, 0], [-5, 0], [0, 5], [0, -5]]) if (Math.abs(f(x + dx, z + dz) - h) > 3 || f(x + dx, z + dz) < 1.2) flat = false;
        if (!flat) continue;
        best = { x, z, h };
        break search;
      }
    }
    if (!best) best = { x: I.cx - I.ax * I.r * 0.5, z: I.cz - I.az * I.r * 0.5, h: 2 };
    portals.push({ island: id, dest: 'haven', x: best.x, z: best.z, a: 0, y: Math.max(1.6, best.h), glow: 0, sealed: false, facing: Math.atan2(I.cx - best.x, I.cz - best.z) });
  }
  portals.forEach((p, i) => { p.id = i; p.colors = PORTAL_COLORS[p.dest]; });

  // The Easy-mode shelter stands in a flat clearing on Haven, between the Roost and Frostpeak paths.
  // (The clearing exists on every difficulty; the shelter itself only appears on Easy.)
  const shelterSpot = (() => {
    let best = null, bs = 1e9;
    for (let a = 2.2; a <= 3.4; a += 0.04) {
      for (let r = 27; r <= 44; r += 1.5) {
        const x = Math.cos(a) * r, z = Math.sin(a) * r;
        if (pathDist(x, z) < 14) continue;
        const h = havenH(x, z);
        if (h < 2.0 || h > 7) continue;
        let sc = r * 0.05;
        for (let k = 0; k < 12; k++) {
          const q = (k / 12) * Math.PI * 2;
          sc += Math.abs(havenH(x + Math.cos(q) * 10, z + Math.sin(q) * 10) - h);
        }
        if (sc < bs) { bs = sc; best = { x, z, a, y: h }; }
      }
    }
    return best || { x: -30, z: 14, a: Math.atan2(14, -30), y: Math.max(2.2, havenH(-30, 14)) };
  })();

  function height(I, x, z) {
    let h = rawFns[I.id](x, z);
    for (const p of portals) {
      if (p.island !== I.id) continue;
      const d = Math.hypot(x - p.x, z - p.z);
      if (d < 11) h = lerp(p.y, h, smoothstep(5, 11, d));
    }
    if (I.id === 'haven') {
      const sd = Math.hypot(x - shelterSpot.x, z - shelterSpot.z);
      if (sd < 21) h = lerp(shelterSpot.y, h, smoothstep(10.5, 21, sd));
    }
    return h;
  }

  // ---------- height patches (one grid per island) ----------
  const patches = ISLAND_LIST.map((I) => {
    const ext = I.r + 24;
    const x0 = Math.floor((I.cx - ext) / CELL) * CELL, z0 = Math.floor((I.cz - ext) / CELL) * CELL;
    const n = Math.ceil((ext * 2) / CELL);
    const S = n + 1;
    const grid = new Float32Array(S * S);
    for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) grid[j * S + i] = height(I, x0 + i * CELL, z0 + j * CELL);
    return { I, x0, z0, n, S, grid };
  });
  function patchHeight(P, x, z) {
    const gx = (x - P.x0) / CELL, gz = (z - P.z0) / CELL;
    if (gx < 0 || gz < 0 || gx >= P.n || gz >= P.n) return null;
    const i = Math.floor(gx), j = Math.floor(gz);
    const fx = gx - i, fz = gz - j;
    const g = P.grid, S = P.S;
    const h00 = g[j * S + i], h10 = g[j * S + i + 1], h01 = g[(j + 1) * S + i], h11 = g[(j + 1) * S + i + 1];
    if (fx >= fz) return h00 + (h10 - h00) * fx + (h11 - h10) * fz;
    return h00 + (h11 - h01) * fx + (h01 - h00) * fz;
  }
  // Triangle-exact height of the rendered terrain.
  function terrainHeight(x, z) {
    let best = SEA_FLOOR;
    for (const P of patches) {
      const h = patchHeight(P, x, z);
      if (h !== null && h > best) best = h;
    }
    return best;
  }
  // Walkable ground: the terrain plus wooden decks (the pier).
  const decks = [];
  function getHeight(x, z) {
    let best = terrainHeight(x, z);
    for (const d of decks) {
      if (d.y <= best) continue;
      const al = x * d.ca + z * d.sa - d.r0;
      if (al < 0 || al > d.len) continue;
      if (Math.abs(-x * d.sa + z * d.ca) <= d.w / 2) best = d.y;
    }
    return best;
  }

  // dirt paths from the plaza to each Haven portal
  function pathDist(x, z) {
    let best = 1e9;
    for (const p of portals) {
      if (p.island !== 'haven') continue;
      const ax = Math.cos(p.a) * PLAZA_R, az = Math.sin(p.a) * PLAZA_R;
      const vx = p.x - ax, vz = p.z - az;
      const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz)));
      const d = Math.hypot(x - (ax + vx * t), z - (az + vz * t));
      if (d < best) best = d;
    }
    return best;
  }

  // ---------- terrain colours ----------
  const C = (hex) => new THREE.Color(hex);
  const pal = {
    sand: C(0xead8a2), sandWet: C(0xc8b07a), under: C(0x9c8a5e),
    g1: C(0x5fbf46), g2: C(0x4aa63c), g3: C(0x86d256), dry: C(0xb5cf55),
    rock: C(0x8f949b), rock2: C(0x777c84), dirt: C(0xbf9260), dirt2: C(0xa87d4e),
    tile1: C(0xdcd3c1), tile2: C(0xc4b9a4), border: C(0x9a8f7c), moss: C(0x8fa86a),
    snow: C(0xe6edf5), snow2: C(0xd3deea), snowShade: C(0xb3c5da), gravel: C(0xcfc8b8), frostRock: C(0x7d8794), frostRock2: C(0x6a7380),
    ice1: C(0xcfe6f5), ice2: C(0xb2d2ea), iceBorder: C(0x8aa6c4), iceLake: C(0xbfe6f5),
    basalt: C(0x423b3b), basalt2: C(0x332d2e), ash: C(0x6c625b), ash2: C(0x5b524d), blackSand: C(0x45403d), scorch: C(0x7a3418), scorch2: C(0x93451f), scrub: C(0x5f5c3a), redStreak: C(0x7c3a28),
    redRock: C(0x9a5038), redRock2: C(0x7a3a2a), darkRock: C(0x4f3430), straw: C(0xc2a878), straw2: C(0xa88a58), dryGrass: C(0x8f7f3e), roostShore: C(0xb09070),
    portalStone: C(0x5b4a6e),
  };
  const tmpC = new THREE.Color();
  function faceColor(I, cx, cz, h, ny) {
    const j = (rng() - 0.5) * 0.06;
    if (h < -0.4) return tmpC.copy(I.biome === 'volcano' ? pal.basalt2 : pal.under).lerp(I.biome === 'volcano' ? pal.blackSand : pal.sandWet, Math.max(0, 1 + h / 6)).offsetHSL(0, 0, j);
    for (const p of portals) {
      if (p.island === I.id && Math.hypot(cx - p.x, cz - p.z) < 6.5) return tmpC.copy(pal.rock2).lerp(pal.portalStone, 0.35).offsetHSL(0, 0, j);
    }
    const lx = cx - I.cx, lz = cz - I.cz, d = Math.hypot(lx, lz);
    const n = fbm(cx * 0.045 + 50, cz * 0.045 + 50, 3);
    if (I.biome === 'meadow') {
      if (d < PLAZA_R) {
        const ti = Math.floor((cx + 200) / 2), tj = Math.floor((cz + 200) / 2);
        const hsh = ((ti * 73856093) ^ (tj * 19349663)) >>> 0;
        tmpC.copy((ti + tj) & 1 ? pal.tile1 : pal.tile2).offsetHSL(0, 0, ((hsh % 100) / 100 - 0.5) * 0.05);
        if (d > PLAZA_R - 3 && hsh % 7 === 0) tmpC.lerp(pal.moss, 0.45);
        return tmpC;
      }
      if (d < PLAZA_R + 1.6) return tmpC.copy(pal.border).offsetHSL(0, 0, j);
      if (h < 0.85) return tmpC.copy(h < 0.25 ? pal.sandWet : pal.sand).offsetHSL(0, 0, j);
      if (ny < 0.8) return tmpC.copy(rng() < 0.5 ? pal.rock : pal.rock2).offsetHSL(0, 0, j);
      if (pathDist(cx, cz) < 1.9 + fbm(cx * 0.2, cz * 0.2, 2) * 1.2) return tmpC.copy(rng() < 0.5 ? pal.dirt : pal.dirt2).offsetHSL(0, 0, j * 0.5);
      tmpC.copy(pal.g2).lerp(pal.g1, smoothstep(0.35, 0.55, n)).lerp(pal.g3, smoothstep(0.6, 0.75, n));
      const n2 = fbm(cx * 0.03 - 20, cz * 0.03 + 70, 2);
      if (n2 > 0.62) tmpC.lerp(pal.dry, smoothstep(0.62, 0.75, n2) * 0.8);
      if (h > 12) tmpC.lerp(pal.rock, smoothstep(12, 20, h) * 0.6);
      return tmpC.offsetHSL(0, 0, j);
    }
    if (I.biome === 'snow') {
      if (d < 16) {
        const ti = Math.floor((cx + 400) / 2), tj = Math.floor((cz + 400) / 2);
        return tmpC.copy((ti + tj) & 1 ? pal.ice1 : pal.ice2).offsetHSL(0, 0, j * 0.5);
      }
      if (d < 17.6) return tmpC.copy(pal.iceBorder).offsetHSL(0, 0, j);
      if (Math.hypot(cx - lake.x, cz - lake.z) < lake.r) return tmpC.copy(pal.iceLake).offsetHSL(0, 0, j * 0.3);
      if (h < 0.9) return tmpC.copy(pal.gravel).offsetHSL(0, 0, j);
      if (ny < 0.7) return tmpC.copy(rng() < 0.5 ? pal.frostRock : pal.frostRock2).offsetHSL(0, 0, j);
      tmpC.copy(pal.snow2).lerp(pal.snow, smoothstep(0.4, 0.6, n));
      if (ny < 0.88) tmpC.lerp(pal.snowShade, 0.6);
      return tmpC.offsetHSL(0, 0, j * 0.6);
    }
    if (I.biome === 'volcano') {
      const nearLava = (() => {
        let m = Math.hypot(cx - crater.x, cz - crater.z) - crater.r;
        for (const L of lavaPools) m = Math.min(m, Math.hypot(cx - L.x, cz - L.z) - L.r);
        return m;
      })();
      if (nearLava < 2.5) return tmpC.copy(rng() < 0.5 ? pal.scorch : pal.scorch2).offsetHSL(0, 0, j);
      if (h < 0.9) return tmpC.copy(pal.blackSand).offsetHSL(0, 0, j);
      if (ny < 0.72) return tmpC.copy(rng() < 0.5 ? pal.basalt : pal.basalt2).offsetHSL(0, 0, j);
      const vd = Math.hypot(cx - volcano.x, cz - volcano.z);
      tmpC.copy(pal.ash2).lerp(pal.ash, smoothstep(0.4, 0.6, n));
      if (vd > 40 && fbm(cx * 0.05 + 9, cz * 0.05 - 3, 2) > 0.58) tmpC.lerp(pal.scrub, 0.75);
      if (vd < 44 && fbm(cx * 0.12, cz * 0.02 + vd * 0.1, 2) > 0.62) tmpC.lerp(pal.redStreak, 0.7);
      return tmpC.offsetHSL(0, 0, j);
    }
    // roost
    if (d < 17) return tmpC.copy(rng() < 0.5 ? pal.straw : pal.straw2).offsetHSL(0, 0, j);
    if (h < 0.9) return tmpC.copy(pal.roostShore).offsetHSL(0, 0, j);
    if (ny < 0.72) return tmpC.copy(rng() < 0.5 ? pal.redRock : pal.redRock2).offsetHSL(0, 0, j);
    tmpC.copy(pal.darkRock).lerp(pal.redRock, smoothstep(0.35, 0.65, n));
    if (fbm(cx * 0.04 - 7, cz * 0.04 + 2, 2) > 0.6) tmpC.lerp(pal.dryGrass, 0.7);
    return tmpC.offsetHSL(0, 0, j);
  }

  // ---------- terrain mesh + map image ----------
  const mapCanvas = document.createElement('canvas');
  mapCanvas.width = mapCanvas.height = MAP_PX;
  const mctx = mapCanvas.getContext('2d');
  const mimg = mctx.createImageData(MAP_PX, MAP_PX);
  for (let i = 0; i < MAP_PX * MAP_PX; i++) {
    mimg.data[i * 4] = 42; mimg.data[i * 4 + 1] = 112; mimg.data[i * 4 + 2] = 176; mimg.data[i * 4 + 3] = 255;
  }
  const posArr = [], colArr = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
  function pushTri(I, ax, ay, az, bx, by, bz, cx, cy, cz, mapCell) {
    a.set(ax, ay, az); b.set(bx, by, bz); c.set(cx, cy, cz);
    const mx = (ax + bx + cx) / 3, my = (ay + by + cy) / 3, mz = (az + bz + cz) / 3;
    e1.subVectors(b, a); e2.subVectors(c, a);
    const nrm = e1.cross(e2).normalize();
    const fc = faceColor(I, mx, mz, my, nrm.y);
    // baked ambient occlusion: valleys a touch darker, ridges a touch lighter
    const around = (getHeight(mx + 4, mz) + getHeight(mx - 4, mz) + getHeight(mx, mz + 4) + getHeight(mx, mz - 4)) / 4;
    const ao = my > 0.5 ? THREE.MathUtils.clamp(1 - (around - my) * 0.045, 0.78, 1.08) : 1;
    fc.multiplyScalar(ao);
    if (ay > SEA_FLOOR + 0.05 || by > SEA_FLOOR + 0.05 || cy > SEA_FLOOR + 0.05) {
      for (const v of [a, b, c]) {
        posArr.push(v.x, v.y, v.z);
        colArr.push(fc.r, fc.g, fc.b);
      }
    }
    if (mapCell) {
      const px = Math.floor((mx + HALF) / CELL), pz = Math.floor((mz + HALF) / CELL);
      if (px >= 0 && pz >= 0 && px < MAP_PX && pz < MAP_PX) {
        const o = (pz * MAP_PX + px) * 4;
        const water = my < 0.05;
        const lava = I.biome === 'volcano' && inLava(mx, mz);
        const sr = lava ? 1 : water ? 0.09 + Math.max(0, 0.2 + my * 0.035) : fc.r;
        const sg = lava ? 0.35 : water ? 0.36 + Math.max(0, 0.16 + my * 0.035) : fc.g;
        const sb = lava ? 0.05 : water ? 0.7 : fc.b;
        mimg.data[o] = Math.pow(sr, 1 / 2.2) * 255;
        mimg.data[o + 1] = Math.pow(sg, 1 / 2.2) * 255;
        mimg.data[o + 2] = Math.pow(sb, 1 / 2.2) * 255;
      }
    }
  }
  for (const P of patches) {
    const g = P.grid, S = P.S;
    for (let j = 0; j < P.n; j++) {
      for (let i = 0; i < P.n; i++) {
        const x0 = P.x0 + i * CELL, z0 = P.z0 + j * CELL, x1 = x0 + CELL, z1 = z0 + CELL;
        const h00 = g[j * S + i], h10 = g[j * S + i + 1], h01 = g[(j + 1) * S + i], h11 = g[(j + 1) * S + i + 1];
        pushTri(P.I, x0, h00, z0, x1, h11, z1, x1, h10, z0, true);
        pushTri(P.I, x0, h00, z0, x0, h01, z1, x1, h11, z1, false);
      }
    }
  }
  mctx.putImageData(mimg, 0, 0);
  const tgeo = new THREE.BufferGeometry();
  tgeo.setAttribute('position', new THREE.Float32BufferAttribute(posArr, 3));
  tgeo.setAttribute('color', new THREE.Float32BufferAttribute(colArr, 3));
  tgeo.computeVertexNormals();
  const terrainMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.92, metalness: 0 });
  // Fine world-space grain so big flat faces don't look like plastic, rock strata on cliffs,
  // cobbled rings on Haven's plaza and the Frostpeak arena, and caustics on the sea floor.
  const terrainU = { uTime: { value: 0 }, uArena: { value: new THREE.Vector3(FROST.cx, ARENA_H, FROST.cz) } };
  terrainMat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = terrainU.uTime;
    sh.uniforms.uArena = terrainU.uArena;
    sh.vertexShader = 'varying vec3 vWPos;\n' + sh.vertexShader.replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = 'varying vec3 vWPos;\nuniform float uTime;\nuniform vec3 uArena;\n' + GLSL_NOISE + GLSL_COBBLE + sh.fragmentShader.replace(
      '#include <color_fragment>',
      `#include <color_fragment>
       float gr = vnoise(vWPos.xz * 1.7) * 0.6 + vnoise(vWPos.xz * 0.35 + 7.0) * 0.4;
       diffuseColor.rgb *= 0.9 + gr * 0.18;
       vec3 fN = normalize(cross(dFdx(vWPos), dFdy(vWPos)));
       float steep = 1.0 - smoothstep(0.5, 0.82, abs(fN.y));
       float strata = sin(vWPos.y * 2.4 + vnoise(vWPos.xz * 0.12) * 5.0);
       diffuseColor.rgb *= 1.0 - steep * 0.16 * smoothstep(0.2, 0.8, strata);
       diffuseColor.rgb *= 1.0 + steep * 0.1 * smoothstep(0.85, 1.0, strata);
       if (length(vWPos.xz) < 16.3 && abs(vWPos.y - 2.0) < 0.03) {
         diffuseColor.rgb = cobble(vWPos.xz, vec3(0.64, 0.54, 0.40), vec3(0.45, 0.37, 0.27), vec3(0.11, 0.34, 0.27), vec3(0.71, 0.45, 0.12)) * (0.94 + gr * 0.1);
       }
       vec2 ap = vWPos.xz - uArena.xz;
       if (length(ap) < 15.8 && abs(vWPos.y - uArena.y) < 0.03) {
         diffuseColor.rgb = cobble(ap, vec3(0.62, 0.78, 0.92), vec3(0.47, 0.65, 0.85), vec3(0.25, 0.58, 0.95), vec3(0.85, 0.95, 1.0)) * (0.95 + gr * 0.08);
       }
       float uw = 1.0 - smoothstep(-1.0, -0.05, vWPos.y);
       if (uw > 0.0) {
         vec2 cp = vWPos.xz * 0.42;
         float c1 = vnoise(cp + vec2(uTime * 0.31, uTime * 0.17));
         float c2 = vnoise(cp * 1.37 + vec2(-uTime * 0.23, uTime * 0.29) + 5.3);
         float ca = pow(1.0 - abs(c1 - c2), 10.0);
         float fade = 1.0 - (1.0 - smoothstep(-5.5, -0.5, vWPos.y)) * 0.75;
         diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.55, 0.82, 0.92), uw);
         diffuseColor.rgb += vec3(0.30, 0.48, 0.52) * ca * uw * fade;
       }`
    );
  };
  const terrain = new THREE.Mesh(tgeo, terrainMat);
  terrain.receiveShadow = true;
  scene.add(terrain);

  // A wooden pier on Haven's shore, away from the portal paths. It is walkable (see decks).
  const pier = (() => {
    let best = null, bs = 1e9;
    for (let a = -Math.PI; a < Math.PI; a += 0.03) {
      if (portals.some((p) => p.island === 'haven' && Math.abs(angleDiff(a, p.a)) < 0.55)) continue;
      if (Math.abs(angleDiff(a, shelterSpot.a)) < 0.45) continue;
      const ca = Math.cos(a), sa = Math.sin(a);
      let rS = 0;
      for (let r = 50; r < 150; r += 0.5) if (terrainHeight(ca * r, sa * r) < 0.2) { rS = r; break; }
      if (!rS) continue;
      let r0 = rS;
      while (r0 > rS - 12 && terrainHeight(ca * r0, sa * r0) < 1.3) r0 -= 0.5;
      if (rS - r0 > 9 || terrainHeight(ca * (rS + 13), sa * (rS + 13)) > -2.2) continue;
      let side = 0;
      for (const ac of [-1.6, 1.6]) side += Math.abs(terrainHeight(ca * r0 - sa * ac, sa * r0 + ca * ac) - 1.3);
      if (side > 1.2) continue;
      const sc = Math.abs(angleDiff(a, 0.45)) * 2 + (rS - r0) * 0.2 + side;
      if (sc < bs) { bs = sc; best = { a, r0: r0 - 0.6, len: rS - r0 + 13.5, y: 1.3, w: 2.6 }; }
    }
    if (best) decks.push({ ca: Math.cos(best.a), sa: Math.sin(best.a), r0: best.r0, len: best.len, w: best.w, y: best.y });
    return best;
  })();

  // Height texture for the water shader (depth tint + shore foam).
  const htex = (() => {
    const data = new Uint8Array(MAP_PX * MAP_PX * 4);
    for (let j = 0; j < MAP_PX; j++) {
      for (let i = 0; i < MAP_PX; i++) {
        const h = terrainHeight(-HALF + (i + 0.5) * CELL, -HALF + (j + 0.5) * CELL);
        const v = Math.round(THREE.MathUtils.clamp((h + 8) / 48, 0, 1) * 255);
        const o = (j * MAP_PX + i) * 4;
        data[o] = v; data[o + 1] = v; data[o + 2] = v; data[o + 3] = 255;
      }
    }
    const t = new THREE.DataTexture(data, MAP_PX, MAP_PX, THREE.RGBAFormat);
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearFilter;
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    t.needsUpdate = true;
    return t;
  })();

  // ---------- water ----------
  const sunDir = new THREE.Vector3(0.55, 0.62, 0.35).normalize();
  const waterMat = new THREE.ShaderMaterial({
    transparent: true,
    fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uTime: { value: 0 },
      uHeight: { value: null },
      uRect: { value: new THREE.Vector3(-HALF, -HALF, HALF * 2) },
      uSunDir: { value: sunDir },
      uShallow: { value: new THREE.Color(0x3fd6cf) },
      uDeep: { value: new THREE.Color(0x0a4f9e) },
      uSky: { value: new THREE.Color(0xcde8ff) },
      uTop: { value: new THREE.Color(0x2b78e4) },
      uFoam: { value: new THREE.Color(0xf4fbff) },
    }]),
    vertexShader: `uniform float uTime; varying vec3 vWorld; varying vec3 vN;
      #include <fog_pars_vertex>
      float wave(vec2 p, float t){ return sin(p.x*0.16+t*1.1)*0.22 + cos(p.y*0.13+t*0.9)*0.22 + sin((p.x+p.y)*0.33+t*1.8)*0.1; }
      void main(){
        vec4 wp = modelMatrix * vec4(position, 1.0);
        float h = wave(wp.xz, uTime);
        float hx = wave(wp.xz + vec2(0.6, 0.0), uTime) - h;
        float hz = wave(wp.xz + vec2(0.0, 0.6), uTime) - h;
        vN = normalize(vec3(-hx / 0.6, 1.0, -hz / 0.6));
        wp.y += h;
        vWorld = wp.xyz;
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `uniform float uTime; uniform sampler2D uHeight; uniform vec3 uRect; uniform vec3 uSunDir;
      uniform vec3 uShallow; uniform vec3 uDeep; uniform vec3 uSky; uniform vec3 uTop; uniform vec3 uFoam;
      varying vec3 vWorld; varying vec3 vN;
      #include <fog_pars_fragment>
      ${GLSL_NOISE}
      void main(){
        vec2 uv = (vWorld.xz - uRect.xy) / uRect.z;
        float th = texture2D(uHeight, uv).r * 48.0 - 8.0;
        if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) th = -8.0;
        float depth = vWorld.y - th;
        float n1 = vnoise(vWorld.xz * 0.35 + uTime * 0.4);
        float n2 = vnoise(vWorld.xz * 0.6 - uTime * 0.3);
        vec3 N = normalize(vN + vec3((n1 - 0.5) * 0.3, 0.0, (n2 - 0.5) * 0.3));
        vec3 V = normalize(cameraPosition - vWorld);
        float fres = pow(1.0 - max(dot(N, V), 0.0), 4.0);
        float dk = smoothstep(0.0, 7.0, depth);
        vec3 col = mix(uShallow, uDeep, dk);
        vec3 Rv = reflect(-V, N);
        vec3 skyR = mix(uSky, uTop, pow(clamp(Rv.y, 0.0, 1.0), 0.6));
        col = mix(col, skyR, fres * 0.65);
        vec3 H = normalize(uSunDir + V);
        col += vec3(1.0, 0.95, 0.85) * pow(max(dot(N, H), 0.0), 260.0) * 3.5;
        float band = 1.0 - smoothstep(0.0, 0.9, depth);
        float lines = smoothstep(0.6, 0.95, sin(depth * 5.0 - uTime * 2.2 + n1 * 3.0) * 0.5 + 0.5) * (1.0 - smoothstep(0.0, 2.4, depth));
        float foam = clamp(band * 0.95 + lines * 0.55, 0.0, 1.0) * (0.55 + 0.45 * n2);
        col = mix(col, uFoam, foam);
        col += step(0.93, vnoise(vWorld.xz * 3.0 + uTime * vec2(0.7, -0.5))) * step(0.5, n2) * 0.9 * (1.0 - dk * 0.4);
        float alpha = mix(0.5, 0.94, smoothstep(0.0, 4.5, depth));
        alpha = max(alpha, foam * 0.95);
        gl_FragColor = vec4(col, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  waterMat.uniforms.uHeight.value = htex;
  const wgeo = new THREE.PlaneGeometry(2600, 2600, 200, 200);
  wgeo.rotateX(-Math.PI / 2);
  const water = new THREE.Mesh(wgeo, waterMat);
  water.position.y = -0.15;
  water.renderOrder = 1;
  scene.add(water);

  // ---------- lava (crater lake and pools) ----------
  const lavaMat = new THREE.ShaderMaterial({
    fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 } }]),
    vertexShader: `varying vec3 vWorld;
      #include <fog_pars_vertex>
      void main(){ vec4 wp = modelMatrix * vec4(position, 1.0); vWorld = wp.xyz; vec4 mvPosition = viewMatrix * wp; gl_Position = projectionMatrix * mvPosition;
      #include <fog_vertex>
      }`,
    fragmentShader: `uniform float uTime; varying vec3 vWorld;
      #include <fog_pars_fragment>
      ${GLSL_NOISE}
      void main(){
        vec2 p = vWorld.xz * 0.32;
        float n = vnoise(p + vec2(uTime * 0.12, uTime * 0.07)) * 0.6 + vnoise(p * 2.3 - uTime * 0.2) * 0.3 + vnoise(p * 5.0 + uTime * 0.4) * 0.1;
        float veins = 1.0 - abs(vnoise(p * 1.4 + uTime * 0.05) - 0.5) * 2.0;
        vec3 crust = vec3(0.22, 0.03, 0.01);
        vec3 hot = vec3(3.2, 0.85, 0.12);
        vec3 white = vec3(5.0, 2.8, 0.9);
        vec3 col = mix(crust, hot, smoothstep(0.35, 0.7, n + pow(veins, 6.0) * 0.5));
        col = mix(col, white, smoothstep(0.78, 0.95, n) * (0.6 + 0.4 * sin(uTime * 3.0 + n * 10.0)));
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  const lavaDisc = (x, z, r, y) => {
    const m = new THREE.Mesh(new THREE.CircleGeometry(r + 0.8, 36).rotateX(-Math.PI / 2), lavaMat);
    m.position.set(x, y, z);
    scene.add(m);
  };
  lavaDisc(crater.x, crater.z, crater.r + 2.5, crater.y);
  for (const L of lavaPools) lavaDisc(L.x, L.z, L.r, L.y);

  // ---------- sky ----------
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: new THREE.Color(0x2b78e4) },
      horizon: { value: new THREE.Color(0xcde8ff) },
      bottom: { value: new THREE.Color(0x8fc4ea) },
      sunDir: { value: sunDir },
      uTime: { value: 0 },
      uCloud: { value: new THREE.Color(ATMOS.meadow.cloud) },
      uCover: { value: ATMOS.meadow.cover },
      uMtn: { value: new THREE.Color(ATMOS.meadow.mtn) },
    },
    vertexShader: `varying vec3 vDir;
      void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 bottom; uniform vec3 sunDir;
      uniform float uTime; uniform vec3 uCloud; uniform float uCover; uniform vec3 uMtn;
      varying vec3 vDir;
      ${GLSL_NOISE}
      float fbm5(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ s += a * vnoise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; } return s / 0.97; }
      float ridge(float az, float k, float o){ return fbm5(vec2(cos(az), sin(az)) * k + o); }
      void main(){
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 col = h > 0.0 ? mix(horizon, top, pow(clamp(h, 0.0, 1.0), 0.55)) : mix(horizon, bottom, pow(clamp(-h, 0.0, 1.0), 0.4));
        float s = max(dot(d, sunDir), 0.0);
        col += vec3(1.0, 0.85, 0.6) * (pow(s, 10.0) * 0.3 + pow(s, 80.0) * 0.35);
        // painted clouds drifting on a high plane, lit from the sun's side
        if (h > 0.0) {
          vec2 cp = d.xz / (h + 0.1) * 0.9 + vec2(uTime * 0.008, uTime * 0.003);
          float n = fbm5(cp);
          float cover = smoothstep(1.0 - uCover, 1.0 - uCover + 0.22, n);
          float lit = clamp(0.55 + (n - fbm5(cp + sunDir.xz * 0.06)) * 6.0, 0.0, 1.0);
          vec3 cc = uCloud * mix(0.74, 1.08, lit) + vec3(1.0, 0.88, 0.7) * pow(s, 8.0) * 0.6;
          col = mix(col, cc, cover * smoothstep(0.0, 0.14, h) * 0.9);
        }
        // two hazy mountain ranges far beyond the sea
        float az = atan(d.z, d.x);
        float m1 = pow(max(ridge(az, 1.6, 3.0) - 0.4, 0.0) * 2.4, 1.5) * 0.09;
        float m2 = pow(max(ridge(az, 3.1, 17.0) - 0.47, 0.0) * 2.6, 1.3) * 0.05;
        float k1 = (1.0 - smoothstep(m1 - 0.0015, m1 + 0.0015, h)) * smoothstep(0.0, 0.004, m1);
        float k2 = (1.0 - smoothstep(m2 - 0.0015, m2 + 0.0015, h)) * smoothstep(0.0, 0.004, m2);
        col = mix(col, mix(uMtn, horizon, 0.58) * (0.96 + 0.08 * clamp(h / max(m1, 0.001), 0.0, 1.0)), k1);
        col = mix(col, mix(uMtn, horizon, 0.3) * (0.94 + 0.1 * clamp(h / max(m2, 0.001), 0.0, 1.0)), k2);
        col = mix(col, horizon, (1.0 - smoothstep(-0.01, 0.025, h)) * 0.7);
        col += vec3(1.0, 0.92, 0.75) * pow(s, 900.0) * 6.0 * (1.0 - max(k1, k2));
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1000, 32, 16), skyMat);
  sky.frustumCulled = false;
  sky.renderOrder = 10; // drawn after the opaque scene so hidden sky pixels skip the shader
  scene.add(sky);
  scene.fog = new THREE.Fog(0xcde8ff, 150, 620);

  function makeEnvironment(renderer) {
    const envScene = new THREE.Scene();
    const envMat = skyMat.clone();
    envMat.uniforms.bottom.value = new THREE.Color(0x56703a);
    envMat.uniforms.horizon.value = new THREE.Color(0xdff0ff);
    envScene.add(new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), envMat));
    const pmrem = new THREE.PMREMGenerator(renderer);
    const tex = pmrem.fromScene(envScene, 0.035).texture;
    pmrem.dispose();
    scene.environment = tex;
    scene.environmentIntensity = 0.55;
  }

  // ---------- lights ----------
  const hemi = new THREE.HemisphereLight(0xd2ebff, 0x5d7a3e, 0.75);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff0d6, 2.7);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -55; sc.right = 55; sc.top = 55; sc.bottom = -55; sc.near = 1; sc.far = 300;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.04;
  scene.add(sun);
  scene.add(sun.target);
  // cool back light gives characters a rim against the sky
  const rim = new THREE.DirectionalLight(0xa8c8ff, 0.55);
  rim.position.set(-sunDir.x, 0.5, -sunDir.z);
  scene.add(rim);

  // ---------- colliders (bucketed in a grid for speed) ----------
  const colliders = [];
  const BUCKET = 16;
  const buckets = new Map();
  const bkey = (i, j) => i * 10007 + j;
  function addCol(x, z, r) {
    const c = { x, z, r, off: false };
    colliders.push(c);
    const i0 = Math.floor((x - r) / BUCKET), i1 = Math.floor((x + r) / BUCKET);
    const j0 = Math.floor((z - r) / BUCKET), j1 = Math.floor((z + r) / BUCKET);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const k = bkey(i, j);
      if (!buckets.has(k)) buckets.set(k, []);
      buckets.get(k).push(c);
    }
    return c;
  }

  const placed = [];
  // Spots kept free of grass, flowers and small rocks (houses, the shelter, the pier's foot).
  const clearZones = [];
  const inClear = (x, z, pad = 0) => clearZones.some((c) => (c.x - x) ** 2 + (c.z - z) ** 2 < (c.r + pad) ** 2);
  function farFromPlaced(x, z, r) {
    for (const p of placed) if ((p.x - x) ** 2 + (p.z - z) ** 2 < (p.r + r) ** 2) return false;
    return true;
  }
  function okSpot(I, x, z, minD, maxD, maxSlope = 1.6) {
    const d = Math.hypot(x - I.cx, z - I.cz);
    if (d < minD || d > maxD) return false;
    const h = getHeight(x, z);
    if (h < 1.1) return false;
    const slope = Math.abs(getHeight(x + 1.5, z) - h) + Math.abs(getHeight(x, z + 1.5) - h);
    if (slope > maxSlope) return false;
    for (const p of portals) if (Math.hypot(x - p.x, z - p.z) < 10) return false;
    if (I.id === 'haven' && pathDist(x, z) < 3.2) return false;
    if (I.id === 'haven' && inClear(x, z, 0.5)) return false;
    if (I.id === 'frost' && Math.hypot(x - lake.x, z - lake.z) < lake.r + 2) return false;
    if (I.id === 'ember' && inLava(x, z, 3)) return false;
    return true;
  }
  const randIn = (I, minD, maxD) => {
    const ang = R(0, Math.PI * 2), dist = Math.sqrt(R((minD / maxD) ** 2, 1)) * maxD;
    return [I.cx + Math.cos(ang) * dist, I.cz + Math.sin(ang) * dist];
  };

  // ---------- Haven's village, wildlife and the Easy-mode shelter ----------
  const decor = buildDecor({
    scene, R, getHeight, okSpot, farFromPlaced, placed, addCol, pathDist, portals, clearZones,
    HAVEN: ISLANDS.haven, PLAZA_R, shelterSpot, pier,
  });

  // ---------- trees ----------
  const ng = (g) => (g.index ? g.toNonIndexed() : g);
  const strip = (g) => { g.deleteAttribute('uv'); return g; };
  const ico = (r, x, y, z) => strip(ng(new THREE.IcosahedronGeometry(r, 0)).translate(x, y, z));
  const cone = (r, h, y) => strip(ng(new THREE.ConeGeometry(r, h, 7)).translate(0, y, 0));
  const box = (w, h, d, y) => strip(ng(new THREE.BoxGeometry(w, h, d)).translate(0, y, 0));
  const pineFoliage = mergeGeometries([cone(1.8, 2.3, 2.8), cone(1.4, 2.0, 3.9), cone(0.95, 1.7, 4.9)]);
  const snowCaps = mergeGeometries([cone(1.5, 0.9, 3.55), cone(1.15, 0.8, 4.55), cone(0.75, 0.9, 5.5)]);
  const deadTree = mergeGeometries([
    strip(ng(new THREE.CylinderGeometry(0.16, 0.34, 3.6, 5)).translate(0, 1.8, 0)),
    strip(ng(new THREE.CylinderGeometry(0.07, 0.13, 1.6, 4)).rotateZ(0.9).translate(0.6, 2.7, 0)),
    strip(ng(new THREE.CylinderGeometry(0.06, 0.12, 1.4, 4)).rotateZ(-1.0).rotateY(1.2).translate(-0.3, 2.3, 0.45)),
    strip(ng(new THREE.CylinderGeometry(0.05, 0.1, 1.1, 4)).rotateX(0.8).translate(0.05, 3.3, 0.3)),
  ]);
  const treeTypes = [
    { isl: 'haven', count: 75, foliage: mergeGeometries([ico(1.7, 0, 4.0, 0), ico(1.25, 1.0, 3.3, 0.3), ico(1.15, -0.9, 3.5, -0.4), ico(1.05, 0.1, 5.0, 0.2)]), trunk: strip(ng(new THREE.CylinderGeometry(0.26, 0.4, 3.4, 6)).translate(0, 1.7, 0)), colors: [0x4caf50, 0x5cbf4a, 0x3f9e45, 0x72c95a] },
    { isl: 'haven', count: 65, foliage: pineFoliage, trunk: strip(ng(new THREE.CylinderGeometry(0.22, 0.34, 2.6, 6)).translate(0, 1.3, 0)), colors: [0x2f7d4a, 0x2a6f42, 0x3b8a50, 0x357f3e] },
    { isl: 'haven', count: 34, foliage: mergeGeometries([box(2.8, 1.7, 2.8, 3.6), box(1.9, 1.3, 1.9, 4.9)]), trunk: box(0.6, 3.0, 0.6, 1.5), colors: [0x58b84a, 0x4aa33f, 0x66c255] },
    { isl: 'haven', count: 14, near: true, foliage: mergeGeometries([ico(1.6, 0, 3.9, 0), ico(1.2, 0.9, 3.3, 0.4), ico(1.1, -0.8, 3.6, -0.3)]), trunk: strip(ng(new THREE.CylinderGeometry(0.24, 0.36, 3.2, 6)).translate(0, 1.6, 0)), colors: [0xffa6c9, 0xff8fbf, 0xffb8d6] },
    { isl: 'frost', count: 80, foliage: pineFoliage, caps: snowCaps, trunk: strip(ng(new THREE.CylinderGeometry(0.22, 0.34, 2.6, 6)).translate(0, 1.3, 0)), colors: [0x2a5e44, 0x24563c, 0x316a4c], minD: 20 },
    { isl: 'ember', count: 30, trunk: deadTree, trunkColor: 0x2a2220, minD: 14 },
    { isl: 'roost', count: 26, trunk: deadTree, trunkColor: 0x4a3426, minD: 24 },
    { isl: 'roost', count: 22, foliage: mergeGeometries([ico(1.5, 0, 3.6, 0), ico(1.1, 0.8, 3.0, 0.3)]), trunk: strip(ng(new THREE.CylinderGeometry(0.22, 0.34, 3.0, 5)).translate(0, 1.5, 0)), colors: [0x8a5a2a, 0xa0642a, 0x7a4a24], minD: 26 },
  ];
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, flatShading: true });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, flatShading: true });
  const swayU = { uTime: { value: 0 } };
  leafMat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = swayU.uTime;
    sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
       #ifdef USE_INSTANCING
       vec3 tp = vec3(instanceMatrix[3][0], 0.0, instanceMatrix[3][2]);
       float sw = sin(uTime * 1.3 + tp.x * 0.2 + tp.z * 0.13) * 0.06 * max(position.y - 2.0, 0.0);
       transformed.x += sw; transformed.z += sw * 0.5;
       #endif`
    );
  };
  const snowMat = new THREE.MeshStandardMaterial({ color: 0xf6faff, roughness: 0.75, flatShading: true });
  const dummy = new THREE.Object3D();
  const treePts = [];
  for (const t of treeTypes) {
    const I = ISLANDS[t.isl];
    const trunks = new THREE.InstancedMesh(t.trunk, trunkMat, t.count);
    const leaves = t.foliage ? new THREE.InstancedMesh(t.foliage, leafMat, t.count) : null;
    const caps = t.caps ? new THREE.InstancedMesh(t.caps, snowMat, t.count) : null;
    for (const m of [trunks, leaves, caps]) if (m) { m.castShadow = true; m.receiveShadow = true; }
    let n = 0, tries = 0;
    while (n < t.count && tries < 5000) {
      tries++;
      const [x, z] = t.near ? randIn(I, 24, 46) : randIn(I, t.minD ?? 27, I.r - 8);
      if (!okSpot(I, x, z, t.near ? 22 : t.minD ?? 27, I.r - 6)) continue;
      const s = R(0.8, 1.35);
      if (!farFromPlaced(x, z, 2.2 * s)) continue;
      placed.push({ x, z, r: 2.2 * s });
      dummy.position.set(x, getHeight(x, z) - 0.1, z);
      dummy.rotation.set(0, R(0, Math.PI * 2), 0);
      dummy.scale.set(s, s * R(0.9, 1.15), s);
      dummy.updateMatrix();
      trunks.setMatrixAt(n, dummy.matrix);
      trunks.setColorAt(n, new THREE.Color(t.trunkColor ?? 0x8a5a33).offsetHSL(0, 0, R(-0.03, 0.03)));
      if (leaves) {
        leaves.setMatrixAt(n, dummy.matrix);
        leaves.setColorAt(n, new THREE.Color(t.colors[Math.floor(R(0, t.colors.length))]).offsetHSL(0, 0, R(-0.04, 0.04)));
      }
      if (caps) caps.setMatrixAt(n, dummy.matrix);
      addCol(x, z, 0.55 * s);
      treePts.push({ x, z });
      n++;
    }
    for (const m of [trunks, leaves, caps]) if (m) { m.count = n; scene.add(m); }
  }

  // ---------- rocks (all islands, tinted per biome) ----------
  const rockGeo = new THREE.DodecahedronGeometry(1, 0);
  const rockMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, flatShading: true });
  const ROCKS = 360;
  const rocks = new THREE.InstancedMesh(rockGeo, rockMat, ROCKS);
  rocks.castShadow = rocks.receiveShadow = true;
  const rockTint = { meadow: [0.6, 0.05, 0.53], snow: [0.6, 0.08, 0.55], volcano: [0.02, 0.06, 0.2], roost: [0.03, 0.3, 0.32] };
  let rn = 0;
  for (const I of ISLAND_LIST) {
    const want = I.id === 'haven' ? 160 : 66;
    let got = 0;
    for (let tries = 0; got < want && tries < 3000 && rn < ROCKS; tries++) {
      const [x, z] = randIn(I, 20, I.r - 2);
      const h = getHeight(x, z);
      if (h < 0.4) continue;
      if (I.id === 'ember' && inLava(x, z, 1.5)) continue;
      const big = got < want * 0.3;
      const s = big ? R(1.1, 2.4) : R(0.25, 0.6);
      if (big && (!okSpot(I, x, z, 22, I.r - 4) || !farFromPlaced(x, z, s * 1.2))) continue;
      if (I.id === 'haven' && (Math.hypot(x, z) < PLAZA_R + 3 || inClear(x, z, 0.6))) continue;
      if (big) { placed.push({ x, z, r: s * 1.2 }); addCol(x, z, s * 0.95); }
      dummy.position.set(x, h + (big ? s * 0.2 : 0), z);
      dummy.rotation.set(R(0, 3), R(0, 3), R(0, 3));
      dummy.scale.set(s * R(0.8, 1.3), s * R(0.55, 0.9), s * R(0.8, 1.3));
      dummy.updateMatrix();
      rocks.setMatrixAt(rn, dummy.matrix);
      const [hh, ss, ll] = rockTint[I.biome];
      rocks.setColorAt(rn, new THREE.Color().setHSL(hh, ss + R(-0.03, 0.03), ll + R(-0.08, 0.08)));
      rn++; got++;
    }
  }
  rocks.count = rn;
  scene.add(rocks);

  // ---------- crystals: ice on Frostpeak, ember shards on Ember Isle ----------
  const crystalGeo = new THREE.OctahedronGeometry(1, 0);
  function crystalField(I, count, color, emissive, ei, near) {
    const mat = new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: ei, roughness: 0.12, metalness: 0.1, flatShading: true, transparent: true, opacity: 0.9 });
    const im = new THREE.InstancedMesh(crystalGeo, mat, count);
    im.castShadow = true;
    let n = 0;
    for (let tries = 0; n < count && tries < 4000; tries++) {
      let x, z;
      if (near && n < count * 0.5) {
        const p = near[Math.floor(R(0, near.length))];
        const ang = R(0, Math.PI * 2), dd = R(p.r + 1.2, p.r + 4);
        x = p.x + Math.cos(ang) * dd; z = p.z + Math.sin(ang) * dd;
      } else [x, z] = randIn(I, 18, I.r - 8);
      const h = getHeight(x, z);
      if (h < 1 || (I.id === 'ember' && inLava(x, z, 0.6))) continue;
      if (!farFromPlaced(x, z, 0.8)) continue;
      const cluster = Math.floor(R(1, 4));
      for (let k = 0; k < cluster && n < count; k++) {
        const s = R(0.35, 0.9);
        dummy.position.set(x + R(-0.8, 0.8), h + s * 0.9, z + R(-0.8, 0.8));
        dummy.rotation.set(R(-0.4, 0.4), R(0, 3), R(-0.4, 0.4));
        dummy.scale.set(s * 0.45, s * R(1.4, 2.4), s * 0.45);
        dummy.updateMatrix();
        im.setMatrixAt(n++, dummy.matrix);
      }
    }
    im.count = n;
    scene.add(im);
  }
  crystalField(FROST, 70, 0xbff2ff, 0x3fb8ff, 0.55);
  crystalField(EMBER, 54, 0xff9a4a, 0xff5a10, 1.6, [crater, ...lavaPools]);

  // ---------- basalt columns (Ember Isle) and rock spires (Dragon's Roost) ----------
  {
    const colGeo = new THREE.CylinderGeometry(0.75, 0.8, 1, 6).translate(0, 0.5, 0);
    const colMat = new THREE.MeshStandardMaterial({ color: 0x3a3436, roughness: 0.85, flatShading: true });
    const cols = new THREE.InstancedMesh(colGeo, colMat, 120);
    cols.castShadow = cols.receiveShadow = true;
    let n = 0;
    for (let tries = 0; n < 110 && tries < 400; tries++) {
      const [x, z] = randIn(EMBER, 24, EMBER.r - 10);
      if (!okSpot(EMBER, x, z, 22, EMBER.r - 8, 2.2) || !farFromPlaced(x, z, 3.5)) continue;
      placed.push({ x, z, r: 3.2 });
      addCol(x, z, 2.2);
      const h0 = getHeight(x, z);
      for (let k = 0; k < 7 && n < 120; k++) {
        const ang = (k / 7) * Math.PI * 2, rr = k === 0 ? 0 : 1.35;
        const px = x + Math.cos(ang) * rr, pz = z + Math.sin(ang) * rr;
        dummy.position.set(px, h0 - 0.5, pz);
        dummy.rotation.set(0, R(0, 1), 0);
        dummy.scale.set(1, (k === 0 ? 5.5 : R(1.5, 4.5)) * R(0.8, 1.2), 1);
        dummy.updateMatrix();
        cols.setMatrixAt(n++, dummy.matrix);
      }
    }
    cols.count = n;
    scene.add(cols);

    const spireGeo = new THREE.CylinderGeometry(0.35, 1.0, 1, 6, 3).translate(0, 0.5, 0);
    {
      const p = spireGeo.attributes.position;
      const sr = mulberry32(99);
      for (let i = 0; i < p.count; i++) {
        if (p.getY(i) > 0.05 && p.getY(i) < 0.95) { p.setX(i, p.getX(i) * (0.85 + sr() * 0.3)); p.setZ(i, p.getZ(i) * (0.85 + sr() * 0.3)); }
      }
      spireGeo.computeVertexNormals();
    }
    const spireMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, flatShading: true });
    const spires = new THREE.InstancedMesh(spireGeo, spireMat, 40);
    spires.castShadow = spires.receiveShadow = true;
    let sn = 0;
    for (let tries = 0; sn < 26 && tries < 800; tries++) {
      const [x, z] = randIn(ROOST, 30, ROOST.r - 6);
      if (!okSpot(ROOST, x, z, 28, ROOST.r - 4, 3) || !farFromPlaced(x, z, 6)) continue;
      const s = R(2.2, 4.2), hgt = R(10, 30);
      placed.push({ x, z, r: s * 1.2 });
      addCol(x, z, s * 0.9);
      dummy.position.set(x, getHeight(x, z) - 1, z);
      dummy.rotation.set(R(-0.08, 0.08), R(0, 3), R(-0.08, 0.08));
      dummy.scale.set(s, hgt, s);
      dummy.updateMatrix();
      spires.setMatrixAt(sn, dummy.matrix);
      spires.setColorAt(sn, new THREE.Color().setHSL(0.03, R(0.3, 0.45), R(0.24, 0.36)));
      sn++;
    }
    spires.count = sn;
    scene.add(spires);
  }

  // ---------- grass tufts (Haven only, wind-swayed, darker at the root) ----------
  const grassU = { uTime: { value: 0 } };
  const blade = new THREE.BufferGeometry();
  {
    const v = [], nrm = [];
    for (let i = 0; i < 3; i++) {
      const a0 = (i / 3) * Math.PI;
      const cx = Math.cos(a0) * 0.1, cz = Math.sin(a0) * 0.1;
      const lean = (i - 1) * 0.12;
      v.push(-cx, 0, -cz, cx, 0, cz, lean, 0.7 + i * 0.1, lean * 0.5);
      for (let q = 0; q < 3; q++) nrm.push(0, 1, 0);
    }
    blade.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    blade.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  }
  const grassMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, side: THREE.DoubleSide });
  grassMat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = grassU.uTime;
    sh.vertexShader = 'uniform float uTime;\nvarying float vGH;\n' + sh.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
       vGH = position.y;
       #ifdef USE_INSTANCING
       vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
       #else
       vec3 ip = vec3(0.0);
       #endif
       float sw = sin(uTime * 2.2 + ip.x * 0.35 + ip.z * 0.25) * 0.16 * position.y;
       transformed.x += sw; transformed.z += sw * 0.6;`
    );
    sh.fragmentShader = 'varying float vGH;\n' + sh.fragmentShader.replace(
      '#include <color_fragment>',
      '#include <color_fragment>\n diffuseColor.rgb *= mix(0.55, 1.18, clamp(vGH / 0.85, 0.0, 1.0));'
    );
  };
  const GRASS = 6500;
  const grass = new THREE.InstancedMesh(blade, grassMat, GRASS);
  grass.receiveShadow = true;
  let gn = 0;
  const gcolors = [0x6fcf4f, 0x5bbd45, 0x86d95a, 0x4fae3f];
  for (let tries = 0; gn < GRASS && tries < 30000; tries++) {
    const x = R(-108, 108), z = R(-108, 108);
    const d = Math.hypot(x, z);
    if (d < PLAZA_R + 2 || d > 110) continue;
    const h = getHeight(x, z);
    if (h < 1.0) continue;
    if (pathDist(x, z) < 2.2 || inClear(x, z, 0.3)) continue;
    const slope = Math.abs(getHeight(x + 1, z) - h) + Math.abs(getHeight(x, z + 1) - h);
    if (slope > 0.9) continue;
    dummy.position.set(x, h - 0.05, z);
    dummy.rotation.set(0, R(0, Math.PI * 2), 0);
    const s = R(0.7, 1.5);
    dummy.scale.set(s, s * R(0.8, 1.3), s);
    dummy.updateMatrix();
    grass.setMatrixAt(gn, dummy.matrix);
    grass.setColorAt(gn, new THREE.Color(gcolors[gn % 4]).offsetHSL(0, 0, R(-0.05, 0.05)));
    gn++;
  }
  grass.count = gn;
  scene.add(grass);

  // ---------- flowers (Haven) ----------
  const flowerGeo = new THREE.OctahedronGeometry(0.17, 0);
  const flowerMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, emissive: 0x222222 });
  const FL = 700;
  const flowers = new THREE.InstancedMesh(flowerGeo, flowerMat, FL);
  const fcol = [0xff5a6e, 0xffd23f, 0xffffff, 0xb07cff, 0xff9a3c, 0x6ad7ff];
  let fn = 0;
  for (let tries = 0; fn < FL && tries < 8000; tries++) {
    const cx = R(-100, 100), cz = R(-100, 100);
    const color = fcol[Math.floor(R(0, fcol.length))];
    for (let q = 0; q < 8 && fn < FL; q++) {
      const x = cx + R(-2.5, 2.5), z = cz + R(-2.5, 2.5);
      const h = getHeight(x, z);
      if (h < 1.1 || Math.hypot(x, z) < PLAZA_R + 2 || pathDist(x, z) < 2.2 || inClear(x, z, 0.3)) continue;
      dummy.position.set(x, h + 0.28, z);
      dummy.rotation.set(0, R(0, 3), 0);
      dummy.scale.set(1, 0.55, 1);
      dummy.updateMatrix();
      flowers.setMatrixAt(fn, dummy.matrix);
      flowers.setColorAt(fn, new THREE.Color(color));
      fn++;
    }
  }
  flowers.count = fn;
  scene.add(flowers);

  // ---------- clouds ----------
  const clouds = [];
  const cloudMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true, emissive: 0xc9dcf0, emissiveIntensity: 0.35 });
  const cloudGeo = new THREE.IcosahedronGeometry(1, 1);
  for (let i = 0; i < 34; i++) {
    const g = new THREE.Group();
    const n = Math.floor(R(4, 8));
    for (let q = 0; q < n; q++) {
      const m = new THREE.Mesh(cloudGeo, cloudMat);
      const s = R(4, 8);
      m.position.set(R(-9, 9), R(-1.5, 2), R(-4, 4));
      m.scale.set(s * 1.3, s * 0.7, s);
      g.add(m);
    }
    g.position.set(R(-500, 500), R(68, 105), R(-480, 520));
    g.userData.speed = R(1.2, 2.6);
    clouds.push(g);
    scene.add(g);
  }

  // ---------- Haven plaza: shrine, lanterns, merchant, Elder ----------
  const plaza = new THREE.Group();
  scene.add(plaza);
  const stone = std(0xb9ae9a, { rough: 0.9 });
  const stoneDark = std(0x8e8472, { rough: 0.9 });
  const woodM = std(0x8a5a33, { rough: 0.85 });
  mesh(rbox(3.2, 0.5, 3.2, 0.1), stoneDark, 0, 2.25, 0, plaza);
  mesh(rbox(2.2, 0.6, 2.2, 0.1), stone, 0, 2.8, 0, plaza);
  mesh(rbox(1.2, 1.2, 1.2, 0.1), stone, 0, 3.7, 0, plaza);
  const crystal = mesh(new THREE.OctahedronGeometry(0.75, 0), std(0x6bffc0, { emissive: 0x2bdc8e, ei: 1.6, rough: 0.15, metal: 0.1 }), 0, 5.6, 0, plaza);
  crystal.scale.set(1, 1.5, 1);
  const shrineLight = new THREE.PointLight(0x7dffc8, 18, 16, 2);
  shrineLight.position.set(0, 5.6, 0);
  plaza.add(shrineLight);
  addCol(0, 0, 1.8);

  const lanternMat = glowMat(0xffc36b, 2.6);
  for (let i = 0; i < 8; i++) {
    const a2 = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const x = Math.cos(a2) * (PLAZA_R - 0.8), z = Math.sin(a2) * (PLAZA_R - 0.8);
    mesh(rbox(0.25, 3.2, 0.25, 0.05), woodM, x, 2 + 1.6, z, plaza);
    mesh(rbox(0.5, 0.12, 0.5, 0.04), stoneDark, x, 2 + 3.25, z, plaza);
    mesh(rbox(0.36, 0.42, 0.36, 0.06), lanternMat, x, 2 + 3.0, z, plaza, false);
    addCol(x, z, 0.3);
  }

  const stall = group(plaza, 0, 2.0, -11.5);
  const counterM = std(0x9b6a3d, { rough: 0.8 });
  mesh(rbox(5.2, 1.1, 1.2, 0.08), counterM, 0, 0.55, 1.0, stall);
  mesh(rbox(5.3, 0.12, 1.35, 0.04), std(0x6b4423), 0, 1.15, 1.0, stall);
  for (const [x, z] of [[-2.5, 1.5], [2.5, 1.5], [-2.5, -1.5], [2.5, -1.5]]) mesh(rbox(0.22, 3.6, 0.22, 0.05), woodM, x, 1.8, z, stall);
  const stripeA = std(0xe2483d, { rough: 0.7 });
  const stripeB = std(0xfff3e0, { rough: 0.7 });
  for (let i = 0; i < 7; i++) {
    const s = mesh(rbox(0.8, 0.12, 3.8, 0.03), i % 2 ? stripeB : stripeA, -2.6 + i * 0.866, 3.75, 0, stall);
    s.rotation.x = 0.12;
  }
  for (let i = 0; i < 7; i++) mesh(rbox(0.8, 0.5, 0.08, 0.02), i % 2 ? stripeB : stripeA, -2.6 + i * 0.866, 3.5, 1.95, stall);
  mesh(rbox(0.9, 0.9, 0.9, 0.06), counterM, 3.4, 0.45, 0.6, stall);
  mesh(rbox(0.7, 0.7, 0.7, 0.05), counterM, 3.3, 1.25, 0.7, stall);
  mesh(new THREE.CylinderGeometry(0.45, 0.45, 1.1, 12), std(0x7b4a26, { rough: 0.8 }), -3.4, 0.55, 0.8, stall);
  mesh(rbox(0.3, 0.4, 0.3, 0.06), glowMat(0x5effa8, 1.6), -1.6, 1.42, 1.0, stall, false);
  mesh(rbox(0.3, 0.4, 0.3, 0.06), glowMat(0xff6a3a, 1.6), -1.1, 1.42, 1.0, stall, false);
  mesh(rbox(0.3, 0.4, 0.3, 0.06), glowMat(0x7fe0ff, 1.6), 1.2, 1.42, 1.0, stall, false);
  const merchant = makeAvatar({ shirt: 0x6a3a9a, pants: 0x3a2a5a, face: 'merchant', hat: 'merchant', skin: 0xe8b98a });
  merchant.root.position.set(0, 0, -0.1);
  stall.add(merchant.root);
  merchant.root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  for (const x of [-2.5, -1.2, 0, 1.2, 2.5]) addCol(x, -10.5, 0.75);
  addCol(3.4, -10.9, 0.7);
  addCol(-3.4, -10.7, 0.6);
  const merchantPos = new THREE.Vector3(0, 2, -11.5);

  // The Elder stands by the shrine and gives the Sky Relic quests.
  const elderPos = new THREE.Vector3(-6.5, 2, -3.5);
  const elder = makeElder();
  elder.root.position.copy(elderPos);
  elder.root.rotation.y = Math.atan2(0 - elderPos.x, 7 - elderPos.z);
  elder.root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  scene.add(elder.root);
  addCol(elderPos.x, elderPos.z, 0.7);

  // ---------- Frostpeak: arena pillars, frozen lake ----------
  const icePillarMat = std(0xbfe8ff, { rough: 0.1, metal: 0.1, emissive: 0x2a8fd0, ei: 0.35, flat: true });
  const iceRune = glowMat(0x7fe0ff, 2.6);
  for (let i = 0; i < 8; i++) {
    const a2 = (i / 8) * Math.PI * 2;
    const x = FROST.cx + Math.cos(a2) * 18.5, z = FROST.cz + Math.sin(a2) * 18.5;
    const y = getHeight(x, z);
    const pil = mesh(new THREE.CylinderGeometry(0.7, 1.0, 6, 6), icePillarMat, x, y + 2.6, z, scene);
    pil.rotation.y = a2;
    mesh(rbox(0.3, 0.6, 0.3, 0.05), iceRune, x, y + 4.2, z, scene, false);
    addCol(x, z, 1.0);
  }
  {
    const ice = new THREE.Mesh(new THREE.CircleGeometry(lake.r + 1.5, 40).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xd8f4ff, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.82 }));
    ice.position.set(lake.x, 1.3, lake.z);
    ice.receiveShadow = true;
    scene.add(ice);
  }

  // ---------- Dragon's Roost: the nest ----------
  {
    const twig = new THREE.BoxGeometry(0.35, 0.35, 5.5);
    const twigMat = new THREE.MeshStandardMaterial({ color: 0x6a4a2a, roughness: 0.95, flatShading: true });
    const twigs = new THREE.InstancedMesh(twig, twigMat, 90);
    twigs.castShadow = twigs.receiveShadow = true;
    for (let i = 0; i < 90; i++) {
      const a2 = (i / 90) * Math.PI * 2 + R(-0.05, 0.05);
      const rr = R(15.5, 19.5);
      const x = nest.x + Math.cos(a2) * rr, z = nest.z + Math.sin(a2) * rr;
      dummy.position.set(x, getHeight(x, z) + R(0.1, 0.9), z);
      dummy.rotation.set(R(-0.3, 0.3), -a2 + R(-0.6, 0.6), R(-0.3, 0.3));
      dummy.scale.setScalar(R(0.7, 1.2));
      dummy.updateMatrix();
      twigs.setMatrixAt(i, dummy.matrix);
      twigs.setColorAt(i, new THREE.Color().setHSL(0.08, 0.4, R(0.18, 0.32)));
    }
    scene.add(twigs);
    const boneM = std(0xe8dcc0, { rough: 0.6 });
    for (let i = 0; i < 7; i++) {
      const a2 = R(0, Math.PI * 2), rr = R(5, 13);
      const x = nest.x + Math.cos(a2) * rr, z = nest.z + Math.sin(a2) * rr;
      const rib = mesh(new THREE.TorusGeometry(1.4, 0.13, 5, 10, Math.PI), boneM, x, getHeight(x, z) - 0.1, z, scene);
      rib.rotation.set(0, R(0, 3), 0);
    }
    const eggM = std(0x7a1a14, { rough: 0.35, emissive: 0xff3a10, ei: 0.25 });
    for (let i = 0; i < 3; i++) {
      const a2 = (i / 3) * Math.PI * 2 + 0.4;
      const x = nest.x + Math.cos(a2) * 3.2, z = nest.z + Math.sin(a2) * 3.2;
      const egg = mesh(new THREE.SphereGeometry(1, 14, 10), eggM, x, NEST_H + 1.2, z, scene);
      egg.scale.set(0.9, 1.25, 0.9);
      addCol(x, z, 0.9);
    }
  }

  // ---------- portals ----------
  const portalU = { uTime: { value: 0 } };
  const portalStone = std(0x4c4660, { rough: 0.9, flat: true });
  for (const p of portals) {
    const g = group(scene, p.x, p.y, p.z);
    g.rotation.y = p.facing;
    const ring = mesh(new THREE.TorusGeometry(2.6, 0.48, 6, 18), portalStone, 0, 3.1, 0, g);
    ring.rotation.z = Math.PI / 18;
    mesh(rbox(1.4, 1.0, 1.4, 0.1, 1), portalStone, -2.4, 0.5, 0, g);
    mesh(rbox(1.4, 1.0, 1.4, 0.1, 1), portalStone, 2.4, 0.5, 0, g);
    mesh(new THREE.CylinderGeometry(3.6, 3.9, 0.4, 8), std(0x5a5468, { rough: 0.95, flat: true }), 0, 0.15, 0, g);
    p.runeMat = glowMat(p.colors.rune, 2.4);
    for (let i = 0; i < 6; i++) {
      const a2 = (i / 6) * Math.PI * 2;
      mesh(rbox(0.26, 0.26, 0.26, 0.04), p.runeMat, Math.cos(a2) * 2.6, 3.1 + Math.sin(a2) * 2.6, 0.45, g, false);
    }
    const pm = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: {
        uTime: portalU.uTime, uGlow: { value: 1 }, uSeal: { value: p.sealed ? 1 : 0 },
        uC1: { value: new THREE.Color(p.colors.c1) }, uC2: { value: new THREE.Color(p.colors.c2) }, uRim: { value: new THREE.Color(p.colors.rim) },
      },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform float uTime; uniform float uGlow; uniform float uSeal; uniform vec3 uC1; uniform vec3 uC2; uniform vec3 uRim; varying vec2 vUv;
        void main(){
          vec2 p = vUv * 2.0 - 1.0;
          float r = length(p);
          float a = atan(p.y, p.x);
          float spin = uTime * mix(3.2, 0.4, uSeal);
          float s = sin(a * 3.0 + r * 10.0 - spin) * 0.5 + 0.5;
          float s2 = sin(a * 5.0 - r * 16.0 + spin * 0.7) * 0.5 + 0.5;
          vec3 col = mix(uC1, uC2, s * s2) * (0.5 + r * 0.9) * uGlow;
          col += uRim * smoothstep(0.35, 0.0, r) * 0.7 * uGlow;
          col += uRim * smoothstep(0.72, 0.98, r) * 1.1;
          float star = smoothstep(0.985, 1.0, sin(a * 23.0 + uTime * 1.3) * sin(r * 40.0 - uTime * 4.0));
          col += uRim * star * 1.5;
          // sealed: dark glass with red cracks
          float crack = smoothstep(0.92, 1.0, abs(sin(a * 7.0 + sin(r * 9.0) * 1.3)));
          vec3 sealed = vec3(0.05, 0.02, 0.06) + vec3(1.6, 0.15, 0.25) * crack * (0.6 + 0.4 * sin(uTime * 2.0));
          col = mix(col, sealed, uSeal);
          float alpha = smoothstep(1.0, 0.94, r) * mix(0.95, 0.98, uSeal);
          gl_FragColor = vec4(col, alpha);
        }`,
    });
    mesh(new THREE.CircleGeometry(2.25, 40), pm, 0, 3.1, 0, g, false);
    p.group = g;
    p.mat = pm;
    const cx2 = Math.cos(p.facing), sx2 = Math.sin(p.facing);
    addCol(p.x + cx2 * 2.4, p.z - sx2 * 2.4, 0.9);
    addCol(p.x - cx2 * 2.4, p.z + sx2 * 2.4, 0.9);
    p.blocker = addCol(p.x, p.z, 1.6);
    p.blocker.off = !p.sealed;
    // exit point, in front of the portal
    p.exit = new THREE.Vector3(p.x + Math.sin(p.facing) * 8, 0, p.z + Math.cos(p.facing) * 8);
    p.exit.y = getHeight(p.exit.x, p.exit.z);
  }
  function setPortalSealed(p, sealed) {
    p.sealed = sealed;
    p.blocker.off = !sealed;
    p.mat.uniforms.uSeal.value = sealed ? 1 : 0;
  }

  // ---------- minimap base: trees and the pier ----------
  mctx.fillStyle = 'rgba(30,70,40,0.6)';
  for (const t of treePts) {
    mctx.beginPath();
    mctx.arc((t.x + HALF) / CELL, (t.z + HALF) / CELL, 1.1, 0, Math.PI * 2);
    mctx.fill();
  }
  if (pier) {
    mctx.strokeStyle = '#8a5a33';
    mctx.lineWidth = 1.3;
    mctx.beginPath();
    const ca = Math.cos(pier.a), sa = Math.sin(pier.a);
    mctx.moveTo((ca * pier.r0 + HALF) / CELL, (sa * pier.r0 + HALF) / CELL);
    mctx.lineTo((ca * (pier.r0 + pier.len) + HALF) / CELL, (sa * (pier.r0 + pier.len) + HALF) / CELL);
    mctx.stroke();
  }

  // ---------- collision + bounds ----------
  function collide(p, radius) {
    const i = Math.floor(p.x / BUCKET), j = Math.floor(p.z / BUCKET);
    for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
      const list = buckets.get(bkey(i + di, j + dj));
      if (!list) continue;
      for (const c of list) {
        if (c.off) continue;
        const dx = p.x - c.x, dz = p.z - c.z;
        const rr = c.r + radius;
        const d2 = dx * dx + dz * dz;
        if (d2 < rr * rr && d2 > 1e-6) {
          const d = Math.sqrt(d2);
          p.x = c.x + (dx / d) * rr;
          p.z = c.z + (dz / d) * rr;
        }
      }
    }
  }
  const walkable = (x, z) => Math.abs(x) < HALF - 8 && Math.abs(z) < HALF - 8 && getHeight(x, z) > -1.2 && !inLava(x, z, 0.4);

  // ---------- atmosphere blending ----------
  const atmos = {
    fog: new THREE.Color(ATMOS.meadow.fog), near: ATMOS.meadow.near, far: ATMOS.meadow.far,
    sun: new THREE.Color(ATMOS.meadow.sun), sunI: ATMOS.meadow.sunI,
    hemiSky: new THREE.Color(ATMOS.meadow.hemiSky), hemiGround: new THREE.Color(ATMOS.meadow.hemiGround), hemiI: ATMOS.meadow.hemiI,
  };
  const tgt = new THREE.Color();
  function blendAtmos(biome, k) {
    const A = ATMOS[biome] || ATMOS.meadow;
    atmos.fog.lerp(tgt.set(A.fog), k);
    skyMat.uniforms.top.value.lerp(tgt.set(A.top), k);
    skyMat.uniforms.horizon.value.lerp(tgt.set(A.horizon), k);
    skyMat.uniforms.bottom.value.lerp(tgt.set(A.bottom), k);
    atmos.near = lerp(atmos.near, A.near, k);
    atmos.far = lerp(atmos.far, A.far, k);
    atmos.sun.lerp(tgt.set(A.sun), k);
    atmos.sunI = lerp(atmos.sunI, A.sunI, k);
    atmos.hemiSky.lerp(tgt.set(A.hemiSky), k);
    atmos.hemiGround.lerp(tgt.set(A.hemiGround), k);
    atmos.hemiI = lerp(atmos.hemiI, A.hemiI, k);
    skyMat.uniforms.uCloud.value.lerp(tgt.set(A.cloud), k);
    skyMat.uniforms.uMtn.value.lerp(tgt.set(A.mtn), k);
    skyMat.uniforms.uCover.value = lerp(skyMat.uniforms.uCover.value, A.cover, k);
    scene.fog.color.copy(atmos.fog);
    scene.fog.near = atmos.near;
    scene.fog.far = atmos.far;
    sun.color.copy(atmos.sun);
    sun.intensity = atmos.sunI;
    hemi.color.copy(atmos.hemiSky);
    hemi.groundColor.copy(atmos.hemiGround);
    hemi.intensity = atmos.hemiI;
    waterMat.uniforms.uSky.value.copy(skyMat.uniforms.horizon.value);
    waterMat.uniforms.uTop.value.copy(skyMat.uniforms.top.value);
  }

  // ---------- per-frame ----------
  function update(dt, t, camera, focus, biome) {
    portalU.uTime.value = t;
    skyMat.uniforms.uTime.value = t;
    terrainU.uTime.value = t;
    waterMat.uniforms.uTime.value = t;
    lavaMat.uniforms.uTime.value = t;
    grassU.uTime.value = t;
    swayU.uTime.value = t;
    sky.position.copy(camera.position);
    crystal.rotation.y = t * 0.8;
    crystal.position.y = 5.6 + Math.sin(t * 1.6) * 0.2;
    crystal.visible = camera.position.distanceTo(crystal.position) > 3.2;
    for (const c of clouds) {
      c.position.x += c.userData.speed * dt;
      if (c.position.x > 560) c.position.x = -560;
    }
    for (const p of portals) {
      p.glow = Math.max(0, p.glow - dt * 1.2);
      p.mat.uniforms.uGlow.value = 1 + p.glow * 1.6;
    }
    const f = 0.9 + Math.sin(t * 7.3) * 0.05 + Math.sin(t * 13.1) * 0.04;
    lanternMat.color.setRGB(2.6 * f, 1.4 * f, 0.4 * f);
    elder.orb.material.color.setRGB(0.6, 2.4 + Math.sin(t * 2.5) * 0.5, 1.4);
    decor.update(dt, t, camera, focus);
    blendAtmos(biome || 'meadow', Math.min(1, dt * 1.4));
    // shadow frustum follows the focus point (snapped to texels to avoid shimmering)
    const texel = 110 / 2048;
    const fx = Math.round(focus.x / texel) * texel, fz = Math.round(focus.z / texel) * texel;
    sun.target.position.set(fx, focus.y * 0.5, fz);
    sun.position.set(fx + sunDir.x * 140, focus.y * 0.5 + sunDir.y * 140, fz + sunDir.z * 140);
  }

  function randomLandPoint(islandId = 'haven', minD = 30, maxD = 95, avoid = null, avoidR = 0) {
    const I = ISLANDS[islandId];
    for (let i = 0; i < 300; i++) {
      const ang = Math.random() * Math.PI * 2, d = minD + Math.random() * (maxD - minD);
      const x = I.cx + Math.cos(ang) * d, z = I.cz + Math.sin(ang) * d;
      if (getHeight(x, z) <= 1.2 || inLava(x, z, 2)) continue;
      if (avoid && Math.hypot(x - avoid.x, z - avoid.z) < avoidR) continue;
      let ok = true;
      const i2 = Math.floor(x / BUCKET), j2 = Math.floor(z / BUCKET);
      for (let di = -1; di <= 1 && ok; di++) for (let dj = -1; dj <= 1 && ok; dj++) {
        for (const c of buckets.get(bkey(i2 + di, j2 + dj)) || []) if (!c.off && Math.hypot(x - c.x, z - c.z) < c.r + 2) { ok = false; break; }
      }
      if (ok) return new THREE.Vector3(x, getHeight(x, z), z);
    }
    return new THREE.Vector3(I.cx, getHeight(I.cx, I.cz + 20), I.cz + 20);
  }

  // Phoenix feather spots on Ember Isle, spread around the volcano.
  const featherSpots = [];
  {
    const fr = mulberry32(5150);
    for (let tries = 0; featherSpots.length < 5 && tries < 2000; tries++) {
      const ang = (featherSpots.length / 5) * Math.PI * 2 + fr() * 0.9;
      const d = 26 + fr() * 32;
      const x = volcano.x + Math.cos(ang) * d, z = volcano.z + Math.sin(ang) * d;
      if (!okSpot(EMBER, x, z, 12, EMBER.r - 12, 2.4)) continue;
      if (featherSpots.some((s) => Math.hypot(s.x - x, s.z - z) < 20)) continue;
      featherSpots.push(new THREE.Vector3(x, getHeight(x, z), z));
    }
  }

  return {
    getHeight, collide, walkable, inLava, update, portals, colliders, merchantPos, elderPos, elder, mapCanvas, makeEnvironment,
    sun, hemi, plazaRadius: PLAZA_R, setPortalSealed, randomLandPoint, featherSpots,
    arena, nest, crater, lavaPools,
    shelter: decor.shelter, pier, windmill: decor.windmill,
    // chimneys and the volcano puff smoke (main.js emits the particles)
    smoke: [...decor.smoke, { pos: new THREE.Vector3(crater.x, crater.y + 2.5, crater.z), big: true }],
    spawnPoint: new THREE.Vector3(0, 2, 7),
  };
}

// Rings of cobblestones around a centre (needs GLSL_NOISE). Colours are linear.
const GLSL_COBBLE = `
  vec3 cobble(vec2 p, vec3 c1, vec3 c2, vec3 ia, vec3 ib){
    float ringW = 1.05;
    float pr = length(p);
    float ri = floor(pr / ringW);
    float fr = fract(pr / ringW);
    float circ = 6.2831853 * max(ri + 0.5, 0.5) * ringW;
    float nseg = max(5.0, floor(circ / 1.3));
    float sa = (atan(p.y, p.x) / 6.2831853 + 0.5) * nseg + hash12(vec2(ri, 3.7)) * 7.0;
    float si = floor(sa);
    float sf = fract(sa);
    float id = hash12(vec2(ri * 1.37, mod(si, nseg)));
    vec3 col = mix(c1, c2, id);
    if (abs(ri - 4.0) < 0.5 || abs(ri - 11.0) < 0.5) col = mix(ia, ib, mod(si, 2.0));
    if (ri < 1.0) col = ib;
    float e = min(min(fr, 1.0 - fr) * ringW, min(sf, 1.0 - sf) * circ / nseg);
    col *= 0.86 + 0.14 * smoothstep(0.1, 0.25, e);
    return mix(vec3(0.1, 0.09, 0.08), col, smoothstep(0.035, 0.1, e));
  }
`;

// Shared GLSL value noise.
export const GLSL_NOISE = `
  float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
  float vnoise(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x), mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y); }
`;
