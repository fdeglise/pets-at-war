// Shared game context. Every module reads and writes through G.
import { DIFFICULTIES } from './data.js';

export const G = {
  scene: null,
  camera: null,
  renderer: null,
  canvas: null,
  world: null,
  state: 'menu', // menu | playing | paused | panel | dying | gameover
  time: 0,
  player: null,
  pet: null,
  monsters: [], // enemies and tamed allies (ally flag)
  projectiles: [],
  drops: [],
  coins: [],
  chests: [],
  money: 0,
  stats: { kills: 0, earned: 0, tamed: 0, wave: 0, bosses: 0, time: 0 },
  petId: 'fox',
  difficulty: 'medium', // easy | medium | hard
  quality: 'high',
  shake: 0,
  cam: { yaw: 0, pitch: 0.32, dist: 11 },
};

export const enemies = () => G.monsters.filter((m) => !m.ally && !m.dead);
export const allies = () => G.monsters.filter((m) => m.ally && !m.dead);
// The current difficulty's multipliers (see DIFFICULTIES in data.js).
export const diff = () => DIFFICULTIES[G.difficulty] || DIFFICULTIES.medium;
// localStorage key for a record (best wave, best win time) on the current difficulty.
// Medium keeps the keys earlier versions used.
export const recordKey = (base, d = G.difficulty) => (d === 'medium' ? base : `${base}-${d}`);
// Is this point inside the Easy-mode shelter on Haven Isle? (always false on other difficulties)
export const inShelter = (pos, pad = 0) => !!(G.world && G.world.shelter && G.world.shelter.contains(pos, pad));
