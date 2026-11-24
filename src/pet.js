// The pet: follows the player, heals them, and pays HP to revive them. If it dies, the run ends.
import * as THREE from 'three';
import { G, enemies } from './game.js';
import { PETS } from './data.js';
import * as M from './models.js';
import { FX } from './effects.js';
import { Audio } from './audio.js';
import { UI } from './ui.js';
import { dampAngle } from './util.js';

const tmp = new THREE.Vector3();
const tmp2 = new THREE.Vector3();

export const BURST_CD = 22;

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
    this.mats = M.collectMats(this.root);
  }

  get healRate() { return this.def.heal + this.upg.mending; }
  recalc() {
    const old = this.maxHp;
    this.maxHp = this.def.hp + this.upg.vitality * 40;
    this.hp = Math.min(this.maxHp, this.hp + Math.max(0, this.maxHp - old));
  }
  isAlive() { return this.alive; }

  takeHit(dmg) {
    if (!this.alive || G.state !== 'playing') return;
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
    this.heal(this.maxHp * 0.12);
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
      this.root.scale.setScalar(Math.max(0.01, 1 - k * 0.6));
      return;
    }
    const p = G.player;
    this.burstCd = Math.max(0, this.burstCd - dt);
    this.lastHurt += dt;

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
    const hop = moving ? Math.abs(Math.sin(this.phase * 0.5)) * (this.id === 'bunny' ? 0.45 : 0.18) : 0;
    this.root.position.set(this.pos.x, this.pos.y + hop, this.pos.z);
    this.root.rotation.set(0, this.yaw, 0);
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

  destroy() {
    G.scene.remove(this.root);
  }
}
