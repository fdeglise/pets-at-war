// The island: terrain, water, sky, vegetation, plaza, merchant and monster portals.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeNoise, smoothstep, lerp, mulberry32 } from './util.js';
import { makeAvatar, std, rbox, mesh, group, glowMat } from './models.js';

export const SIZE = 280;
export const CELL = 2;
export const N = SIZE / CELL;
export const HALF = SIZE / 2;
const PLAZA_R = 16.5;

export function buildWorld(scene) {
  const rng = mulberry32(20261124);
  const R = (a = 0, b = 1) => a + rng() * (b - a);
  const { fbm } = makeNoise(4242);

  // ---------- height field ----------
  function rawHeight(x, z) {
    const d = Math.hypot(x, z);
    let h = 2.2 + (fbm(x * 0.022 + 3.1, z * 0.022 - 7.3, 4) - 0.5) * 7;
    const hills = fbm(x * 0.009 + 11.7, z * 0.009 + 5.2, 3);
    h += Math.pow(Math.max(0, hills - 0.48) * 2.4, 1.5) * 18;
    const ang = Math.atan2(z, x);
    const rEdge = 112 + (fbm(Math.cos(ang) * 1.6 + 9, Math.sin(ang) * 1.6 + 9, 3) - 0.5) * 26;
    h = lerp(h, -6, smoothstep(rEdge - 20, rEdge + 4, d));
    h = lerp(2.0, h, smoothstep(PLAZA_R + 1, 30, d));
    return h;
  }

  // Portals sit on dry land around the island.
  const portals = [];
  const angles = [0.35, 1.6, 2.85, 4.1, 5.35];
  for (const a of angles) {
    let r = 80;
    while (r > 40 && rawHeight(Math.cos(a) * r, Math.sin(a) * r) < 1.6) r -= 2;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    portals.push({ x, z, a, y: Math.max(1.6, rawHeight(x, z)), glow: 0 });
  }

  function height(x, z) {
    let h = rawHeight(x, z);
    for (const p of portals) {
      const d = Math.hypot(x - p.x, z - p.z);
      if (d < 11) h = lerp(p.y, h, smoothstep(5, 11, d));
    }
    return h;
  }

  const S = N + 1;
  const hgrid = new Float32Array(S * S);
  for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) hgrid[j * S + i] = height(-HALF + i * CELL, -HALF + j * CELL);
  const H = (i, j) => hgrid[j * S + i];

  function getHeight(x, z) {
    const gx = (x + HALF) / CELL, gz = (z + HALF) / CELL;
    if (gx < 0 || gz < 0 || gx >= N || gz >= N) return -6;
    const i = Math.floor(gx), j = Math.floor(gz);
    const fx = gx - i, fz = gz - j;
    const h00 = H(i, j), h10 = H(i + 1, j), h01 = H(i, j + 1), h11 = H(i + 1, j + 1);
    if (fx >= fz) return h00 + (h10 - h00) * fx + (h11 - h10) * fz;
    return h00 + (h11 - h01) * fx + (h01 - h00) * fz;
  }

  // dirt paths from plaza to each portal
  function pathDist(x, z) {
    let best = 1e9;
    for (const p of portals) {
      const ax = Math.cos(p.a) * PLAZA_R, az = Math.sin(p.a) * PLAZA_R;
      const bx = p.x, bz = p.z;
      const vx = bx - ax, vz = bz - az;
      const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz)));
      const d = Math.hypot(x - (ax + vx * t), z - (az + vz * t));
      if (d < best) best = d;
    }
    return best;
  }

  // ---------- terrain mesh ----------
  const C = (hex) => new THREE.Color(hex);
  const pal = {
    sand: C(0xead8a2), sandWet: C(0xc8b07a), under: C(0x9c8a5e),
    g1: C(0x5fbf46), g2: C(0x4aa63c), g3: C(0x86d256), dry: C(0xb5cf55),
    rock: C(0x8f949b), rock2: C(0x777c84), dirt: C(0xbf9260), dirt2: C(0xa87d4e),
    tile1: C(0xdcd3c1), tile2: C(0xc4b9a4), border: C(0x9a8f7c),
  };
  const tmpC = new THREE.Color();
  function faceColor(cx, cz, h, ny) {
    const d = Math.hypot(cx, cz);
    const j = (rng() - 0.5) * 0.06;
    if (d < PLAZA_R) {
      const ti = Math.floor((cx + 200) / 2), tj = Math.floor((cz + 200) / 2);
      return tmpC.copy((ti + tj) & 1 ? pal.tile1 : pal.tile2).offsetHSL(0, 0, j * 0.5);
    }
    if (d < PLAZA_R + 1.6) return tmpC.copy(pal.border).offsetHSL(0, 0, j);
    if (h < -0.4) return tmpC.copy(pal.under).lerp(pal.sandWet, Math.max(0, 1 + h / 6)).offsetHSL(0, 0, j);
    if (h < 0.85) return tmpC.copy(h < 0.25 ? pal.sandWet : pal.sand).offsetHSL(0, 0, j);
    if (ny < 0.8) return tmpC.copy(rng() < 0.5 ? pal.rock : pal.rock2).offsetHSL(0, 0, j);
    const pd = pathDist(cx, cz);
    if (pd < 1.9 + fbm(cx * 0.2, cz * 0.2, 2) * 1.2) return tmpC.copy(rng() < 0.5 ? pal.dirt : pal.dirt2).offsetHSL(0, 0, j * 0.5);
    for (const p of portals) {
      const dp = Math.hypot(cx - p.x, cz - p.z);
      if (dp < 6.5) return tmpC.copy(pal.rock2).lerp(C(0x5b4a6e), 0.35).offsetHSL(0, 0, j);
    }
    const n = fbm(cx * 0.045 + 50, cz * 0.045 + 50, 3);
    tmpC.copy(pal.g2).lerp(pal.g1, smoothstep(0.35, 0.55, n)).lerp(pal.g3, smoothstep(0.6, 0.75, n));
    const n2 = fbm(cx * 0.03 - 20, cz * 0.03 + 70, 2);
    if (n2 > 0.62) tmpC.lerp(pal.dry, smoothstep(0.62, 0.75, n2) * 0.8);
    if (h > 12) tmpC.lerp(pal.rock, smoothstep(12, 20, h) * 0.6);
    return tmpC.offsetHSL(0, 0, j);
  }

  const triCount = N * N * 2;
  const pos = new Float32Array(triCount * 9);
  const col = new Float32Array(triCount * 9);
  const mapCanvas = document.createElement('canvas');
  mapCanvas.width = mapCanvas.height = N;
  const mctx = mapCanvas.getContext('2d');
  const mimg = mctx.createImageData(N, N);
  let k = 0;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
  function pushTri(ax, ay, az, bx, by, bz, cx, cy, cz, cellIdx) {
    a.set(ax, ay, az); b.set(bx, by, bz); c.set(cx, cy, cz);
    e1.subVectors(b, a); e2.subVectors(c, a);
    const nrm = e1.cross(e2).normalize();
    const mx = (ax + bx + cx) / 3, my = (ay + by + cy) / 3, mz = (az + bz + cz) / 3;
    const fc = faceColor(mx, mz, my, nrm.y);
    for (const v of [a, b, c]) {
      pos[k] = v.x; pos[k + 1] = v.y; pos[k + 2] = v.z;
      col[k] = fc.r; col[k + 1] = fc.g; col[k + 2] = fc.b;
      k += 3;
    }
    if (cellIdx !== undefined) {
      const o = cellIdx * 4;
      const water = my < 0.05;
      const sr = water ? 0.12 + Math.max(0, 0.15 + my * 0.03) : fc.r;
      const sg = water ? 0.45 + Math.max(0, 0.1 + my * 0.03) : fc.g;
      const sb = water ? 0.75 : fc.b;
      mimg.data[o] = Math.pow(sr, 1 / 2.2) * 255;
      mimg.data[o + 1] = Math.pow(sg, 1 / 2.2) * 255;
      mimg.data[o + 2] = Math.pow(sb, 1 / 2.2) * 255;
      mimg.data[o + 3] = 255;
    }
  }
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const x0 = -HALF + i * CELL, z0 = -HALF + j * CELL, x1 = x0 + CELL, z1 = z0 + CELL;
      const h00 = H(i, j), h10 = H(i + 1, j), h01 = H(i, j + 1), h11 = H(i + 1, j + 1);
      pushTri(x0, h00, z0, x1, h11, z1, x1, h10, z0, j * N + i);
      pushTri(x0, h00, z0, x0, h01, z1, x1, h11, z1);
    }
  }
  mctx.putImageData(mimg, 0, 0);
  const tgeo = new THREE.BufferGeometry();
  tgeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  tgeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  tgeo.computeVertexNormals();
  const terrain = new THREE.Mesh(tgeo, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.92, metalness: 0 }));
  terrain.receiveShadow = true;
  scene.add(terrain);

  // ---------- water ----------
  const waterU = { uTime: { value: 0 } };
  const wgeo = new THREE.PlaneGeometry(1600, 1600, 200, 200);
  wgeo.rotateX(-Math.PI / 2);
  const wmat = new THREE.MeshStandardMaterial({ color: 0x1f9fd8, roughness: 0.08, metalness: 0.15, transparent: true, opacity: 0.78, flatShading: true });
  wmat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = waterU.uTime;
    sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
       float w = sin(position.x * 0.16 + uTime * 1.1) * 0.22 + cos(position.z * 0.13 + uTime * 0.9) * 0.22
               + sin((position.x + position.z) * 0.33 + uTime * 1.8) * 0.1;
       transformed.y += w;`
    );
  };
  const water = new THREE.Mesh(wgeo, wmat);
  water.position.y = -0.15;
  water.receiveShadow = true;
  scene.add(water);

  // ---------- sky ----------
  const sunDir = new THREE.Vector3(0.55, 0.62, 0.35).normalize();
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: new THREE.Color(0x2b78e4) },
      horizon: { value: new THREE.Color(0xcde8ff) },
      bottom: { value: new THREE.Color(0x8fc4ea) },
      sunDir: { value: sunDir },
    },
    vertexShader: `varying vec3 vDir;
      void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 bottom; uniform vec3 sunDir; varying vec3 vDir;
      void main(){
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 col = h > 0.0 ? mix(horizon, top, pow(clamp(h, 0.0, 1.0), 0.55)) : mix(horizon, bottom, pow(clamp(-h, 0.0, 1.0), 0.4));
        float s = max(dot(d, sunDir), 0.0);
        col += vec3(1.0, 0.9, 0.7) * pow(s, 900.0) * 6.0 + vec3(1.0, 0.85, 0.6) * pow(s, 10.0) * 0.28;
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1000, 32, 16), skyMat);
  sky.frustumCulled = false;
  scene.add(sky);
  scene.fog = new THREE.Fog(0xcde8ff, 140, 560);

  // ---------- environment reflections (makes metal armor and blades shine) ----------
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
  sc.left = -55; sc.right = 55; sc.top = 55; sc.bottom = -55; sc.near = 1; sc.far = 260;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.04;
  scene.add(sun);
  scene.add(sun.target);

  // ---------- colliders ----------
  const colliders = [];
  const addCol = (x, z, r) => colliders.push({ x, z, r });

  function okSpot(x, z, minD = 26, maxD = 104) {
    const d = Math.hypot(x, z);
    if (d < minD || d > maxD) return false;
    const h = getHeight(x, z);
    if (h < 1.1) return false;
    const slope = Math.abs(getHeight(x + 1.5, z) - h) + Math.abs(getHeight(x, z + 1.5) - h);
    if (slope > 1.6) return false;
    for (const p of portals) if (Math.hypot(x - p.x, z - p.z) < 10) return false;
    if (pathDist(x, z) < 3.2) return false;
    return true;
  }
  const placed = [];
  function farFromPlaced(x, z, r) {
    for (const p of placed) if ((p.x - x) ** 2 + (p.z - z) ** 2 < (p.r + r) ** 2) return false;
    return true;
  }

  // ---------- trees ----------
  const ng = (g) => (g.index ? g.toNonIndexed() : g);
  const ico = (r, x, y, z) => ng(new THREE.IcosahedronGeometry(r, 0)).translate(x, y, z);
  const cone = (r, h, y) => ng(new THREE.ConeGeometry(r, h, 7)).translate(0, y, 0);
  const box = (w, h, d, y) => ng(new THREE.BoxGeometry(w, h, d)).translate(0, y, 0);
  const strip = (g) => { g.deleteAttribute('uv'); return g; };
  const treeTypes = [
    { name: 'round', count: 75, foliage: mergeGeometries([ico(1.7, 0, 4.0, 0), ico(1.25, 1.0, 3.3, 0.3), ico(1.15, -0.9, 3.5, -0.4), ico(1.05, 0.1, 5.0, 0.2)].map(strip)), trunk: strip(ng(new THREE.CylinderGeometry(0.26, 0.4, 3.4, 6)).translate(0, 1.7, 0)), colors: [0x4caf50, 0x5cbf4a, 0x3f9e45, 0x72c95a] },
    { name: 'pine', count: 65, foliage: mergeGeometries([cone(1.8, 2.3, 2.8), cone(1.4, 2.0, 3.9), cone(0.95, 1.7, 4.9)].map(strip)), trunk: strip(ng(new THREE.CylinderGeometry(0.22, 0.34, 2.6, 6)).translate(0, 1.3, 0)), colors: [0x2f7d4a, 0x2a6f42, 0x3b8a50, 0x357f3e] },
    { name: 'block', count: 34, foliage: mergeGeometries([box(2.8, 1.7, 2.8, 3.6), box(1.9, 1.3, 1.9, 4.9)].map(strip)), trunk: strip(box(0.6, 3.0, 0.6, 1.5)), colors: [0x58b84a, 0x4aa33f, 0x66c255] },
    { name: 'blossom', count: 14, foliage: mergeGeometries([ico(1.6, 0, 3.9, 0), ico(1.2, 0.9, 3.3, 0.4), ico(1.1, -0.8, 3.6, -0.3)].map(strip)), trunk: strip(ng(new THREE.CylinderGeometry(0.24, 0.36, 3.2, 6)).translate(0, 1.6, 0)), colors: [0xffa6c9, 0xff8fbf, 0xffb8d6], near: true },
  ];
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x8a5a33, roughness: 0.9, flatShading: true });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, flatShading: true });
  const dummy = new THREE.Object3D();
  const treePts = [];
  for (const t of treeTypes) {
    const trunks = new THREE.InstancedMesh(t.trunk, trunkMat, t.count);
    const leaves = new THREE.InstancedMesh(t.foliage, leafMat, t.count);
    trunks.castShadow = leaves.castShadow = true;
    trunks.receiveShadow = leaves.receiveShadow = true;
    let n = 0, tries = 0;
    while (n < t.count && tries < 4000) {
      tries++;
      const ang = R(0, Math.PI * 2);
      const dist = t.near ? R(24, 46) : Math.sqrt(R(0.06, 1)) * 102;
      const x = Math.cos(ang) * dist, z = Math.sin(ang) * dist;
      if (!okSpot(x, z, t.near ? 22 : 27)) continue;
      const s = R(0.8, 1.35);
      if (!farFromPlaced(x, z, 2.2 * s)) continue;
      placed.push({ x, z, r: 2.2 * s });
      dummy.position.set(x, getHeight(x, z) - 0.1, z);
      dummy.rotation.set(0, R(0, Math.PI * 2), 0);
      dummy.scale.set(s, s * R(0.9, 1.15), s);
      dummy.updateMatrix();
      trunks.setMatrixAt(n, dummy.matrix);
      leaves.setMatrixAt(n, dummy.matrix);
      leaves.setColorAt(n, new THREE.Color(t.colors[Math.floor(R(0, t.colors.length))]).offsetHSL(0, 0, R(-0.04, 0.04)));
      addCol(x, z, 0.55 * s);
      treePts.push({ x, z });
      n++;
    }
    trunks.count = leaves.count = n;
    scene.add(trunks, leaves);
  }

  // ---------- rocks ----------
  const rockGeo = new THREE.DodecahedronGeometry(1, 0);
  const rockMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, flatShading: true });
  const rocks = new THREE.InstancedMesh(rockGeo, rockMat, 160);
  rocks.castShadow = rocks.receiveShadow = true;
  let rn = 0;
  for (let tries = 0; rn < 160 && tries < 3000; tries++) {
    const ang = R(0, Math.PI * 2);
    const dist = R(22, 108);
    const x = Math.cos(ang) * dist, z = Math.sin(ang) * dist;
    const h = getHeight(x, z);
    if (h < 0.4) continue;
    const big = rn < 45;
    const s = big ? R(1.1, 2.4) : R(0.25, 0.6);
    if (big && (!okSpot(x, z, 24, 106) || !farFromPlaced(x, z, s * 1.2))) continue;
    if (Math.hypot(x, z) < PLAZA_R + 3) continue;
    if (big) { placed.push({ x, z, r: s * 1.2 }); addCol(x, z, s * 0.95); }
    dummy.position.set(x, h + (big ? s * 0.2 : 0), z);
    dummy.rotation.set(R(0, 3), R(0, 3), R(0, 3));
    dummy.scale.set(s * R(0.8, 1.3), s * R(0.55, 0.9), s * R(0.8, 1.3));
    dummy.updateMatrix();
    rocks.setMatrixAt(rn, dummy.matrix);
    rocks.setColorAt(rn, new THREE.Color().setHSL(0.6, R(0.02, 0.08), R(0.45, 0.62)));
    rn++;
  }
  rocks.count = rn;
  scene.add(rocks);

  // ---------- grass tufts (wind-swayed) ----------
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
    sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
       #ifdef USE_INSTANCING
       vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
       #else
       vec3 ip = vec3(0.0);
       #endif
       float sw = sin(uTime * 2.2 + ip.x * 0.35 + ip.z * 0.25) * 0.16 * position.y;
       transformed.x += sw; transformed.z += sw * 0.6;`
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
    if (pathDist(x, z) < 2.2) continue;
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

  // ---------- flowers ----------
  const flowerGeo = new THREE.OctahedronGeometry(0.17, 0);
  const flowerMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, emissive: 0x222222 });
  const FL = 700;
  const flowers = new THREE.InstancedMesh(flowerGeo, flowerMat, FL);
  const fcol = [0xff5a6e, 0xffd23f, 0xffffff, 0xb07cff, 0xff9a3c, 0x6ad7ff];
  let fn = 0;
  for (let tries = 0; fn < FL && tries < 8000; tries++) {
    // flowers grow in little patches
    const cx = R(-100, 100), cz = R(-100, 100);
    const color = fcol[Math.floor(R(0, fcol.length))];
    for (let q = 0; q < 8 && fn < FL; q++) {
      const x = cx + R(-2.5, 2.5), z = cz + R(-2.5, 2.5);
      const h = getHeight(x, z);
      if (h < 1.1 || Math.hypot(x, z) < PLAZA_R + 2 || pathDist(x, z) < 2.2) continue;
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
  for (let i = 0; i < 22; i++) {
    const g = new THREE.Group();
    const n = Math.floor(R(4, 8));
    for (let q = 0; q < n; q++) {
      const m = new THREE.Mesh(cloudGeo, cloudMat);
      const s = R(4, 8);
      m.position.set(R(-9, 9), R(-1.5, 2), R(-4, 4));
      m.scale.set(s * 1.3, s * 0.7, s);
      g.add(m);
    }
    const ang = R(0, Math.PI * 2), dist = R(40, 420);
    g.position.set(Math.cos(ang) * dist, R(62, 95), Math.sin(ang) * dist);
    g.userData.speed = R(1.2, 2.6);
    clouds.push(g);
    scene.add(g);
  }

  // ---------- plaza: shrine, lanterns, merchant ----------
  const plaza = new THREE.Group();
  scene.add(plaza);
  const stone = std(0xb9ae9a, { rough: 0.9 });
  const stoneDark = std(0x8e8472, { rough: 0.9 });
  const woodM = std(0x8a5a33, { rough: 0.85 });
  // Shrine with floating heart crystal
  mesh(rbox(3.2, 0.5, 3.2, 0.1), stoneDark, 0, 2.25, 0, plaza);
  mesh(rbox(2.2, 0.6, 2.2, 0.1), stone, 0, 2.8, 0, plaza);
  mesh(rbox(1.2, 1.2, 1.2, 0.1), stone, 0, 3.7, 0, plaza);
  const crystal = mesh(new THREE.OctahedronGeometry(0.75, 0), std(0x6bffc0, { emissive: 0x2bdc8e, ei: 1.6, rough: 0.15, metal: 0.1 }), 0, 5.6, 0, plaza);
  crystal.scale.set(1, 1.5, 1);
  const shrineLight = new THREE.PointLight(0x7dffc8, 18, 16, 2);
  shrineLight.position.set(0, 5.6, 0);
  plaza.add(shrineLight);
  addCol(0, 0, 1.8);

  // Lantern posts around the ring
  const lanternMat = glowMat(0xffc36b, 2.6);
  const lanterns = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const x = Math.cos(a) * (PLAZA_R - 0.8), z = Math.sin(a) * (PLAZA_R - 0.8);
    mesh(rbox(0.25, 3.2, 0.25, 0.05), woodM, x, 2 + 1.6, z, plaza);
    mesh(rbox(0.5, 0.12, 0.5, 0.04), stoneDark, x, 2 + 3.25, z, plaza);
    const l = mesh(rbox(0.36, 0.42, 0.36, 0.06), lanternMat, x, 2 + 3.0, z, plaza, false);
    lanterns.push(l);
    addCol(x, z, 0.3);
  }

  // Merchant stall (north side of plaza)
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
  // crates and barrels
  mesh(rbox(0.9, 0.9, 0.9, 0.06), counterM, 3.4, 0.45, 0.6, stall);
  mesh(rbox(0.7, 0.7, 0.7, 0.05), counterM, 3.3, 1.25, 0.7, stall);
  mesh(new THREE.CylinderGeometry(0.45, 0.45, 1.1, 12), std(0x7b4a26, { rough: 0.8 }), -3.4, 0.55, 0.8, stall);
  // goods on the counter
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

  // ---------- portals ----------
  const portalU = { uTime: { value: 0 } };
  const portalStone = std(0x4c4660, { rough: 0.9, flat: true });
  const runeMat = glowMat(0xc56bff, 2.4);
  const portalMats = [];
  for (const p of portals) {
    const g = group(scene, p.x, p.y, p.z);
    g.rotation.y = Math.atan2(-p.x, -p.z);
    const ring = mesh(new THREE.TorusGeometry(2.6, 0.48, 6, 18), portalStone, 0, 3.1, 0, g);
    ring.rotation.z = Math.PI / 18;
    mesh(rbox(1.4, 1.0, 1.4, 0.1, 1), portalStone, -2.4, 0.5, 0, g);
    mesh(rbox(1.4, 1.0, 1.4, 0.1, 1), portalStone, 2.4, 0.5, 0, g);
    mesh(new THREE.CylinderGeometry(3.6, 3.9, 0.4, 8), std(0x5a5468, { rough: 0.95, flat: true }), 0, 0.15, 0, g);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      mesh(rbox(0.26, 0.26, 0.26, 0.04), runeMat, Math.cos(a) * 2.6, 3.1 + Math.sin(a) * 2.6, 0.45, g, false);
    }
    const pm = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: { uTime: portalU.uTime, uGlow: { value: 1 } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform float uTime; uniform float uGlow; varying vec2 vUv;
        void main(){
          vec2 p = vUv * 2.0 - 1.0;
          float r = length(p);
          float a = atan(p.y, p.x);
          float s = sin(a * 3.0 + r * 9.0 - uTime * 3.2) * 0.5 + 0.5;
          float s2 = sin(a * 5.0 - r * 14.0 + uTime * 2.1) * 0.5 + 0.5;
          vec3 c1 = vec3(0.16, 0.02, 0.38);
          vec3 c2 = vec3(0.85, 0.18, 0.95);
          vec3 col = mix(c1, c2, s * s2) * (0.55 + r * 0.9) * uGlow;
          col += vec3(1.2, 0.6, 1.4) * smoothstep(0.3, 0.0, r) * 0.5 * uGlow;
          col += vec3(1.4, 0.5, 1.6) * smoothstep(0.75, 0.98, r) * 0.9;
          float alpha = smoothstep(1.0, 0.94, r) * 0.95;
          gl_FragColor = vec4(col, alpha);
        }`,
    });
    portalMats.push(pm);
    mesh(new THREE.CircleGeometry(2.25, 40), pm, 0, 3.1, 0, g, false);
    p.group = g;
    p.mat = pm;
    addCol(p.x + Math.cos(g.rotation.y) * 2.4, p.z - Math.sin(g.rotation.y) * 2.4, 0.9);
    addCol(p.x - Math.cos(g.rotation.y) * 2.4, p.z + Math.sin(g.rotation.y) * 2.4, 0.9);
  }

  // ---------- minimap base: trees and plaza ----------
  mctx.fillStyle = 'rgba(30,90,40,0.7)';
  for (const t of treePts) {
    mctx.beginPath();
    mctx.arc((t.x + HALF) / CELL, (t.z + HALF) / CELL, 1.1, 0, Math.PI * 2);
    mctx.fill();
  }

  // ---------- collision + bounds ----------
  function collide(p, radius) {
    for (const c of colliders) {
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
  const walkable = (x, z) => getHeight(x, z) > -1.2 && Math.hypot(x, z) < 124;

  // ---------- per-frame ----------
  function update(dt, t, camera, focus) {
    waterU.uTime.value = t;
    grassU.uTime.value = t;
    portalU.uTime.value = t;
    sky.position.copy(camera.position);
    crystal.rotation.y = t * 0.8;
    crystal.position.y = 5.6 + Math.sin(t * 1.6) * 0.2;
    // don't let the big glowing crystal swallow the camera
    crystal.visible = camera.position.distanceTo(crystal.position) > 3.2;
    for (const c of clouds) {
      c.position.x += c.userData.speed * dt;
      if (c.position.x > 450) c.position.x = -450;
    }
    for (const p of portals) {
      p.glow = Math.max(0, p.glow - dt * 1.2);
      p.mat.uniforms.uGlow.value = 1 + p.glow * 1.6;
    }
    const f = 0.9 + Math.sin(t * 7.3) * 0.05 + Math.sin(t * 13.1) * 0.04;
    lanternMat.color.setRGB(2.6 * f, 1.4 * f, 0.4 * f);
    // follow the focus point with the shadow frustum (snapped to texels to avoid shimmering)
    const texel = 110 / 2048;
    const fx = Math.round(focus.x / texel) * texel, fz = Math.round(focus.z / texel) * texel;
    sun.target.position.set(fx, 0, fz);
    sun.position.set(fx + sunDir.x * 120, sunDir.y * 120, fz + sunDir.z * 120);
  }

  return {
    getHeight, collide, walkable, update, portals, colliders, merchantPos, mapCanvas, makeEnvironment,
    sun, hemi, plazaRadius: PLAZA_R,
    spawnPoint: new THREE.Vector3(0, 2, 7),
    randomLandPoint(minD = 30, maxD = 95) {
      for (let i = 0; i < 200; i++) {
        const a = Math.random() * Math.PI * 2, d = minD + Math.random() * (maxD - minD);
        const x = Math.cos(a) * d, z = Math.sin(a) * d;
        if (getHeight(x, z) > 1.2) {
          let ok = true;
          for (const c of colliders) if (Math.hypot(x - c.x, z - c.z) < c.r + 2) { ok = false; break; }
          if (ok) return new THREE.Vector3(x, getHeight(x, z), z);
        }
      }
      return new THREE.Vector3(0, 2, 20);
    },
  };
}
