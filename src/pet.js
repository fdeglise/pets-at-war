// The pet: follows the player, heals them, and pays HP to revive them. If it dies, the run ends.
import * as THREE from 'three';
import { G, enemies } from './game.js';
import { PETS, MOUNT_SCALE } from './data.js';
import * as M from './models.js';
import { makeWing } from './bigModels.js';
import { FX } from './effects.js';
import { Audio } from './audio.js';
import { UI } from './ui.js';
import { dampAngle, damp } from './util.js';

const tmp = new THREE.Vector3();
const tmp2 = new THREE.Vector3();

export const BURST_CD = 22;
export const WING_HP = 100; // Sky Wings make the pet sturdier

export class Pet {
  constructor(id) {
    this.id = id;
    this.def = PETS[id];
    this.name = this.def.name;
    this.rig = M.makePet(id);
    this.root = this.rig.root;
    G.scene.add(this.root);
    this.upg = { vitality: 0, mending: 0 };
    this.maxHp = this.def.hp;
    this.hp = this.maxHp;
    const p = G.player.pos;
    this.pos = new THREE.Vector3(p.x + 2, p.y, p.z + 2);
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.radius = 0.6;
    this.height = this.rig.height;
    this.alive = true;
    this.flashT = 0;
    this.lastHurt = 99;
    this.healFx = 0;
    this.burstCd = 0;
    this.phase = 0;
    this.deathT = 0;
    this.healing = false;
    this.winged = false;
    this.wingGrow = 0;
    this.mounted = false;
    this.scaleK = 1;
    this.air = 0;
    this.roll = 0;
    this.pitch = 0;
    this.flap = 0;
    this.baseHeight = this.rig.height;
    this.mats = M.collectMats(this.root);
  }

  // Height of the rider's hips above the pet's feet at the current size.
  seatOffset() { return this.def.seat * this.scaleK - 0.85; }

  // The three Sky Relics turn into wings.
  giveWings() {
    if (this.winged) return;
    this.winged = true;
    this.wingGrow = 0;
    const spots = { fox: [0.3, 0.22, 0.2, 0.85], bunny: [0.3, 0.26, 0.1, 0.85], turtle: [0.42, 0.45, 0.1, 0.95] };
    const [x, y, z, s] = spots[this.id];
    this.wings = [makeWing(-1), makeWing(1)];
    this.wings.forEach((w, i) => {
      w.position.set(i ? x : -x, y, z);
      w.scale.setScalar(0.01);
      w.userData.size = s;
      this.rig.body.add(w);
    });
    this.mats = M.collectMats(this.root);
    this.recalc();
    this.hp = this.maxHp;
  }

  setMounted(on) {
    if (on === this.mounted) return;
    this.mounted = on;
    FX.burst(tmp.set(this.pos.x, this.pos.y + 1, this.pos.z), { count: 30, color: 0xbff2ff, glow: true, speed: 6, up: 2, size: 0.3, life: 0.7, gravity: 0 });
    FX.ring(this.pos, 0x8fe8ff, 4, 0.5);
    if (!on) {
      this.air = Math.max(0, this.pos.y - G.world.getHeight(this.pos.x, this.pos.z));
      this.pos.y = G.world.getHeight(this.pos.x, this.pos.z);
      this.roll = this.pitch = 0;
    }
  }

  get healRate() { return this.def.heal + this.upg.mending; }
  recalc() {
    const old = this.maxHp;
    this.maxHp = this.def.hp + this.upg.vitality * 40 + (this.winged ? WING_HP : 0);
    this.hp = Math.min(this.maxHp, this.hp + Math.max(0, this.maxHp - old));
  }
  isAlive() { return this.alive; }

  takeHit(dmg) {
    if (!this.alive || G.state !== 'playing') return;
    if (G.won) return;
    if (this.mounted) dmg *= 0.7; // hard to hit while it flies
    dmg = Math.max(1, Math.round(dmg));
    this.hp -= dmg;
    this.flashT = 0.15;
    this.lastHurt = 0;
    Audio.play('petHurt');
    UI.dmg(tmp.set(this.pos.x, this.pos.y + this.height + 0.3, this.pos.z), String(dmg), '#ff6b8a', 'pet');
    UI.petHurt();
    if (this.hp <= 0) this.die();
  }

  heal(n) {
    if (!this.alive) return;
    this.hp = Math.min(this.maxHp, this.hp + n);
  }

  die() {
    if (!this.alive) return;
    this.hp = 0;
    this.alive = false;
    this.deathT = 0;
    FX.burst(tmp.set(this.pos.x, this.pos.y + 0.8, this.pos.z), { count: 40, color: 0xff6fa8, glow: true, speed: 5, up: 3, size: 0.25, life: 1.4, gravity: -1 });
    Audio.play('gameover');
    G.onPetDied && G.onPetDied();
  }

  burst() {
    if (!this.alive || this.burstCd > 0) return false;
    const p = G.player;
    this.burstCd = BURST_CD;
    p.heal(p.maxHp * 0.4);
    this.heal(this.maxHp * 0.25);
    FX.ring(p.pos, 0x5effa8, 5, 0.7);
    FX.ring(this.pos, 0x5effa8, 3, 0.5);
    FX.burst(tmp.set(p.pos.x, p.pos.y + 1.4, p.pos.z), { count: 26, color: 0x5effa8, glow: true, speed: 4, up: 3, size: 0.22, life: 0.9, gravity: -2 });
    Audio.play('heal');
    return true;
  }

  update(dt) {
    const world = G.world;
    if (!this.alive) {
      this.deathT += dt;
      const k = Math.min(1, this.deathT / 1.2);
      this.root.rotation.z = k * Math.PI * 0.5;
      this.root.position.y = this.pos.y + Math.sin(k * Math.PI) * 0.8;
      this.root.scale.setScalar(Math.max(0.01, this.scaleK * (1 - k * 0.6)));
      return;
    }
    const p = G.player;
    this.burstCd = Math.max(0, this.burstCd - dt);
    this.lastHurt += dt;
    if (this.winged && this.wingGrow < 1) {
      this.wingGrow = Math.min(1, this.wingGrow + dt * 0.8);
      const k = 1 - Math.pow(1 - this.wingGrow, 3);
      for (const w of this.wings) w.scale.setScalar(Math.max(0.01, k * w.userData.size));
    }
    this.scaleK = damp(this.scaleK, this.mounted ? MOUNT_SCALE : 1, 7, dt);
    this.radius = 0.6 * this.scaleK;
    this.height = this.baseHeight * this.scaleK;
    if (this.mounted) {
      this.updateMounted(dt);
      return;
    }

    // Stay behind the player, on the far side from the closest monster.
    let nearest = null, nd = 1e9;
    for (const m of enemies()) {
      const d = m.pos.distanceTo(p.pos);
      if (d < nd) { nd = d; nearest = m; }
    }
    let ang = p.yaw + Math.PI + 0.7;
    let keep = 2.4;
    if (nearest && nd < 16) {
      ang = Math.atan2(p.pos.x - nearest.pos.x, p.pos.z - nearest.pos.z) + Math.sin(G.time * 0.7) * 0.4;
      // back off out of ground-slam range of heavy monsters
      if (nearest.def.slam) keep = Math.max(keep, nearest.def.slam + 2.5 - nd);
    }
    const gx = p.pos.x + Math.sin(ang) * keep, gz = p.pos.z + Math.cos(ang) * keep;
    const dx = gx - this.pos.x, dz = gz - this.pos.z;
    const d = Math.hypot(dx, dz);
    if (d > 45) {
      this.pos.set(gx, world.getHeight(gx, gz), gz);
    }
    const speed = d > 6 ? 15 : d > 2 ? 10 : 6;
    let moving = false;
    if (d > 0.35) {
      const mv = Math.min(d, speed * dt);
      const ox = this.pos.x, oz = this.pos.z;
      this.pos.x += (dx / d) * mv;
      this.pos.z += (dz / d) * mv;
      world.collide(this.pos, this.radius);
      if (!world.walkable(this.pos.x, this.pos.z)) { this.pos.x = ox; this.pos.z = oz; }
      moving = true;
      this.yaw = dampAngle(this.yaw, Math.atan2(dx, dz), 10, dt);
    } else {
      this.yaw = dampAngle(this.yaw, Math.atan2(p.pos.x - this.pos.x, p.pos.z - this.pos.z), 6, dt);
    }
    this.pos.y = world.getHeight(this.pos.x, this.pos.z);

    // Heal the player
    const pd = this.pos.distanceTo(p.pos);
    this.healing = false;
    if (p.downed <= 0 && p.hp < p.maxHp && pd < 16) {
      p.heal(this.healRate * dt);
      this.healing = true;
      this.healFx -= dt;
      if (this.healFx <= 0) {
        this.healFx = 0.07;
        const from = tmp.copy(this.rig.gem.position).applyMatrix4(this.root.matrixWorld);
        FX.stream(from, tmp2.set(p.pos.x, p.pos.y + 1.4, p.pos.z), 0x5effa8, 0.32);
      }
    } else if (this.hp < this.maxHp && this.lastHurt > 4) {
      this.heal(this.healRate * 0.6 * dt);
    }

    // Animation
    this.phase += dt * (moving ? 14 : 3);
    const r = this.rig;
    // winged pets glide when they have to catch up
    const gliding = this.winged && d > 6;
    this.air = damp(this.air, gliding ? 1.3 : 0, gliding ? 4 : 2.5, dt);
    const hop = moving && this.air < 0.3 ? Math.abs(Math.sin(this.phase * 0.5)) * (this.id === 'bunny' ? 0.45 : 0.18) : 0;
    this.root.position.set(this.pos.x, this.pos.y + hop + this.air, this.pos.z);
    this.root.rotation.set(0, this.yaw, 0);
    this.root.scale.setScalar(this.scaleK);
    this.animateWings(dt, this.air > 0.3 ? 1 : 0);
    const legSwing = moving ? Math.sin(this.phase) * 0.7 : 0;
    r.legs.forEach((l, i) => (l.rotation.x = (i % 2 === (i < 2 ? 0 : 1) ? 1 : -1) * legSwing));
    if (r.tail) r.tail.rotation.y = Math.sin(G.time * (this.healing ? 12 : 5)) * 0.5;
    if (r.ears) r.ears.forEach((e, i) => (e.rotation.x = -0.2 - hop * 0.8 + Math.sin(G.time * 3 + i) * 0.05));
    if (r.head) r.head.rotation.x = Math.sin(G.time * 2) * 0.05;
    r.gem.rotation.y += dt * 2;
    r.gem.position.y = r.height + 0.35 + Math.sin(G.time * 2.5) * 0.1;
    const pulse = this.healing ? 1 + Math.sin(G.time * 12) * 0.25 : 1;
    r.gem.scale.setScalar(pulse);

    if (this.flashT > 0) {
      this.flashT -= dt;
      M.setFlash(this.mats, this.flashT > 0 ? 0.9 : 0, 0xff4466);
    }
  }

  // Folded on the back while walking, flapping while flying.
  animateWings(dt, flying, climb = 0) {
    if (!this.wings) return;
    this.flap += dt * (flying ? 9 + Math.max(0, climb) * 0.5 : 2);
    this.wings.forEach((w, i) => {
      const side = i ? 1 : -1;
      if (flying) {
        w.rotation.set(0, 0, side * (Math.sin(this.flap) * 0.75 + 0.1));
      } else {
        w.rotation.set(0.15, -side * 1.15, side * (0.55 + Math.sin(this.flap) * 0.05));
      }
    });
  }

  // Ridden: the player steers; the pet carries them and keeps healing.
  updateMounted(dt) {
    const p = G.player;
    const prevYaw = this.yaw;
    this.yaw = p.yaw;
    this.pos.set(p.pos.x, p.pos.y - this.seatOffset(), p.pos.z);
    const turn = Math.atan2(Math.sin(this.yaw - prevYaw), Math.cos(this.yaw - prevYaw)) / Math.max(dt, 1e-4);
    const sideV = p.vel.x * Math.cos(this.yaw) - p.vel.z * Math.sin(this.yaw);
    this.roll = damp(this.roll, Math.max(-0.5, Math.min(0.5, -turn * 0.08 - sideV * 0.012)), 5, dt);
    this.pitch = damp(this.pitch, Math.max(-0.35, Math.min(0.35, -p.vel.y * 0.025)), 5, dt);
    const bob = Math.sin(G.time * 2.2) * 0.12;
    this.root.position.set(this.pos.x, this.pos.y + bob, this.pos.z);
    this.root.rotation.set(this.pitch, this.yaw, this.roll, 'YXZ');
    this.root.scale.setScalar(this.scaleK);
    const r = this.rig;
    r.legs.forEach((l) => (l.rotation.x = damp(l.rotation.x, 0.9, 8, dt)));
    if (r.tail) r.tail.rotation.y = Math.sin(G.time * 4) * 0.3;
    if (r.ears) r.ears.forEach((e) => (e.rotation.x = -0.9));
    this.animateWings(dt, 1, p.vel.y);
    r.gem.rotation.y += dt * 2;
    // healing still flows while you ride
    this.healing = false;
    if (p.downed <= 0 && p.hp < p.maxHp) {
      p.heal(this.healRate * dt);
      this.healing = true;
    } else if (this.hp < this.maxHp && this.lastHurt > 4) {
      this.heal(this.healRate * 0.6 * dt);
    }
    if (Math.random() < dt * 10) {
      const w = this.wings[Math.random() < 0.5 ? 0 : 1];
      const at = tmp.setFromMatrixPosition(w.matrixWorld);
      FX.burst(at, { count: 1, color: 0x8fe8ff, glow: true, speed: 1, up: 0, size: 0.25, life: 0.6, gravity: 0 });
    }
    if (this.flashT > 0) {
      this.flashT -= dt;
      M.setFlash(this.mats, this.flashT > 0 ? 0.9 : 0, 0xff4466);
    }
  }

  destroy() {
    G.scene.remove(this.root);
  }
}
