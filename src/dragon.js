// Ignis the Dragon: the final boss. It flies, breathes fire, spits fireballs, dives at you
// and sometimes lands. Riding your winged pet makes it much easier to reach.
import * as THREE from 'three';
import { G } from './game.js';
import { Monster, spawnMonster } from './monsters.js';
import { spawnProjectile, hostileTargetsFor } from './combat.js';
import { FX } from './effects.js';
import { Audio } from './audio.js';
import { UI } from './ui.js';
import { damp, dampAngle, clamp, angleDiff, weightedPick } from './util.js';

const tmp = new THREE.Vector3();
const tmp2 = new THREE.Vector3();
const goal = new THREE.Vector3();
const FIRE = [0xffd27a, 0xffa030, 0xff7a1a, 0xff5a0a, 0xff3a00, 0xe8280a];

export class Dragon extends Monster {
  constructor(nest) {
    super('dragon', nest, 1, { island: 'roost' });
    this.tameable = false;
    this.home = nest.clone();
    this.root.scale.setScalar(1);
    this.spawnT = 1;
    this.v = new THREE.Vector3();
    this.state = 'rise';
    this.stateT = 0;
    this.stateDur = 3;
    this.orbitA = Math.random() * Math.PI * 2;
    this.attackN = 0;
    this.landed = false;
    this.pitch = 0;
    this.roll = 0;
    this.flapPh = 0;
    this.jawOpen = 0;
    this.aimPitch = 0;
    this.aimDir = new THREE.Vector3(0, -0.3, 1).normalize();
    this.mouthPos = new THREE.Vector3();
    this.breathTick = 0;
    this.spitN = 0;
    this.clawed = false;
    this.patches = [];
    this.summonsDone = 0;
    this.roared = false;
    this.retarget = 0;
    this.crashed = false;
  }

  isAlive() { return !this.dead; }

  setState(s, dur) {
    this.state = s;
    this.stateT = 0;
    this.stateDur = dur;
    this.clawed = false;
    this.spitN = 0;
  }

  chooseAttack() {
    this.attackN++;
    const hpK = this.hp / this.maxHp;
    if (hpK < 0.75 && this.attackN % 3 === 0) return this.setState('land', 9);
    const pick = weightedPick([['breath', 4], ['spit', 3], ['swoop', 2.2]]);
    if (pick === 'breath') this.setState('breath', hpK < 0.35 ? 4.2 : 3.6);
    else if (pick === 'spit') this.setState('spit', 2.6);
    else this.setState('swoop', 3.2);
  }

  // Fly toward a point with smooth, banking turns.
  steer(to, speed, dt, k = 2.0) {
    tmp.subVectors(to, this.pos);
    const d = tmp.length();
    const sp = Math.min(speed, d * 1.6);
    if (d > 0.01) tmp.multiplyScalar(sp / d);
    this.v.lerp(tmp, 1 - Math.exp(-k * dt));
  }

  update(dt) {
    if (this.dead) return this.updateDeath(dt);
    this.tickStatus(dt);
    if (this.dead) return true;
    const world = G.world;
    const p = G.player, pet = G.pet;
    const def = this.def;
    const enraged = this.hp / this.maxHp < 0.35;
    const slowK = this.status.slow > 0 ? 0.7 : 1;
    this.stateT += dt;

    // pick who to hunt: mostly you, sometimes your pet when it's on foot
    this.retarget -= dt;
    if (this.retarget <= 0 || !this.target || !this.target.isAlive()) {
      this.retarget = 7;
      const petTarget = pet && pet.alive && !pet.mounted && Math.random() < 0.35;
      this.target = petTarget ? pet : p && p.isAlive() ? p : pet;
    }
    const t = this.target;
    const tDistHome = t ? Math.hypot(t.pos.x - this.home.x, t.pos.z - this.home.z) : 1e9;
    const engaged = t && t.isAlive() && tDistHome < 170;
    if (!engaged && this.state !== 'rise' && this.state !== 'patrol') this.setState('patrol', 1e9);
    if (engaged && this.state === 'patrol') {
      this.setState('orbit', 2);
      if (!this.roared) {
        this.roared = true;
        Audio.play('roar');
        UI.banner('IGNIS ATTACKS', 'Frost hurts it most. Ride your pet (F) to reach it in the sky.', '#ff5a3a');
      }
    }

    const ground = Math.max(world.getHeight(this.pos.x, this.pos.z), -0.15);
    let speed = def.speed * slowK * (enraged ? 1.2 : 1);
    let face = null;
    let breathing = false;
    this.landed = false;
    const tc = t ? tmp2.set(t.pos.x, t.pos.y + t.height * 0.5, t.pos.z) : null;
    // Against a rider it duels at the same height; against someone on foot it stays high above.
    const air = t === p && p && p.mounted;
    const lift = (ground, fly) => (air ? fly : ground);

    switch (this.state) {
      case 'rise': {
        goal.set(this.home.x, this.home.y + 26, this.home.z + 6);
        this.steer(goal, 10, dt);
        if (this.stateT > 0.4 && !this.roared) {
          this.roared = true;
          Audio.play('roar');
          G.shake = Math.max(G.shake, 0.4);
        }
        if (this.stateT > this.stateDur) { this.roared = false; this.setState('patrol', 1e9); }
        break;
      }
      case 'patrol': {
        this.orbitA += dt * 0.32;
        goal.set(this.home.x + Math.cos(this.orbitA) * 40, this.home.y + 30, this.home.z + Math.sin(this.orbitA) * 40);
        this.steer(goal, speed * 0.7, dt);
        break;
      }
      case 'orbit': {
        this.orbitA += dt * (enraged ? 0.75 : 0.55);
        const R = 24;
        goal.set(t.pos.x + Math.cos(this.orbitA) * R, Math.max(t.pos.y + lift(13, 3), Math.max(world.getHeight(t.pos.x, t.pos.z), 0) + lift(12, 6)), t.pos.z + Math.sin(this.orbitA) * R);
        this.steer(goal, speed, dt);
        if (this.stateT > this.stateDur) this.chooseAttack();
        break;
      }
      case 'breath': {
        // hover in front of the target, then pour fire on it
        tmp.set(this.pos.x - t.pos.x, 0, this.pos.z - t.pos.z).normalize();
        goal.set(t.pos.x + tmp.x * 15, t.pos.y + lift(9, 2.5), t.pos.z + tmp.z * 15);
        goal.y = Math.max(goal.y, ground + 6);
        this.steer(goal, speed * 0.6, dt, 3);
        face = Math.atan2(t.pos.x - this.pos.x, t.pos.z - this.pos.z);
        const charge = 0.8;
        if (this.stateT < charge) {
          this.jawOpen = damp(this.jawOpen, 0.6, 6, dt);
          this.rig.throat.visible = true;
          if (this.stateT < dt * 1.5) Audio.play('roar');
        } else if (this.stateT < this.stateDur - 0.3) {
          breathing = true;
          this.jawOpen = damp(this.jawOpen, 1, 10, dt);
        }
        if (this.stateT > this.stateDur) this.setState('orbit', enraged ? 2 : 2.5 + Math.random() * 1.5);
        break;
      }
      case 'spit': {
        tmp.set(this.pos.x - t.pos.x, 0, this.pos.z - t.pos.z).normalize();
        goal.set(t.pos.x + tmp.x * 20, Math.max(t.pos.y + lift(12, 4), ground + 6), t.pos.z + tmp.z * 20);
        this.steer(goal, speed * 0.5, dt, 2.5);
        face = Math.atan2(t.pos.x - this.pos.x, t.pos.z - this.pos.z);
        this.jawOpen = damp(this.jawOpen, 0.5, 8, dt);
        const shots = enraged ? 4 : 3;
        if (this.spitN < shots && this.stateT > 0.5 + this.spitN * 0.55) {
          this.spitN++;
          this.spit(t);
        }
        if (this.stateT > this.stateDur) this.setState('orbit', 2.5 + Math.random() * 1.5);
        break;
      }
      case 'swoop': {
        if (this.stateT < 0.7) {
          // pull up and line up
          tmp.set(this.pos.x - t.pos.x, 0, this.pos.z - t.pos.z).normalize();
          goal.set(t.pos.x + tmp.x * 26, Math.max(t.pos.y + lift(16, 7), ground + 8), t.pos.z + tmp.z * 26);
          this.steer(goal, speed, dt, 3);
          face = Math.atan2(t.pos.x - this.pos.x, t.pos.z - this.pos.z);
        } else {
          if (this.stateT < 0.75) Audio.play('roar');
          goal.set(t.pos.x, t.pos.y + 1.5, t.pos.z);
          if (this.stateT > 1.9) goal.set(this.pos.x + this.v.x, this.pos.y + 14, this.pos.z + this.v.z);
          this.steer(goal, 36 * slowK, dt, 4);
          if (!this.clawed && this.pos.distanceTo(tc) < 5.5) {
            this.clawed = true;
            for (const o of hostileTargetsFor(this)) {
              if (o.pos.distanceTo(this.pos) < 7) o.takeHit(this.dmg * 1.1, this);
            }
            FX.burst(tc, { count: 18, color: 0xffffff, glow: true, speed: 8, size: 0.25, life: 0.4 });
            G.shake = Math.max(G.shake, 0.5);
            Audio.play('slam');
          }
        }
        if (this.stateT > this.stateDur) this.setState('orbit', 2.5 + Math.random() * 1.5);
        break;
      }
      case 'land': {
        const gx = t.pos.x + Math.cos(this.orbitA) * 12, gz = t.pos.z + Math.sin(this.orbitA) * 12;
        const gh = world.getHeight(gx, gz);
        const canLand = world.walkable(gx, gz) && gh > 0.5;
        if (!canLand) { this.setState('orbit', 2); break; }
        if (this.stateT < 2.2) {
          goal.set(gx, gh, gz);
          this.steer(goal, speed * 0.8, dt, 3);
          if (this.pos.y - Math.max(world.getHeight(this.pos.x, this.pos.z), 0) < 1.2) this.stateT = Math.max(this.stateT, 2.2);
        } else {
          this.landed = true;
          this.v.multiplyScalar(Math.exp(-dt * 8));
          face = Math.atan2(t.pos.x - this.pos.x, t.pos.z - this.pos.z);
          const lt = this.stateT - 2.2;
          if (lt < 0.1 && !this.clawed) {
            this.clawed = true;
            G.shake = Math.max(G.shake, 0.6);
            Audio.play('slam');
            FX.ring(tmp.set(this.pos.x, world.getHeight(this.pos.x, this.pos.z), this.pos.z), 0xff6a1a, 8, 0.6);
          }
          if (lt > 1.6 && lt < 1.6 + dt * 1.5) this.tailSweep();
          if (lt > 2.6 && lt < 5.2) {
            breathing = true;
            this.jawOpen = damp(this.jawOpen, 1, 10, dt);
            face = this.yaw + Math.sin((lt - 2.6) * 1.6) * 0.06;
          }
          if (lt > 6) this.setState('orbit', 2.5);
        }
        break;
      }
    }

    // summon imps at 66% and 33% health
    const hpK = this.hp / this.maxHp;
    if (this.summonsDone < 2 && hpK < (this.summonsDone === 0 ? 0.66 : 0.33)) {
      this.summonsDone++;
      this.summon();
    }

    // integrate
    this.pos.addScaledVector(this.v, dt);
    const gh = Math.max(world.getHeight(this.pos.x, this.pos.z), -0.15);
    if (this.landed) this.pos.y = damp(this.pos.y, world.getHeight(this.pos.x, this.pos.z), 10, dt);
    else if (this.pos.y < gh + (this.state === 'land' ? 0 : 3.5)) {
      this.pos.y = damp(this.pos.y, gh + (this.state === 'land' ? 0 : 3.5), 6, dt);
      this.v.y = Math.max(this.v.y, 0);
    }
    if (this.pos.y > 110) this.pos.y = 110;

    // orientation: face flight direction, or the target while attacking
    const hs = Math.hypot(this.v.x, this.v.z);
    const prevYaw = this.yaw;
    if (face === null && hs > 3) face = Math.atan2(this.v.x, this.v.z);
    if (face !== null) this.yaw = dampAngle(this.yaw, face, 3.2, dt);
    const turn = angleDiff(prevYaw, this.yaw) / Math.max(dt, 1e-4);
    this.roll = damp(this.roll, this.landed ? 0 : clamp(-turn * 0.35, -0.6, 0.6), 4, dt);
    this.pitch = damp(this.pitch, this.landed ? 0 : clamp(-this.v.y * 0.03, -0.45, 0.45), 4, dt);

    // aim the head (and the fire) at the target
    this.root.updateMatrixWorld(true);
    this.rig.mouth.getWorldPosition(this.mouthPos);
    if (tc) {
      tmp.subVectors(tc, this.mouthPos);
      const flat = Math.hypot(tmp.x, tmp.z);
      this.aimPitch = damp(this.aimPitch, clamp(Math.atan2(-tmp.y, flat), -0.3, 1.2), 4, dt);
      tmp.normalize();
      this.aimDir.lerp(tmp, 1 - Math.exp(-(breathing ? 2.2 : 6) * dt)).normalize();
    }
    if (!breathing && this.state !== 'breath') {
      this.jawOpen = damp(this.jawOpen, 0, 5, dt);
      this.rig.throat.visible = false;
    }
    if (breathing) this.breathe(dt);
    const light = G.fireLight;
    if (light) {
      if (breathing) {
        light.position.copy(this.mouthPos).addScaledVector(this.aimDir, 7);
        light.intensity = 45 + Math.random() * 30;
      } else light.intensity = damp(light.intensity, 0, 10, dt);
    }
    this.updatePatches(dt);

    // embers drift off the dragon's body
    if (Math.random() < dt * 8) FX.burst(tmp.set(this.pos.x, this.pos.y + 3, this.pos.z), { count: 1, color: 0xff7a2a, glow: true, speed: 1, up: 1, size: 0.22, life: 0.8, gravity: -1, spread: 3 });

    this.animate(dt);
    this.updateVisual(dt);
    return true;
  }

  // Fire cone from the mouth: hurts everything friendly inside it and sets the ground alight.
  breathe(dt) {
    const n = Math.min(14, Math.ceil(dt * 60 * 9));
    FX.jet(this.mouthPos, this.aimDir, { count: n, colors: FIRE, speed: 30, spread: 0.16, size: 0.4, size1: 2.2, life: 0.75, gravity: -4, drag: 0.7, intensity: 1.7 });
    if (Math.random() < dt * 25) FX.jet(this.mouthPos, this.aimDir, { count: 2, colors: [0xffe9a0], speed: 34, spread: 0.05, size: 0.5, size1: 0.3, life: 0.35, intensity: 2.4 });
    if (Math.random() < dt * 10) FX.jet(this.mouthPos, this.aimDir, { count: 1, colors: [0x3a2420], speed: 18, spread: 0.3, size: 0.6, size1: 2.4, life: 1.1, gravity: -5, intensity: 0.6 });
    if (Math.random() < dt * 6) Audio.play('breath');
    this.breathTick -= dt;
    if (this.breathTick <= 0) {
      this.breathTick = 0.25;
      const dmg = this.dmg * 0.9 * 0.25 * (this.hp / this.maxHp < 0.35 ? 1.2 : 1);
      for (const f of hostileTargetsFor(this)) {
        tmp.set(f.pos.x, f.pos.y + f.height * 0.5, f.pos.z).sub(this.mouthPos);
        const along = tmp.dot(this.aimDir);
        if (along < 0 || along > 30) continue;
        const perp = tmp.addScaledVector(this.aimDir, -along).length();
        if (perp < 1.2 + along * 0.2 + f.radius) f.takeHit(dmg, this);
      }
      // where the fire meets the ground, it keeps burning for a while
      const hit = this.groundHit();
      if (hit && this.patches.length < 16) this.patches.push({ x: hit.x, y: hit.y, z: hit.z, t: 4.5, tick: 0 });
    }
  }

  groundHit() {
    const world = G.world;
    for (let d = 2; d < 34; d += 1.5) {
      tmp.copy(this.mouthPos).addScaledVector(this.aimDir, d);
      const gh = world.getHeight(tmp.x, tmp.z);
      if (tmp.y <= gh) return gh > -0.5 ? tmp.set(tmp.x, gh, tmp.z).clone() : null;
    }
    return null;
  }

  updatePatches(dt) {
    for (let i = this.patches.length - 1; i >= 0; i--) {
      const pt = this.patches[i];
      pt.t -= dt;
      if (pt.t <= 0) { this.patches.splice(i, 1); continue; }
      if (Math.random() < dt * 14) {
        FX.burst(tmp.set(pt.x + (Math.random() - 0.5) * 3, pt.y + 0.2, pt.z + (Math.random() - 0.5) * 3), { count: 1, color: Math.random() < 0.5 ? 0xff8a1a : 0xffc040, glow: true, speed: 0.6, up: 3, size: 0.4, size1: 0.1, life: 0.6, gravity: -2 });
      }
      pt.tick -= dt;
      if (pt.tick <= 0) {
        pt.tick = 0.5;
        for (const f of hostileTargetsFor(this)) {
          if (Math.hypot(f.pos.x - pt.x, f.pos.z - pt.z) < 2.4 + f.radius && Math.abs(f.pos.y - pt.y) < 2) f.takeHit(this.dmg * 0.18, this);
        }
      }
    }
  }

  spit(t) {
    const from = this.mouthPos.clone();
    const aim = new THREE.Vector3(t.pos.x, t.pos.y + t.height * 0.5, t.pos.z);
    const speed = 30;
    const flight = from.distanceTo(aim) / speed;
    if (t.vel) aim.addScaledVector(tmp.set(t.vel.x, t.vel.y * 0.5, t.vel.z), flight * 0.8);
    const vel = aim.sub(from).normalize().multiplyScalar(speed);
    spawnProjectile({ pos: from, vel, team: 'enemy', kind: 'dragonfire', dmg: this.dmg * 0.85, owner: this, radius: 1.0, life: 4, aoe: 4.2 });
    FX.jet(from, this.aimDir, { count: 10, colors: FIRE, speed: 10, spread: 0.4, size: 0.4, size1: 1.2, life: 0.4 });
    Audio.play('fireball');
  }

  tailSweep() {
    FX.ring(tmp.set(this.pos.x, G.world.getHeight(this.pos.x, this.pos.z), this.pos.z), 0xffa040, 9, 0.5);
    FX.burst(tmp.set(this.pos.x, this.pos.y + 0.5, this.pos.z), { count: 26, color: 0x6a5a50, speed: 9, size: 0.35, life: 0.7, floor: true });
    Audio.play('slam');
    for (const o of hostileTargetsFor(this)) {
      if (Math.hypot(o.pos.x - this.pos.x, o.pos.z - this.pos.z) < 9 + o.radius && Math.abs(o.pos.y - this.pos.y) < 4) o.takeHit(this.dmg, this);
    }
  }

  summon() {
    const t = this.target || G.player;
    if (!t) return;
    let n = 0;
    for (let i = 0; i < 2; i++) {
      const a = Math.random() * Math.PI * 2;
      const x = t.pos.x + Math.cos(a) * 9, z = t.pos.z + Math.sin(a) * 9;
      if (!G.world.walkable(x, z)) continue;
      spawnMonster('imp', new THREE.Vector3(x, G.world.getHeight(x, z), z), 6, { island: 'roost' });
      n++;
    }
    Audio.play('roar');
    UI.notify(n ? 'Ignis calls its Ember Imps!' : 'Ignis roars in fury!', '#ff7a4a');
  }

  animate(dt) {
    const r = this.rig;
    const hover = Math.hypot(this.v.x, this.v.z) < 6;
    this.flapPh += dt * (this.landed ? 0 : this.v.y > 2 ? 8 : hover ? 6.5 : 4.2);
    const flap = Math.sin(this.flapPh);
    if (this.landed) {
      r.wingR.rotation.set(0.1, -0.9, 0.35);
      r.wingL.rotation.set(0.1, 0.9, -0.35);
      r.body.position.y = damp(r.body.position.y, 3.6, 6, dt);
    } else {
      r.wingR.rotation.set(0, -0.1, flap * 0.7 + 0.12);
      r.wingL.rotation.set(0, 0.1, -(flap * 0.7 + 0.12));
      r.body.position.y = 3.6 - flap * 0.35;
    }
    const ap = this.aimPitch;
    r.neck[0].rotation.x = -0.45 + ap * 0.35;
    r.neck[1].rotation.x = 0.12 + ap * 0.3;
    r.neck[2].rotation.x = 0.22 + ap * 0.3;
    r.head.rotation.x = ap * 0.2 - this.jawOpen * 0.15;
    r.jaw.rotation.x = this.jawOpen * 0.65;
    r.tail.forEach((s, i) => {
      s.rotation.y = Math.sin(G.time * 2 - i * 0.6) * 0.12;
      s.rotation.x = this.landed ? 0.04 : 0.02 - this.pitch * 0.1;
    });
    for (const l of r.legs) {
      l.hip.rotation.x = damp(l.hip.rotation.x, this.landed ? 0 : 0.95, 6, dt);
      l.knee.rotation.x = damp(l.knee.rotation.x, this.landed ? 0 : -0.7, 6, dt);
    }
  }

  updateVisual(dt) {
    this.root.position.copy(this.pos);
    this.root.rotation.set(this.pitch, this.yaw, this.roll, 'YXZ');
    this.updateFlash(dt);
  }

  // Falls out of the sky, crashes, then sinks away.
  updateDeath(dt) {
    this.deathT += dt;
    const world = G.world;
    if (G.fireLight) G.fireLight.intensity = damp(G.fireLight.intensity, 0, 8, dt);
    this.rig.throat.visible = false;
    if (!this.crashed) {
      this.v.y -= 22 * dt;
      this.v.x *= Math.exp(-dt * 0.5);
      this.v.z *= Math.exp(-dt * 0.5);
      this.pos.addScaledVector(this.v, dt);
      this.roll += dt * 1.6;
      this.pitch = damp(this.pitch, 0.5, 2, dt);
      if (Math.random() < dt * 30) FX.burst(tmp.set(this.pos.x, this.pos.y + 3, this.pos.z), { count: 2, color: FIRE[Math.floor(Math.random() * 5)], glow: true, speed: 3, up: 2, size: 0.6, size1: 0.1, life: 0.8, gravity: -2, spread: 3 });
      const gh = Math.max(world.getHeight(this.pos.x, this.pos.z), -0.15);
      if (this.pos.y <= gh || this.deathT > 6) {
        this.pos.y = gh;
        this.crashed = true;
        this.crashT = 0;
        this.roll = 0.4;
        G.shake = 1.4;
        Audio.play('boom');
        FX.burst(tmp.set(this.pos.x, gh + 2, this.pos.z), { count: 80, color: 0xff8a1a, glow: true, speed: 16, up: 6, size: 0.7, size1: 0.1, life: 1.2, gravity: 6 });
        FX.burst(tmp.set(this.pos.x, gh + 1, this.pos.z), { count: 40, color: 0x4a3a30, speed: 12, size: 0.6, life: 1.4, floor: true });
        FX.ring(tmp.set(this.pos.x, gh, this.pos.z), 0xffa040, 16, 0.9);
      }
    } else {
      this.crashT += dt;
      if (this.crashT > 3) this.pos.y -= dt * 0.8;
      if (Math.random() < dt * 10) FX.burst(tmp.set(this.pos.x, this.pos.y + 3, this.pos.z), { count: 1, color: 0x5a4a44, speed: 1, up: 3, size: 0.6, life: 1.2, gravity: -1, spread: 4 });
    }
    this.animate(dt);
    this.root.position.copy(this.pos);
    this.root.rotation.set(this.pitch, this.yaw, this.roll, 'YXZ');
    return !this.crashed || this.crashT < 9;
  }
}
