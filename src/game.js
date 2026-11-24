// Shared game context. Every module reads and writes through G.

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
  quality: 'high',
  shake: 0,
  cam: { yaw: 0, pitch: 0.32, dist: 11 },
};

export const enemies = () => G.monsters.filter((m) => !m.ally && !m.dead);
export const allies = () => G.monsters.filter((m) => m.ally && !m.dead);
