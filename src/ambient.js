// Floating particles around the camera that give each island its mood:
// pollen and fireflies on Haven, snowfall on Frostpeak, embers and ash on the volcanic isles.
import * as THREE from 'three';
import { damp } from './util.js';

const N = 900;
const BOX = 64;

const MOODS = {
  meadow:  { glow: { color: 0xfff0a0, size: 0.2, vel: [0.35, 0.25, 0.2], wobble: 1.4, count: 0.32 }, soft: { color: 0xffffff, size: 0.1, vel: [0.5, -0.2, 0.3], wobble: 1.0, count: 0.12 } },
  snow:    { glow: { color: 0xbfefff, size: 0.12, vel: [0.2, -0.3, 0.1], wobble: 0.6, count: 0.15 }, soft: { color: 0xffffff, size: 0.15, vel: [0.9, -2.6, 0.4], wobble: 0.9, count: 0.75 } },
  volcano: { glow: { color: 0xff8a2a, size: 0.2, vel: [0.4, 1.8, 0.25], wobble: 1.1, count: 0.75 }, soft: { color: 0x6a6260, size: 0.17, vel: [0.6, -0.9, 0.3], wobble: 0.6, count: 0.55 } },
  roost:   { glow: { color: 0xff5a2a, size: 0.2, vel: [0.3, 1.3, 0.2], wobble: 1.0, count: 0.6 }, soft: { color: 0x5a4a4a, size: 0.15, vel: [0.5, -0.7, 0.3], wobble: 0.6, count: 0.5 } },
};

function makeLayer(additive) {
  const seeds = new Float32Array(N * 4);
  const pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    seeds[i * 4] = Math.random();
    seeds[i * 4 + 1] = Math.random();
    seeds[i * 4 + 2] = Math.random();
    seeds[i * 4 + 3] = Math.random();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('seed', new THREE.BufferAttribute(seeds, 4));
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    uniforms: {
      uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uVel: { value: new THREE.Vector3() },
      uSize: { value: 0.2 }, uScale: { value: 500 }, uCount: { value: 0 }, uWobble: { value: 1 },
      uColor: { value: new THREE.Color() }, uGlow: { value: additive ? 2.2 : 1 },
    },
    vertexShader: `attribute vec4 seed;
      uniform float uTime; uniform vec3 uCam; uniform vec3 uVel; uniform float uSize; uniform float uScale; uniform float uCount; uniform float uWobble;
      varying float vAlpha; varying float vSeed;
      void main(){
        vec3 p = seed.xyz * ${BOX.toFixed(1)} + uVel * uTime;
        p.x += sin(uTime * 0.7 + seed.w * 40.0) * uWobble;
        p.y += sin(uTime * 0.9 + seed.w * 17.0) * uWobble * 0.4;
        p.z += cos(uTime * 0.6 + seed.w * 30.0) * uWobble;
        p = mod(p - uCam + ${(BOX / 2).toFixed(1)}, ${BOX.toFixed(1)}) + uCam - ${(BOX / 2).toFixed(1)};
        vec4 mv = viewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = uSize * uScale / max(-mv.z, 0.5);
        float edge = smoothstep(${(BOX * 0.5).toFixed(1)}, ${(BOX * 0.3).toFixed(1)}, length(p - uCam));
        vAlpha = step(seed.w, uCount) * edge;
        vSeed = seed.w;
      }`,
    fragmentShader: `uniform vec3 uColor; uniform float uGlow; uniform float uTime; varying float vAlpha; varying float vSeed;
      void main(){
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.05, d) * vAlpha;
        a *= 0.65 + 0.35 * sin(uTime * 3.0 + vSeed * 60.0);
        if (a < 0.01) discard;
        gl_FragColor = vec4(uColor * uGlow, a);
      }`,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.renderOrder = 3;
  return pts;
}

export const Ambient = {
  init(scene) {
    this.glow = makeLayer(true);
    this.soft = makeLayer(false);
    scene.add(this.glow, this.soft);
    const copy = (m) => ({ ...m, vel: [...m.vel], color: new THREE.Color(m.color) });
    this.cur = { glow: copy(MOODS.meadow.glow), soft: copy(MOODS.meadow.soft) };
    this.tmpC = new THREE.Color();
    this.enabled = true;
  },
  resize(renderer, camera) {
    const h = renderer.getDrawingBufferSize(new THREE.Vector2()).y;
    const s = h / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
    this.glow.material.uniforms.uScale.value = s;
    this.soft.material.uniforms.uScale.value = s;
  },
  update(dt, t, camera, biome) {
    const mood = MOODS[biome] || MOODS.meadow;
    const k = 1 - Math.exp(-dt * 1.2);
    for (const key of ['glow', 'soft']) {
      const layer = this[key], c = this.cur[key], m = mood[key];
      c.size = damp(c.size, m.size, 1.2, dt);
      c.wobble = damp(c.wobble, m.wobble, 1.2, dt);
      c.count = damp(c.count, this.enabled ? m.count : 0, 1.2, dt);
      for (let i = 0; i < 3; i++) c.vel[i] = damp(c.vel[i], m.vel[i], 1.2, dt);
      c.color.lerp(this.tmpC.set(m.color), k);
      const u = layer.material.uniforms;
      u.uTime.value = t;
      u.uCam.value.copy(camera.position);
      u.uVel.value.set(c.vel[0], c.vel[1], c.vel[2]);
      u.uSize.value = c.size;
      u.uWobble.value = c.wobble;
      u.uCount.value = c.count;
      u.uColor.value.copy(c.color);
    }
  },
};
