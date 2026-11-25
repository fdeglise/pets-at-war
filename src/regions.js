// Life on the outer islands: resident monsters, the sleeping Frost Titan, phoenix feathers
// on Ember Isle, treasure, and Ignis the Dragon on Dragon's Roost.
import * as THREE from 'three';
import { G, enemies } from './game.js';
import { ISLANDS } from './world.js';
import { spawnMonster } from './monsters.js';
import { Dragon } from './dragon.js';
import { spawnChest } from './loot.js';
import { makeFeather } from './bigModels.js';
import * as M from './models.js';
import { FX } from './effects.js';
import { Audio } from './audio.js';
import { UI } from './ui.js';
import { Waves } from './waves.js';
import { Quests } from './quests.js';
import { weightedPick } from './util.js';

const tmp = new THREE.Vector3();

const RESIDENTS = {
  frost: { cap: 9, every: 13, types: [['wolf', 3], ['skeleton', 2], ['slime', 1], ['golem', 0.7]] },
  ember: { cap: 10, every: 13, types: [['imp', 3], ['golem', 1.2], ['slime', 1], ['wolf', 0.6]] },
  roost: { cap: 5, every: 20, types: [['imp', 1.5], ['skeleton', 2], ['golem', 1]] },
};

export const Regions = {
  visited: {},
  respawnT: 0,
  titan: null,
  iceBlock: null,
  dragon: null,
  feathers: [],

  reset() {
    for (const f of this.feathers) G.scene.remove(f.group);
    if (this.iceBlock) G.scene.remove(this.iceBlock);
    this.visited = { haven: true };
    this.respawnT = 6;
    this.titan = null;
    this.iceBlock = null;
    this.dragon = null;
    this.feathers = G.world.featherSpots.map((pos) => {
      const g = new THREE.Group();
      const model = makeFeather();
      model.position.y = 1.4;
      g.add(model);
      g.add(M.makeBeam(0xff8a2a, 11));
      g.position.copy(pos);
      G.scene.add(g);
      return { pos: pos.clone(), group: g, model, collected: false, guarded: false };
    });
  },

  level(isl) { return Math.max(ISLANDS[isl].level, Waves.n); },

  // First visit to an island fills it with monsters and a couple of chests.
  onArrive(isl) {
    if (this.visited[isl]) return;
    this.visited[isl] = true;
    const R = RESIDENTS[isl];
    if (!R) return;
    for (let i = 0; i < Math.round(R.cap * 0.75); i++) this.spawnResident(isl);
    for (let i = 0; i < 2; i++) spawnChest(G.world.randomLandPoint(isl, 22, ISLANDS[isl].r - 14), 1e9, ISLANDS[isl].level + 2);
    if (isl === 'frost') this.spawnTitan();
    UI.notify('Two treasure chests are hidden on this island.', '#ffd24a');
  },

  spawnResident(isl) {
    const I = ISLANDS[isl];
    const p = G.player.pos;
    const at = G.world.randomLandPoint(isl, 22, I.r - 10, p, 30);
    const type = weightedPick(RESIDENTS[isl].types);
    spawnMonster(type, at, this.level(isl), { island: isl });
  },

  spawnTitan() {
    const a = G.world.arena;
    this.titan = spawnMonster('titan', new THREE.Vector3(a.x, G.world.getHeight(a.x, a.z), a.z), this.level('frost'), { island: 'frost', dormant: true });
    this.titan.yaw = Math.atan2(-ISLANDS.frost.ax, -ISLANDS.frost.az);
    const block = new THREE.Mesh(
      new THREE.BoxGeometry(5.6, 8.4, 5.2),
      new THREE.MeshStandardMaterial({ color: 0xcff0ff, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.45, emissive: 0x2a6fa0, emissiveIntensity: 0.25 })
    );
    block.position.set(a.x, this.titan.pos.y + 4.1, a.z);
    G.scene.add(block);
    this.iceBlock = block;
  },

  // A dormant boss woke up (you came close or hit it).
  onWake(m) {
    if (m.type === 'titan') {
      if (this.iceBlock) {
        G.scene.remove(this.iceBlock);
        this.iceBlock = null;
      }
      FX.burst(tmp.set(m.pos.x, m.pos.y + 3, m.pos.z), { count: 70, color: 0xcff4ff, speed: 12, up: 5, size: 0.45, life: 1.2, floor: true, gravity: 18 });
      FX.ring(m.pos, 0x8fe8ff, 10, 0.8);
      G.shake = Math.max(G.shake, 0.7);
      Audio.play('boss');
      Audio.play('slam');
      UI.banner('THE FROST TITAN AWAKENS', 'Fire burns it best. Its slams and boulders slow you down.', '#8fe8ff');
    }
  },

  awakenDragon() {
    if (this.dragon) return;
    const n = G.world.nest;
    this.dragon = new Dragon(new THREE.Vector3(n.x, n.y, n.z));
    G.monsters.push(this.dragon);
    const roost = G.world.portals.find((p) => p.island === 'haven' && p.dest === 'roost');
    if (roost) G.world.setPortalSealed(roost, false);
  },

  update(dt) {
    const p = G.player;
    const here = G.playerIsland;
    // keep outer islands lively while you're there
    if (here && RESIDENTS[here] && this.visited[here]) {
      this.respawnT -= dt;
      if (this.respawnT <= 0) {
        this.respawnT = RESIDENTS[here].every;
        const alive = enemies().filter((m) => m.island === here && !m.def.boss && !m.guard).length;
        if (alive < RESIDENTS[here].cap) this.spawnResident(here);
      }
    }
    // the Titan wakes when you climb to its arena
    const T = this.titan;
    if (T && T.dormant && !T.dead && Math.hypot(p.pos.x - T.pos.x, p.pos.z - T.pos.z) < 21) T.wake();
    // phoenix feathers: glow, get guarded when you approach, collect on touch
    for (const f of this.feathers) {
      if (f.collected) continue;
      f.model.rotation.y += dt * 1.8;
      f.model.position.y = 1.4 + Math.sin(G.time * 2 + f.pos.x) * 0.2;
      if (Math.random() < dt * 4) FX.burst(tmp.set(f.pos.x, f.pos.y + 1.4, f.pos.z), { count: 1, color: 0xff8a2a, glow: true, speed: 0.8, up: 1.5, size: 0.16, life: 0.8, gravity: -1, spread: 0.8 });
      if (here !== 'ember') continue;
      const d = Math.hypot(p.pos.x - f.pos.x, p.pos.z - f.pos.z);
      if (!f.guarded && d < 34) {
        f.guarded = true;
        const lvl = this.level('ember');
        for (const type of ['imp', Math.random() < 0.5 ? 'golem' : 'slime']) {
          const a = Math.random() * Math.PI * 2;
          const x = f.pos.x + Math.cos(a) * 4, z = f.pos.z + Math.sin(a) * 4;
          const at = G.world.walkable(x, z) ? new THREE.Vector3(x, G.world.getHeight(x, z), z) : f.pos.clone();
          const g = spawnMonster(type, at, lvl, { island: 'ember' });
          g.guard = true;
        }
      }
      if (d < 2.6 && Math.abs(p.pos.y - f.pos.y) < 6 && p.isAlive()) {
        f.collected = true;
        G.scene.remove(f.group);
        FX.burst(tmp.set(f.pos.x, f.pos.y + 1.4, f.pos.z), { count: 40, color: 0xff9a2a, glow: true, speed: 6, up: 4, size: 0.25, life: 1, gravity: -1 });
        FX.ring(f.pos, 0xff8a2a, 4, 0.6);
        Quests.addFeather();
      }
    }
  },
};
