// Boot: renderer, post-processing, game loop, state machine.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { G, enemies } from './game.js';
import { MONSTERS, itemName, itemRarity, RARITY } from './data.js';
import { buildWorld } from './world.js';
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
const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth / 2, window.innerHeight / 2), 0.42, 0.55, 0.88);
composer.addPass(bloom);
composer.addPass(new OutputPass());

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  composer.setPixelRatio(renderer.getPixelRatio());
  composer.setSize(w, h);
}
window.addEventListener('resize', resize);

function applyQuality() {
  const high = G.quality === 'high';
  renderer.setPixelRatio(high ? Math.min(window.devicePixelRatio, 1.6) : 1);
  bloom.enabled = high;
  G.world.sun.castShadow = high;
  resize();
  try { localStorage.setItem('paw-quality', G.quality); } catch (e) { /* optional */ }
}

// ---------- world ----------
G.world = buildWorld(scene);
G.world.makeEnvironment(renderer);
FX.init(scene, G.world.getHeight);
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
}

function startGame() {
  Audio.init();
  cleanupRun();
  G.money = 0;
  G.stats = { kills: 0, earned: 0, tamed: 0, wave: 0, bosses: 0, time: 0 };
  G.player = new Player();
  G.pet = new Pet(G.petId);
  G.cam.yaw = 0;
  G.cam.pitch = 0.3;
  G.cam.dist = 11;
  Waves.reset();
  G.state = 'playing';
  G.dyingT = 0;
  UI.startHUD();
  UI.banner(`Protect ${G.pet.name}`, 'Monsters pour out of the purple portals. Your pet heals you; if it falls, you lose.', '#5effa8');
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

// Global keys that work outside of the gameplay loop (panels, pause).
window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  if (e.code === 'KeyB') {
    if (G.state === 'playing') openPanel('weapons');
    else if (G.state === 'panel') closePanel();
  } else if (e.code === 'KeyI' || e.code === 'Tab') {
    if (G.state === 'playing') openPanel('backpack');
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
  let best = null, bd = 1e9;
  const consider = (d, max, obj) => {
    if (d < max && d < bd) { bd = d; best = obj; }
  };
  for (const d of G.drops) {
    const rar = RARITY[itemRarity(d.item)];
    consider(Math.hypot(d.pos.x - p.pos.x, d.pos.z - p.pos.z), 2.8, { kind: 'drop', obj: d, text: `<kbd>${Input.label('KeyE')}</kbd> Pick up <b style="color:${rar.color}">${itemName(d.item)}</b>` });
  }
  for (const c of G.chests) if (!c.opened) consider(Math.hypot(c.pos.x - p.pos.x, c.pos.z - p.pos.z), 3.2, { kind: 'chest', obj: c, text: `<kbd>${Input.label('KeyE')}</kbd> Open treasure chest` });
  for (const m of enemies()) {
    if (!m.tameable || m.hp / m.maxHp > 0.35) continue;
    const d = Math.hypot(m.pos.x - p.pos.x, m.pos.z - p.pos.z) - m.radius;
    consider(d * 0.8, 4.5, { kind: 'tame', obj: m, text: `<kbd>${Input.label('KeyE')}</kbd> Tame <b>${m.def.name}</b> · ${Math.round(m.def.tame * 100)}% chance` });
  }
  const mp = G.world.merchantPos;
  if (!best) consider(Math.hypot(mp.x - p.pos.x, mp.z - p.pos.z), 6.5, { kind: 'shop', text: `<kbd>B</kbd> Open the merchant's stall` });
  return best;
}

function handleGameplayKeys() {
  const p = G.player;
  for (let i = 0; i < 8; i++) if (Input.hit('Digit' + (i + 1)) || Input.hit('Numpad' + (i + 1))) p.equip(i);
  if (Input.hit('KeyR') && p.weapons.length > 1) p.equip((p.slot + 1) % p.weapons.length);
  if (Input.hit('KeyQ')) {
    if (!G.pet.burst()) Audio.play('error');
  }
  const it = findInteraction();
  UI.setPrompt(it ? it.text : '');
  if (Input.hit('KeyE') && it) {
    if (it.kind === 'drop') pickUp(it.obj);
    else if (it.kind === 'chest') openChest(it.obj);
    else if (it.kind === 'tame') tryTame(it.obj);
    else if (it.kind === 'shop') openPanel('weapons');
  }
  if (Input.hit('KeyB') && Input.touchActive) openPanel('weapons');
}

// ---------- camera ----------
const camTarget = new THREE.Vector3();
const camPos = new THREE.Vector3();
function updateCamera(dt) {
  const cam = G.cam;
  const sens = 0.0025;
  cam.yaw -= Input.dx * sens;
  cam.pitch = clamp(cam.pitch + Input.dy * sens, -0.3, 1.25);
  cam.dist = clamp(cam.dist + Input.wheel * 1.3, 5, 22);
  const p = G.player.pos;
  camTarget.set(p.x, p.y + 2.3, p.z);
  if (Input.locked) {
    camTarget.x += Math.cos(cam.yaw) * 1.0;
    camTarget.z -= Math.sin(cam.yaw) * 1.0;
  }
  const cp = Math.cos(cam.pitch);
  camPos.set(
    camTarget.x + Math.sin(cam.yaw) * cp * cam.dist,
    camTarget.y + Math.sin(cam.pitch) * cam.dist,
    camTarget.z + Math.cos(cam.yaw) * cp * cam.dist
  );
  const gh = G.world.getHeight(camPos.x, camPos.z) + 0.7;
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
  menuT += dt * 0.05;
  camera.position.set(Math.cos(menuT) * 62, 30, Math.sin(menuT) * 62);
  camera.lookAt(0, 4, 0);
}

// ---------- loop ----------
const clock = new THREE.Clock();
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.05);
  tick(dt);
  const focus = G.player ? G.player.pos : camera.position;
  G.world.update(dt, G.time, camera, focus);
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
    G.pet.update(dt);
    Waves.update(dt);
    updateMonsters(dt);
    updateProjectiles(dt);
    updateLoot(dt);
    updateCamera(dt);
    FX.update(dt);
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
  } else if (G.state === 'gameover') {
    updateMonsters(dt * 0.3);
    FX.update(dt);
  }
}

UI.showMenu();
frame();

// Debug hooks used by the automated playtest (harmless for players).
window.__G = G;
window.__api = {
  startGame, openPanel, closePanel, Waves, Shop,
  sim(seconds) {
    for (let t = 0; t < seconds; t += 0.05) tick(0.05);
  },
};
