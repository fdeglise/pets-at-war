// Boot: renderer, post-processing, game loop, state machine.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { G, enemies } from './game.js';
import { MONSTERS, itemName, itemRarity, RARITY } from './data.js';
import { buildWorld, ISLANDS } from './world.js';
import { FX } from './effects.js';
import { UI } from './ui.js';
import { Input } from './input.js';
import { Audio } from './audio.js';
import { Player } from './player.js';
import { Pet } from './pet.js';
import { updateMonsters, tryTame } from './monsters.js';
import { updateProjectiles } from './combat.js';
import { updateLoot, pickUp, openChest, clearLoot } from './loot.js';
import { Waves } from './waves.js';
import { Shop } from './shop.js';
import { Travel } from './travel.js';
import { Regions } from './regions.js';
import { Quests } from './quests.js';
import { Ambient } from './ambient.js';
import { clamp } from './util.js';
import { setFlash } from './models.js';

// ---------- renderer ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.domElement.id = 'game';
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 2200);
G.scene = scene;
G.camera = camera;
G.renderer = renderer;
G.canvas = renderer.domElement;

const rt = new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, rt);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth / 2, window.innerHeight / 2), 0.45, 0.55, 0.88);
composer.addPass(bloom);
composer.addPass(new OutputPass());
// Final colour grade: a little extra saturation and contrast, plus a soft vignette.
const grade = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uVig: { value: 0.32 }, uSat: { value: 1.1 }, uContrast: { value: 1.05 }, uWarm: { value: new THREE.Vector3(1.0, 1.0, 1.0) } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uVig; uniform float uSat; uniform float uContrast; uniform vec3 uWarm; varying vec2 vUv;
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      vec3 col = c.rgb;
      float l = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(vec3(l), col, uSat);
      col = (col - 0.5) * uContrast + 0.5;
      col *= uWarm;
      vec2 d = vUv - 0.5;
      col *= clamp(1.0 - dot(d, d) * uVig * 2.2, 0.0, 1.0);
      gl_FragColor = vec4(clamp(col, 0.0, 1.0), c.a);
    }`,
});
composer.addPass(grade);

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  composer.setPixelRatio(renderer.getPixelRatio());
  composer.setSize(w, h);
  if (Ambient.glow) Ambient.resize(renderer, camera);
}
window.addEventListener('resize', resize);

function applyQuality() {
  const high = G.quality === 'high';
  renderer.setPixelRatio(high ? Math.min(window.devicePixelRatio, 1.6) : 1);
  bloom.enabled = high;
  G.world.sun.castShadow = high;
  Ambient.enabled = high;
  resize();
  try { localStorage.setItem('paw-quality', G.quality); } catch (e) { /* optional */ }
}

// ---------- world ----------
G.world = buildWorld(scene);
G.world.makeEnvironment(renderer);
FX.init(scene, G.world.getHeight);
Ambient.init(scene);
// One shared light for dragon fire (kept in the scene so shaders never recompile mid-fight).
G.fireLight = new THREE.PointLight(0xff7a2a, 0, 45, 1.6);
scene.add(G.fireLight);
G.playerIsland = 'haven';
G.biome = 'meadow';
try { G.quality = localStorage.getItem('paw-quality') || 'high'; } catch (e) { G.quality = 'high'; }

UI.init(Shop, {
  start: startGame,
  resume,
  quit: quitToMenu,
  toggleQuality() {
    G.quality = G.quality === 'high' ? 'fast' : 'high';
    applyQuality();
  },
  closePanel,
  waves: () => Waves,
  monsters: () => MONSTERS,
  quests: () => Quests,
  regions: () => Regions,
  travel: () => Travel,
  empower() {
    if (!nearElder()) return 'Talk to the Elder at the shrine to awaken Sky Wings';
    Quests.empower();
    closePanel();
    return null;
  },
});
applyQuality();
Input.loadLayout().then(() => { if (G.state === 'menu') UI.buildMenu(); });

Input.init(renderer.domElement, (locked) => {
  if (!locked && G.state === 'playing') pause();
});
Input.initTouch(document.body);
renderer.domElement.addEventListener('mousedown', () => {
  if (G.state === 'playing' && !Input.locked) Input.requestLock();
});

// ---------- game state ----------
function cleanupRun() {
  for (const m of G.monsters) m.destroy();
  G.monsters.length = 0;
  for (const p of G.projectiles) scene.remove(p.obj);
  G.projectiles.length = 0;
  clearLoot();
  FX.clear();
  if (G.player) G.player.destroy();
  if (G.pet) G.pet.destroy();
  G.player = null;
  G.pet = null;
  G.fireLight.intensity = 0;
  const roost = G.world.portals.find((p) => p.island === 'haven' && p.dest === 'roost');
  if (roost) G.world.setPortalSealed(roost, true);
}

function startGame() {
  Audio.init();
  cleanupRun();
  G.money = 0;
  G.stats = { kills: 0, earned: 0, tamed: 0, wave: 0, bosses: 0, time: 0 };
  G.won = false;
  G.victoryT = -1;
  G.player = new Player();
  G.pet = new Pet(G.petId);
  G.cam.yaw = 0;
  G.cam.pitch = 0.3;
  G.cam.dist = 11;
  Waves.reset();
  Travel.reset();
  Quests.reset();
  Regions.reset();
  G.state = 'playing';
  G.dyingT = 0;
  UI.startHUD();
  UI.banner(`Protect ${G.pet.name}`, 'Your pet heals you; if it falls, you lose. Talk to the Elder by the shrine.', '#5effa8');
  Input.requestLock();
}

function pause() {
  if (G.state !== 'playing') return;
  G.state = 'paused';
  UI.showPause();
}
function resume() {
  UI.hidePause();
  UI.closePanel();
  G.state = 'playing';
  Input.requestLock();
}
function openPanel(tab) {
  if (G.state !== 'playing') return;
  G.state = 'panel';
  Input.exitLock();
  Input.mouseDown = false;
  UI.openPanel(tab);
  Audio.play('click');
}
function closePanel() {
  UI.closePanel();
  if (G.state === 'panel') {
    G.state = 'playing';
    Input.requestLock();
  }
}
function quitToMenu() {
  cleanupRun();
  G.state = 'menu';
  Input.exitLock();
  UI.showMenu();
}

G.onPetDied = () => {
  G.state = 'dying';
  G.dyingT = 0;
  Input.mouseDown = false;
  G.player.flashT = 0;
  G.player.root.visible = true;
  setFlash(G.player.mats, 0);
};
G.onKill = (m) => Quests.onKill(m);
G.onWake = (m) => Regions.onWake(m);
G.onArrive = (isl) => Regions.onArrive(isl);
G.onVictory = () => {
  G.won = true;
  G.victoryT = 0;
};

function gameOver() {
  G.state = 'gameover';
  Input.exitLock();
  let best = G.stats.wave;
  try {
    best = Math.max(best, +localStorage.getItem('paw-best-wave') || 0);
    localStorage.setItem('paw-best-wave', String(best));
  } catch (e) { /* optional */ }
  UI.showGameOver(best);
}

function victory() {
  G.state = 'victory';
  Input.exitLock();
  let bestTime = G.stats.time;
  try {
    const prev = +localStorage.getItem('paw-best-win') || 0;
    bestTime = prev ? Math.min(prev, G.stats.time) : G.stats.time;
    localStorage.setItem('paw-best-win', String(Math.round(bestTime)));
  } catch (e) { /* optional */ }
  UI.showVictory(bestTime);
}

const nearElder = () => G.player && G.player.pos.distanceTo(G.world.elderPos) < 5;

// Global keys that work outside of the gameplay loop (panels, pause).
window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  if (e.code === 'KeyB') {
    if (G.state === 'playing') openPanel('weapons');
    else if (G.state === 'panel') closePanel();
  } else if (e.code === 'KeyI' || e.code === 'Tab') {
    if (e.code === 'Tab') e.preventDefault();
    if (G.state === 'playing') openPanel('backpack');
    else if (G.state === 'panel') closePanel();
  } else if (e.code === 'KeyJ') {
    if (G.state === 'playing') openPanel('quests');
    else if (G.state === 'panel') closePanel();
  } else if (e.code === 'Escape') {
    if (G.state === 'panel') closePanel();
  } else if (e.code === 'KeyP') {
    if (G.state === 'playing') { Input.exitLock(); pause(); }
    else if (G.state === 'paused') resume();
  } else if (e.code === 'KeyM') {
    Audio.toggle();
  } else if (G.state === 'panel' && /^Digit[1-8]$/.test(e.code)) {
    G.player.equip(+e.code.slice(5) - 1);
    UI.renderPanel();
  }
});

// ---------- interactions ----------
function findInteraction() {
  const p = G.player;
  if (!p || p.downed > 0) return null;
  const E = `<kbd>${Input.label('KeyE')}</kbd>`;
  let best = null, bd = 1e9;
  const consider = (d, max, obj) => {
    if (d < max && d < bd) { bd = d; best = obj; }
  };
  const flat = (o) => Math.hypot(o.x - p.pos.x, o.z - p.pos.z);
  if (!p.mounted) {
    for (const d of G.drops) {
      const rar = RARITY[itemRarity(d.item)];
      consider(flat(d.pos), 2.8, { kind: 'drop', obj: d, text: `${E} Pick up <b style="color:${rar.color}">${itemName(d.item)}</b>` });
    }
    for (const c of G.chests) if (!c.opened) consider(flat(c.pos), 3.2, { kind: 'chest', obj: c, text: `${E} Open treasure chest` });
    for (const m of enemies()) {
      if (!m.tameable || m.hp / m.maxHp > 0.35) continue;
      const d = flat(m.pos) - m.radius;
      consider(d * 0.8, 4.5, { kind: 'tame', obj: m, text: `${E} Tame <b>${m.def.name}</b> · ${Math.round(m.def.tame * 100)}% chance` });
    }
  }
  const ep = G.world.elderPos;
  if (G.playerIsland === 'haven') {
    const ready = Quests.stage === 'empower';
    consider(flat(ep) * 0.9, 5, { kind: 'elder', text: ready ? `${E} <b>Awaken Sky Wings</b> with the Elder` : `${E} Talk to the Elder` });
  }
  if (!best) {
    const pt = Travel.nearestPortal(p.pos, 8);
    if (pt) {
      const to = ISLANDS[pt.dest];
      best = pt.sealed
        ? { kind: 'sealed', text: `<b style="color:#ff6a7a">Sealed by dragon magic</b> · bring the Elder three Sky Relics` }
        : { kind: 'portal', obj: pt, text: `${E} or walk in · travel to <b style="color:${to.color}">${to.name}</b>` };
    }
  }
  const mp = G.world.merchantPos;
  if (!best && G.playerIsland === 'haven') consider(flat(mp), 6.5, { kind: 'shop', text: `<kbd>B</kbd> Open the merchant's stall` });
  return best;
}

function handleGameplayKeys() {
  const p = G.player;
  for (let i = 0; i < 8; i++) if (Input.hit('Digit' + (i + 1)) || Input.hit('Numpad' + (i + 1))) p.equip(i);
  if (Input.hit('KeyR') && p.weapons.length > 1) p.equip((p.slot + 1) % p.weapons.length);
  if (Input.hit('KeyQ')) {
    if (!G.pet.burst()) Audio.play('error');
  }
  if (Input.hit('KeyF')) {
    const err = p.toggleMount();
    if (err) { UI.notify(err, '#ffb3b3'); Audio.play('error'); }
  }
  const it = findInteraction();
  UI.setPrompt(it ? it.text : '');
  if (Input.hit('KeyE') && it) {
    if (it.kind === 'drop') pickUp(it.obj);
    else if (it.kind === 'chest') openChest(it.obj);
    else if (it.kind === 'tame') tryTame(it.obj);
    else if (it.kind === 'shop') openPanel('weapons');
    else if (it.kind === 'elder') openPanel('quests');
    else if (it.kind === 'portal' && Travel.cd <= 0) Travel.teleport(it.obj);
  }
  if (Input.hit('KeyB') && Input.touchActive) openPanel('weapons');
  if (Input.hit('KeyJ') && Input.touchActive) openPanel('quests');
}

// ---------- camera ----------
const camTarget = new THREE.Vector3();
const camPos = new THREE.Vector3();
let camExtra = 0;
function updateCamera(dt) {
  const cam = G.cam;
  const sens = 0.0025;
  const mounted = G.player.mounted;
  cam.yaw -= Input.dx * sens;
  cam.pitch = clamp(cam.pitch + Input.dy * sens, mounted ? -0.7 : -0.3, 1.25);
  cam.dist = clamp(cam.dist + Input.wheel * 1.3, 5, 22);
  camExtra += ((mounted ? 6 : 0) - camExtra) * Math.min(1, dt * 3);
  const p = G.player.pos;
  camTarget.set(p.x, p.y + 2.3 + camExtra * 0.15, p.z);
  if (Input.locked) {
    camTarget.x += Math.cos(cam.yaw) * 1.0;
    camTarget.z -= Math.sin(cam.yaw) * 1.0;
  }
  const dist = cam.dist + camExtra;
  const cp = Math.cos(cam.pitch);
  camPos.set(
    camTarget.x + Math.sin(cam.yaw) * cp * dist,
    camTarget.y + Math.sin(cam.pitch) * dist,
    camTarget.z + Math.cos(cam.yaw) * cp * dist
  );
  const gh = Math.max(G.world.getHeight(camPos.x, camPos.z), -0.15) + 0.7;
  if (camPos.y < gh) camPos.y = gh;
  camera.position.copy(camPos);
  if (G.shake > 0) {
    camera.position.x += (Math.random() - 0.5) * G.shake;
    camera.position.y += (Math.random() - 0.5) * G.shake;
    camera.position.z += (Math.random() - 0.5) * G.shake;
    G.shake = Math.max(0, G.shake - dt * 1.6);
  }
  camera.lookAt(camTarget);
}

let menuT = 0;
function updateMenuCamera(dt) {
  menuT += dt * 0.04;
  camera.position.set(Math.cos(menuT) * 78, 34, Math.sin(menuT) * 78);
  camera.lookAt(0, 4, 0);
}

// ---------- loop ----------
const clock = new THREE.Clock();
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.05);
  tick(dt);
  const focus = G.player ? G.player.pos : camera.position;
  G.world.update(dt, G.time, camera, focus, G.state === 'menu' ? 'meadow' : G.biome);
  Ambient.update(dt, G.time, camera, G.state === 'menu' ? 'meadow' : G.biome);
  if (G.state === 'playing' || G.state === 'dying') UI.update(dt);
  composer.render(dt);
  Input.endFrame();
}

function tick(dt) {
  G.time += dt;
  if (G.state === 'playing') {
    G.stats.time += dt;
    handleGameplayKeys();
    G.player.update(dt);
    Travel.update(dt);
    G.pet.update(dt);
    Waves.update(dt);
    Regions.update(dt);
    Quests.update(dt);
    updateMonsters(dt);
    updateProjectiles(dt);
    updateLoot(dt);
    updateCamera(dt);
    FX.update(dt);
    if (G.victoryT >= 0) {
      G.victoryT += dt;
      if (G.victoryT > 6) victory();
    }
  } else if (G.state === 'dying') {
    G.dyingT += dt;
    G.pet.update(dt);
    updateMonsters(dt);
    FX.update(dt);
    updateCamera(dt);
    if (G.dyingT > 2.2) gameOver();
  } else if (G.state === 'menu') {
    updateMenuCamera(dt);
    FX.update(dt);
  } else if (G.state === 'gameover' || G.state === 'victory') {
    updateMonsters(dt * 0.3);
    FX.update(dt);
  }
}

UI.showMenu();
frame();

// Debug hooks used by the automated playtest (harmless for players).
window.__G = G;
window.__api = {
  startGame, openPanel, closePanel, Waves, Shop, Quests, Regions, Travel,
  sim(seconds) {
    for (let t = 0; t < seconds; t += 0.05) tick(0.05);
  },
};
