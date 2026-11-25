// Wave director: slow start, growing waves, a boss every 5 waves, treasure chests.
import * as THREE from 'three';
import { G, enemies } from './game.js';
import { MONSTERS } from './data.js';
import { weightedPick } from './util.js';
import { spawnMonster, levelAllies } from './monsters.js';
import { spawnChest } from './loot.js';
import { UI } from './ui.js';
import { Audio } from './audio.js';
import { FX } from './effects.js';

const MAX_ALIVE = 26;

export const Waves = {
  n: 0,
  state: 'prep',
  timer: 0,
  queue: [],
  spawnT: 0,
  interval: 2,
  total: 0,
  chestT: 0,

  reset() {
    this.n = 0;
    this.state = 'prep';
    this.timer = 10;
    this.queue = [];
    this.total = 0;
    this.chestT = 25;
  },

  start(n) {
    this.n = n;
    G.stats.wave = n;
    this.state = 'active';
    const count = Math.round(3 + n * 2 + Math.pow(n, 1.3) * 0.35);
    const list = [];
    for (let i = 0; i < count; i++) {
      const pool = Object.entries(MONSTERS)
        .filter(([, d]) => !d.boss && d.unlock <= n)
        .map(([k, d]) => [k, k === 'slime' ? Math.max(1, 6 - n * 0.5) : k === 'golem' ? 0.6 + n * 0.05 : 2 + (n - d.unlock) * 0.3]);
      list.push(weightedPick(pool));
    }
    if (n % 5 === 0) list.splice(Math.min(3, list.length), 0, 'ogre');
    this.queue = list;
    this.total = list.length;
    this.interval = Math.max(0.5, 3.2 - n * 0.2);
    this.spawnT = 0.5;
    levelAllies(n);
    if (n % 5 === 0) {
      UI.banner(`WAVE ${n}`, 'A Shadow Ogre is coming through the portals', '#c56bff');
      Audio.play('boss');
    } else {
      UI.banner(`WAVE ${n}`, `${count} monsters incoming`, '#ffcf4a');
      Audio.play('wave');
    }
  },

  remaining() {
    return this.queue.length + enemies().filter((m) => m.wave).length;
  },

  // Waves only run while you're on Haven Isle; they wait for you when you travel.
  update(dt) {
    if (G.playerIsland !== 'haven') return;
    if (this.state === 'prep') {
      this.timer -= dt;
      if (this.timer <= 0) this.start(this.n + 1);
    } else {
      this.spawnT -= dt;
      if (this.spawnT <= 0 && this.queue.length && enemies().length < MAX_ALIVE) {
        const type = this.queue.shift();
        const gates = G.world.portals.filter((p) => p.island === 'haven');
        const portal = gates[Math.floor(Math.random() * gates.length)];
        const toC = Math.atan2(-portal.x, -portal.z);
        const pos = new THREE.Vector3(
          portal.x + Math.sin(toC) * 3 + (Math.random() - 0.5) * 3,
          0,
          portal.z + Math.cos(toC) * 3 + (Math.random() - 0.5) * 3
        );
        pos.y = G.world.getHeight(pos.x, pos.z);
        spawnMonster(type, pos, this.n, { island: 'haven', wave: true });
        portal.glow = 1;
        FX.burst(new THREE.Vector3(portal.x, portal.y + 3.1, portal.z), { count: 14, color: 0xd07bff, glow: true, speed: 4, size: 0.22, life: 0.7 });
        if (type === 'ogre') {
          UI.notify('The Shadow Ogre has arrived!', '#c56bff');
          G.shake = Math.max(G.shake, 0.4);
        }
        // early waves trickle in slowly
        this.spawnT = this.interval * (0.6 + Math.random() * 0.8);
      }
      if (!this.queue.length && enemies().filter((m) => m.wave).length === 0) {
        this.state = 'prep';
        this.timer = 12;
        const bonus = 15 + this.n * 10;
        G.money += bonus;
        G.stats.earned += bonus;
        UI.moneyPop(bonus);
        UI.banner(`WAVE ${this.n} CLEARED`, `+${bonus} coins · next wave in 12s · press B to shop`, '#5effa8');
        Audio.play('clear');
      }
    }
    // treasure chests appear now and then
    this.chestT -= dt;
    if (this.chestT <= 0) {
      this.chestT = 35 + Math.random() * 25;
      if (G.chests.filter((c) => !c.opened && Math.hypot(c.pos.x, c.pos.z) < 130).length < 3) {
        spawnChest(G.world.randomLandPoint('haven', 28, 92));
        UI.notify('A treasure chest appeared! Check your map.', '#ffd24a');
      }
    }
  },
};
