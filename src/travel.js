// Portals: walk (or fly) through a ring to travel to another island. Also tracks
// which island you are on and brings your allies along.
import * as THREE from 'three';
import { G, allies } from './game.js';
import { ISLANDS, islandAt, nearestIsland } from './world.js';
import { FX } from './effects.js';
import { Audio } from './audio.js';
import { UI } from './ui.js';

const tmp = new THREE.Vector3();

export const Travel = {
  cd: 0,
  last: 'haven',

  reset() {
    this.cd = 0;
    this.last = 'haven';
    G.playerIsland = 'haven';
    G.biome = 'meadow';
  },

  // The portal whose ring contains this point, if any.
  inside(pos) {
    for (const pt of G.world.portals) {
      const s = Math.sin(pt.facing), c = Math.cos(pt.facing);
      const dx = pos.x - pt.x, dz = pos.z - pt.z;
      const fwd = dx * s + dz * c;
      const lat = dx * c - dz * s;
      const dy = pos.y - pt.y;
      if (Math.abs(fwd) < 0.9 && Math.abs(lat) < 1.75 && dy > -1 && dy < 5.5) return pt;
    }
    return null;
  },

  // Where a portal leads.
  target(pt) {
    return G.world.portals.find((q) => q.island === pt.dest && (pt.island === 'haven' ? q.dest === 'haven' : q.dest === pt.island));
  },

  nearestPortal(pos, max = 9) {
    let best = null, bd = max;
    for (const pt of G.world.portals) {
      const d = Math.hypot(pos.x - pt.x, pos.z - pt.z);
      if (d < bd) { bd = d; best = pt; }
    }
    return best;
  },

  update(dt) {
    const p = G.player;
    this.cd = Math.max(0, this.cd - dt);
    const isl = islandAt(p.pos.x, p.pos.z);
    G.playerIsland = isl;
    G.biome = (isl ? ISLANDS[isl] : nearestIsland(p.pos.x, p.pos.z)).biome;
    if (isl && isl !== this.last) this.arrive(isl);
    if (this.cd <= 0 && p.downed <= 0) {
      const pt = this.inside(p.pos);
      if (pt && !pt.sealed) this.teleport(pt);
    }
  },

  arrive(isl) {
    this.last = isl;
    const I = ISLANDS[isl];
    UI.banner(I.name.toUpperCase(), I.sub, I.color);
    // tamed allies catch up with you
    const p = G.player;
    allies().forEach((a, i) => {
      if (a.island === isl) return;
      const ang = (i / 3) * Math.PI * 2;
      let x = p.pos.x + Math.cos(ang) * 4, z = p.pos.z + Math.sin(ang) * 4;
      if (!G.world.walkable(x, z)) { x = p.pos.x; z = p.pos.z; }
      a.pos.set(x, G.world.getHeight(x, z), z);
      a.island = isl;
      a.target = null;
      FX.burst(tmp.set(a.pos.x, a.pos.y + 1, a.pos.z), { count: 14, color: 0x4fb4ff, glow: true, speed: 4, size: 0.2, life: 0.6 });
    });
    G.onArrive && G.onArrive(isl);
  },

  teleport(from) {
    const to = this.target(from);
    if (!to) return;
    const p = G.player, pet = G.pet;
    const col = from.colors.c2;
    FX.burst(tmp.set(from.x, from.y + 3, from.z), { count: 40, color: col, glow: true, speed: 7, size: 0.25, life: 0.8 });
    const fx = Math.sin(to.facing), fz = Math.cos(to.facing);
    if (p.mounted) {
      p.pos.set(to.exit.x + fx * 4, Math.max(to.exit.y + pet.seatOffset() + 1, p.pos.y - from.y + to.y), to.exit.z + fz * 4);
    } else {
      p.pos.copy(to.exit);
    }
    p.vel.set(0, 0, 0);
    p.yaw = to.facing;
    // look from slightly to the side so the portal ring doesn't block the view
    G.cam.yaw = to.facing + Math.PI + 0.55;
    if (!pet.mounted) {
      const sx = Math.cos(to.facing), sz = -Math.sin(to.facing);
      pet.pos.set(to.exit.x + sx * 2.2 - fx * 1.5, 0, to.exit.z + sz * 2.2 - fz * 1.5);
      pet.pos.y = G.world.getHeight(pet.pos.x, pet.pos.z);
      pet.air = 0;
    }
    to.glow = 1;
    from.glow = 1;
    FX.burst(tmp.set(to.x, to.y + 3, to.z), { count: 50, color: to.colors.c2, glow: true, speed: 8, size: 0.28, life: 0.9 });
    FX.ring(to.exit, to.colors.c2, 5, 0.6);
    this.cd = 1.5;
    Audio.play('portal');
    UI.flash(to.island === 'haven' ? from.colors.rim : to.colors.rim);
  },
};
