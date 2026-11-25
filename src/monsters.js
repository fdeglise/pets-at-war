// Monsters: AI, animation, death, taming. Tamed monsters become allies that hunt.
import * as THREE from 'three';
import { G, enemies, allies, diff } from './game.js';
import { MONSTERS, MAX_ALLIES, rollItem } from './data.js';
import * as M from './models.js';
import { FX } from './effects.js';
import { Audio } from './audio.js';
import { UI } from './ui.js';
import { hitMonster, spawnProjectile, hostileTargetsFor } from './combat.js';
import { spawnCoins, spawnDrop } from './loot.js';
import { Waves } from './waves.js';
import { dampAngle } from './util.js';
import { islandAt } from './world.js';

const tmp = new THREE.Vector3();
const tmpB = new THREE.Vector3();

export class Monster {
  constructor(type, pos, level, opts = {}) {
    this.type = type;
    this.island = opts.island ?? islandAt(pos.x, pos.z) ?? 'haven';
    this.wave = !!opts.wave;
    this.dormant = !!opts.dormant;
    this.def = MONSTERS[type];
    this.rig = M.makeMonster(type);
    this.root = this.rig.root;
    this.pos = pos.clone();
    this.vel = new THREE.Vector3();
    this.knock = new THREE.Vector3();
    this.yaw = Math.random() * Math.PI * 2;
    this.radius = this.rig.radius;
    this.height = this.rig.height;
    this.level = level;
    this.applyLevel(level);
    this.hp = this.maxHp;
    this.cd = 0.8 + Math.random();
    this.windup = 0;
    this.attackAnim = 0;
    this.phase = Math.random() * 10;
    this.moveAmt = 0;
    this.status = { burn: 0, burnDps: 0, slow: 0, poison: 0, poisonStacks: 0, poisonDps: 0 };
    this.dot = 0;
    this.dotShown = 0;
    this.dotTimer = 0;
    this.flashT = 0;
    this.spawnT = 0;
    this.dead = false;
    this.deathT = 0;
    this.ally = false;
    this.tameable = !this.def.boss && Math.random() < 0.38;
    this.enrage = 0;
    this.retarget = 0;
    this.target = null;
    this.summonCd = this.def.summonCd ?? 9;
    this.throwCd = 3;
    this.attackKind = null;
    this.lastHitT = 99;
    this.mats = M.collectMats(this.root);
    this.root.position.copy(this.pos);
    this.root.scale.setScalar(0.01);
    G.scene.add(this.root);
  }

  applyLevel(l) {
    const k = this.def.fixedLevel ? 0 : Math.max(0, l - 1);
    // the difficulty only scales your foes; tamed allies keep their full strength
    const D = this.ally ? { enemyHp: 1, enemyDmg: 1 } : diff();
    this.maxHp = Math.round(this.def.hp * (1 + 0.16 * k) * D.enemyHp);
    this.dmg = this.def.dmg * (1 + 0.09 * k) * D.enemyDmg;
    this.level = l;
  }

  isAlive() { return !this.dead; }

  // Called when an enemy hits this monster (only relevant for allies).
  takeHit(dmg) {
    hitMonster(this, { dmg }, { silent: true });
  }

  // Bosses wake up when you come close or hit them.
  wake() {
    if (!this.dormant) return;
    this.dormant = false;
    this.cd = 1.2;
    G.onWake && G.onWake(this);
  }

  pickTarget() {
    if (this.ally) {
      // Allies seek out monsters anywhere on their island.
      let best = null, bd = 1e9;
      for (const e of enemies()) {
        if (e.island !== this.island || e.dormant) continue;
        const d = e.pos.distanceToSquared(this.pos);
        if (d < bd) { bd = d; best = e; }
      }
      return best;
    }
    let best = null, bs = 1e9;
    for (const t of hostileTargetsFor(this)) {
      if (t === G.pet && t.mounted) continue; // a ridden pet: go for the rider
      let s = t.pos.distanceTo(this.pos);
      if (t === G.pet) s *= this.def.huntsPet ? 0.45 : 0.9;
      if (t.ally) s *= 1.15;
      // melee monsters can't reach someone flying overhead: prefer targets on the ground
      if (!this.def.ranged && Math.abs(t.pos.y - this.pos.y) > 3.2) s *= 4;
      if (s < bs) { bs = s; best = t; }
    }
    return best;
  }

  update(dt) {
    const world = G.world;
    if (this.dead) {
      this.deathT += dt;
      const k = Math.min(1, this.deathT / 0.45);
      this.root.rotation.z = k * 1.4;
      this.root.scale.setScalar(Math.max(0.01, 1 - k * k));
      this.root.position.y = this.pos.y + k * 0.3;
      return this.deathT < 0.5;
    }
    this.spawnT = Math.min(1, this.spawnT + dt * 2.2);
    const sp = this.spawnT;
    this.root.scale.setScalar(sp < 1 ? Math.max(0.01, 1 - Math.pow(1 - sp, 3) + Math.sin(sp * Math.PI) * 0.15) : 1);

    this.tickStatus(dt);
    if (this.dead) return true;
    if (this.dormant) {
      // frozen in place until woken
      if (Math.random() < dt * 5) FX.burst(tmp.set(this.pos.x, this.pos.y + this.height * Math.random(), this.pos.z), { count: 1, color: 0xbff2ff, glow: true, speed: 0.6, up: 0.6, size: 0.2, life: 0.9, gravity: -0.5, spread: this.radius * 2 });
      this.updateVisual(dt);
      return true;
    }

    this.retarget -= dt;
    if (this.retarget <= 0 || !this.target || !this.target.isAlive()) {
      this.target = this.pickTarget();
      this.retarget = 0.8 + Math.random() * 0.5;
    }
    let t = this.target;
    let goal = null;
    let dist = 1e9;
    if (t) {
      goal = t.pos;
      dist = Math.hypot(t.pos.x - this.pos.x, t.pos.z - this.pos.z);
    } else if (this.ally && G.player) {
      // nothing to hunt: stay near the player
      const p = G.player.pos;
      const ang = (G.monsters.indexOf(this) * 2.1) % (Math.PI * 2);
      goal = tmpB.set(p.x + Math.cos(ang) * 4, p.y, p.z + Math.sin(ang) * 4);
      dist = Math.hypot(goal.x - this.pos.x, goal.z - this.pos.z);
      if (dist < 1.5) goal = null;
    }

    const def = this.def;
    const slowK = this.status.slow > 0 ? 0.55 : 1;
    const speed = def.speed * slowK * (this.enrage > 0 ? 1.35 : 1) * (this.ally ? 1.15 : 1) * (this.windup > 0 ? 0.15 : 1);
    const reach = def.range + (t ? t.radius : 0) + this.radius * 0.5;
    let dx = 0, dz = 0;
    if (goal) {
      const gx = goal.x - this.pos.x, gz = goal.z - this.pos.z;
      const gl = Math.hypot(gx, gz) || 1;
      if (def.ranged && t) {
        if (dist > def.range * 0.85) { dx = gx / gl; dz = gz / gl; }
        else if (dist < def.range * 0.4) { dx = -gx / gl * 0.6; dz = -gz / gl * 0.6; }
      } else if (!t || dist > reach * 0.8) { dx = gx / gl; dz = gz / gl; }
    }
    // separation
    for (const o of G.monsters) {
      if (o === this || o.dead) continue;
      const ox = this.pos.x - o.pos.x, oz = this.pos.z - o.pos.z;
      const rr = this.radius + o.radius;
      const d2 = ox * ox + oz * oz;
      if (d2 < rr * rr && d2 > 1e-5) {
        const d = Math.sqrt(d2);
        const push = (rr - d) / rr;
        dx += (ox / d) * push * 1.6;
        dz += (oz / d) * push * 1.6;
      }
    }
    const dl = Math.hypot(dx, dz);
    if (dl > 1) { dx /= dl; dz /= dl; }
    this.vel.x += (dx * speed - this.vel.x) * Math.min(1, dt * 8);
    this.vel.z += (dz * speed - this.vel.z) * Math.min(1, dt * 8);
    const ox = this.pos.x, oz = this.pos.z;
    this.pos.x += (this.vel.x + this.knock.x) * dt;
    this.pos.z += (this.vel.z + this.knock.z) * dt;
    this.knock.multiplyScalar(Math.exp(-dt * 7));
    world.collide(this.pos, this.radius * 0.8);
    if (!world.walkable(this.pos.x, this.pos.z)) { this.pos.x = ox; this.pos.z = oz; }
    // the Easy-mode shelter's barrier keeps every enemy out
    if (!this.ally && world.shelter) world.shelter.repel(this);
    this.pos.y = world.getHeight(this.pos.x, this.pos.z);
    const moved = Math.hypot(this.pos.x - ox, this.pos.z - oz) / Math.max(dt, 1e-4);
    this.moveAmt += (Math.min(1, moved / Math.max(1, def.speed)) - this.moveAmt) * Math.min(1, dt * 10);
    this.phase += dt * (4 + moved * 1.4);

    // facing
    let face = null;
    if (t && (dist < reach * 2 || def.ranged)) face = Math.atan2(t.pos.x - this.pos.x, t.pos.z - this.pos.z);
    else if (moved > 0.3) face = Math.atan2(this.vel.x, this.vel.z);
    if (face !== null) this.yaw = dampAngle(this.yaw, face, 10, dt);

    // attacks
    this.cd -= dt;
    this.throwCd -= dt;
    if (this.enrage > 0) this.enrage -= dt;
    const dy = t ? t.pos.y - this.pos.y : 0;
    const canReach = def.ranged || Math.abs(dy) < 3.2;
    if (t && canReach && this.windup <= 0 && this.cd <= 0 && dist <= reach && this.spawnT >= 1) {
      this.windup = def.windup;
      this.attackKind = 'main';
      this.attackTarget = t;
      if (this.type === 'imp') this.rig.fireball.visible = true;
    } else if (t && def.throws && this.windup <= 0 && this.throwCd <= 0 && dist > reach * 1.3 && dist < 40 && this.spawnT >= 1) {
      // bosses hurl boulders at targets that stay out of reach
      this.windup = 1.0;
      this.attackKind = 'throw';
      this.attackTarget = t;
      if (this.rig.boulder) this.rig.boulder.visible = true;
    }
    if (this.windup > 0) {
      this.windup -= dt;
      if (this.windup <= 0) this.performAttack();
    }
    this.attackAnim = Math.max(0, this.attackAnim - dt * 3);

    if (def.summon && t) {
      this.summonCd -= dt;
      if (this.summonCd <= 0 && !this.ally) {
        this.summonCd = def.summonCd ?? 11;
        summonMinions(this, def.summon, 3);
      }
    }

    this.animate(dt);
    this.updateVisual(dt);
    return true;
  }

  tickStatus(dt) {
    const s = this.status;
    let dps = 0;
    if (s.burn > 0) {
      s.burn -= dt;
      dps += s.burnDps;
      if (Math.random() < dt * 14) FX.burst(tmp.set(this.pos.x, this.pos.y + this.height * 0.6, this.pos.z), { count: 1, color: 0xff7a2a, glow: true, speed: 1.2, up: 2.5, size: 0.22, life: 0.45, gravity: -2, spread: this.radius });
    }
    if (s.poison > 0) {
      s.poison -= dt;
      dps += s.poisonDps * s.poisonStacks;
      if (Math.random() < dt * 8) FX.burst(tmp.set(this.pos.x, this.pos.y + this.height * 0.7, this.pos.z), { count: 1, color: 0x86ff3a, glow: true, speed: 0.8, up: 1.5, size: 0.18, life: 0.6, gravity: -1, spread: this.radius });
    } else s.poisonStacks = 0;
    if (s.slow > 0) {
      s.slow -= dt;
      if (Math.random() < dt * 6) FX.burst(tmp.set(this.pos.x, this.pos.y + this.height * 0.5, this.pos.z), { count: 1, color: 0x9fefff, glow: true, speed: 0.6, up: 0.2, size: 0.15, life: 0.5, gravity: 2, spread: this.radius * 1.2 });
    }
    if (dps > 0) {
      this.dot += dps * dt;
      this.dotTimer += dt;
      if (this.dot >= 1) {
        const d = Math.floor(this.dot);
        this.dot -= d;
        this.hp -= d;
        this.dotShown += d;
      }
      if (this.dotTimer > 0.6 && this.dotShown > 0) {
        UI.dmg(tmp.set(this.pos.x, this.pos.y + this.height * 0.9, this.pos.z), String(this.dotShown), s.burn > 0 ? '#ff9a4a' : '#9bff5c', 'small');
        this.dotShown = 0;
        this.dotTimer = 0;
      }
      if (this.hp <= 0) killMonster(this);
    }
  }

  performAttack() {
    const t = this.attackTarget;
    const def = this.def;
    const kind = this.attackKind;
    this.attackKind = null;
    this.attackAnim = 1;
    if (this.type === 'imp') this.rig.fireball.visible = false;
    if (kind === 'throw') {
      this.throwCd = def.throwCd ?? 6;
      if (this.rig.boulder) this.rig.boulder.visible = false;
      if (t && t.isAlive()) throwBoulder(this, t);
      return;
    }
    this.cd = def.rate * (0.85 + Math.random() * 0.3);
    if (!t || !t.isAlive()) return;
    if (def.ranged) {
      const from = new THREE.Vector3(this.pos.x, this.pos.y + this.height * 0.65, this.pos.z);
      const aim = new THREE.Vector3(t.pos.x, t.pos.y + t.height * 0.5, t.pos.z);
      const flight = from.distanceTo(aim) / def.projSpeed;
      if (t.vel) aim.addScaledVector(tmp.set(t.vel.x, 0, t.vel.z), flight * 0.6);
      const dir = aim.sub(from).normalize();
      spawnProjectile({
        pos: from, vel: dir.multiplyScalar(def.projSpeed),
        team: this.ally ? 'ally' : 'enemy', kind: def.ranged,
        dmg: this.dmg, hit: { dmg: this.dmg }, owner: this, radius: def.ranged === 'fireball' ? 0.4 : 0.25, life: 2.5,
      });
      Audio.play(def.ranged === 'fireball' ? 'fireball' : 'bow');
      return;
    }
    if (def.slam) {
      // ground slam hits everything hostile around
      const r = def.slam;
      FX.ring(this.pos, def.frost ? 0x8fe8ff : def.boss ? 0xc56bff : 0xd8b48a, r, 0.5);
      FX.burst(tmp.set(this.pos.x, this.pos.y + 0.3, this.pos.z), { count: 22, color: def.frost ? 0xdff4ff : 0x9a8a72, speed: 7, size: 0.28, life: 0.7, floor: true });
      if (def.frost) FX.burst(tmp.set(this.pos.x, this.pos.y + 0.6, this.pos.z), { count: 30, color: 0x9fefff, glow: true, speed: 9, up: 1, size: 0.22, life: 0.6, gravity: 2 });
      Audio.play('slam');
      if (G.player && G.player.pos.distanceTo(this.pos) < 30) G.shake = Math.max(G.shake, this.def.boss ? 0.6 : 0.35);
      for (const o of hostileTargetsFor(this)) {
        if (Math.abs(o.pos.y - this.pos.y) > 3) continue;
        if (Math.hypot(o.pos.x - this.pos.x, o.pos.z - this.pos.z) < r + o.radius) {
          o.takeHit(this.dmg, this);
          if (def.frost && o.slowFor) o.slowFor(2.5);
        }
      }
      return;
    }
    const dist = Math.hypot(t.pos.x - this.pos.x, t.pos.z - this.pos.z);
    if (dist <= (def.range + t.radius + this.radius * 0.5) * 1.3 && Math.abs(t.pos.y - this.pos.y) < 3.6) {
      if (t instanceof Monster) hitMonster(t, { dmg: this.dmg }, { dir: tmp.set(t.pos.x - this.pos.x, 0, t.pos.z - this.pos.z).normalize(), knock: 3 });
      else t.takeHit(this.dmg, this);
    }
  }

  animate(dt) {
    const r = this.rig;
    const mv = this.moveAmt;
    const ph = this.phase;
    const wind = this.windup > 0 ? Math.max(0, 1 - this.windup / (this.attackKind === 'throw' ? 1.0 : this.def.windup)) : 0;
    const atk = this.attackAnim;
    switch (this.type) {
      case 'slime': {
        const hop = Math.abs(Math.sin(ph * 0.9));
        r.body.position.y = hop * 0.55 * mv;
        const sq = Math.cos(ph * 1.8) * 0.12 * mv;
        let sy = 1 + sq, sxz = 1 - sq * 0.6;
        if (wind > 0) { sy = 1 - wind * 0.3; sxz = 1 + wind * 0.2; }
        if (atk > 0) { sy = 1 + atk * 0.25; sxz = 1 - atk * 0.12; r.body.position.z = atk * 0.6; } else r.body.position.z = 0;
        r.body.scale.set(sxz, sy, sxz);
        break;
      }
      case 'wolf': {
        const s = Math.sin(ph) * 0.9 * mv;
        r.legs[0].rotation.x = s; r.legs[3].rotation.x = s;
        r.legs[1].rotation.x = -s; r.legs[2].rotation.x = -s;
        r.body.position.y = 0.95 + Math.abs(Math.cos(ph)) * 0.1 * mv;
        r.tail.rotation.y = Math.sin(G.time * 8) * 0.4;
        r.head.position.z = 0.98 + atk * 0.4 - wind * 0.15;
        r.body.rotation.x = -wind * 0.15 + atk * 0.2;
        break;
      }
      case 'imp': {
        r.body.position.y = 0.55 + Math.sin(G.time * 3 + ph) * 0.15;
        r.wingL.rotation.y = 0.4 + Math.sin(G.time * 22) * 0.5;
        r.wingR.rotation.y = -0.4 - Math.sin(G.time * 22) * 0.5;
        r.hipL.rotation.x = 0.3 + Math.sin(G.time * 3) * 0.1;
        r.hipR.rotation.x = 0.2 - Math.sin(G.time * 3) * 0.1;
        r.shR.rotation.x = wind > 0 ? -2.6 * wind : -atk * 1.8;
        r.shL.rotation.x = -0.3;
        r.fireball.scale.setScalar(0.3 + wind * 0.9);
        r.body.rotation.x = 0.15 * mv;
        break;
      }
      case 'skeleton': {
        M.walkRig(r, ph, mv, 0.3);
        if (wind > 0 || atk > 0) {
          r.shL.rotation.x = -1.55;
          r.shR.rotation.x = -1.5;
          r.shR.rotation.y = -0.4 + wind * 0.3;
        } else r.shR.rotation.y = 0;
        break;
      }
      case 'golem': {
        M.walkRig(r, ph * 0.7, mv, 0.5);
        r.body.position.y *= 1.4;
        if (wind > 0) { r.shL.rotation.x = r.shR.rotation.x = -2.8 * wind; }
        else if (atk > 0) { r.shL.rotation.x = r.shR.rotation.x = -2.8 * Math.max(0, atk - 0.7) * 3; }
        r.body.rotation.y = Math.sin(ph * 0.7) * 0.06 * mv;
        break;
      }
      case 'ogre': {
        M.walkRig(r, ph * 0.8, mv, 0.6);
        if (wind > 0) { r.shR.rotation.x = -2.9 * wind; r.shL.rotation.x = -1.2 * wind; }
        else if (atk > 0) { r.shR.rotation.x = -0.3 * atk; }
        break;
      }
      case 'titan': {
        M.walkRig(r, ph * 0.6, mv, 0.45);
        r.body.position.y *= 1.6;
        const throwing = this.attackKind === 'throw';
        if (wind > 0 && throwing) { r.shR.rotation.x = -3.0 * wind; r.shL.rotation.x = -0.6 * wind; }
        else if (wind > 0) { r.shL.rotation.x = r.shR.rotation.x = -2.9 * wind; }
        else if (atk > 0) { r.shL.rotation.x = r.shR.rotation.x = -2.9 * Math.max(0, atk - 0.7) * 3; }
        r.neck.rotation.y = Math.sin(G.time * 0.7) * 0.15;
        break;
      }
    }
  }

  updateVisual(dt) {
    this.root.position.copy(this.pos);
    this.root.rotation.set(0, this.yaw, 0);
    this.updateFlash(dt);
    if (this.ally && this.allyRing) this.allyRing.rotation.z += dt;
  }

  updateFlash(dt) {
    if (this.flashT > 0) {
      this.flashT -= dt;
      M.setFlash(this.mats, this.flashT > 0 ? 0.9 : 0);
    } else if (this.windup > 0 && this.def.windup >= 0.5) {
      // telegraph heavy attacks with a red pulse
      M.setFlash(this.mats, 0.35 + Math.sin(G.time * 30) * 0.2, 0xff2a2a);
      this.telegraph = true;
    } else if (this.telegraph) {
      this.telegraph = false;
      M.setFlash(this.mats, 0);
    }
  }

  destroy() {
    G.scene.remove(this.root);
    M.disposeMats(this.root);
  }
}

export function spawnMonster(type, pos, level, opts = {}) {
  const m = new Monster(type, pos, level, opts);
  G.monsters.push(m);
  FX.burst(tmp.set(pos.x, pos.y + 1, pos.z), { count: 16, color: 0xc56bff, glow: true, speed: 5, size: 0.22, life: 0.6 });
  return m;
}

export function killMonster(m) {
  if (m.dead) return;
  m.dead = true;
  m.deathT = 0;
  M.setFlash(m.mats, 0);
  const center = tmp.set(m.pos.x, m.pos.y + m.height * 0.5, m.pos.z);
  FX.burst(center, { count: m.def.boss ? 50 : 20, color: m.def.color, speed: 7, size: 0.3, life: 0.9, floor: true, gravity: 18 });
  FX.burst(center, { count: 10, color: 0xffffff, glow: true, speed: 4, size: 0.2, life: 0.4 });
  Audio.play('die');
  if (m.ally) {
    UI.notify(`Your ${m.def.name} was defeated`, '#ff8f8f');
    UI.refreshAllies();
    return;
  }
  G.stats.kills++;
  G.onKill && G.onKill(m);
  const wave = Math.max(1, Waves.n, m.level);
  const coins = Math.round(m.def.coins * (1 + 0.1 * (wave - 1)) * diff().coins);
  spawnCoins(m.pos, coins);
  const dropChance = m.def.boss ? 1 : m.type === 'golem' ? 0.22 : 0.075;
  if (Math.random() < dropChance) spawnDrop(m.pos.clone(), rollItem(wave, m.def.boss ? 1 : m.type === 'golem' ? 0.3 : 0));
  if (m.def.boss) {
    G.stats.bosses++;
    if (m.type !== 'dragon') UI.banner(`${m.def.name.toUpperCase()} DEFEATED`, `+${coins} coins and a rare drop`, '#c56bff');
    G.shake = 0.6;
  }
}

// Chance that pressing E tames this monster (the difficulty nudges it up or down).
export const tameChance = (m) => Math.min(0.95, Math.max(0.05, m.def.tame + diff().tame));

export function tryTame(m) {
  if (allies().length >= MAX_ALLIES) {
    UI.notify(`You can only have ${MAX_ALLIES} tamed allies`, '#ffb3b3');
    Audio.play('error');
    return;
  }
  m.tameable = false;
  if (Math.random() < tameChance(m)) {
    m.ally = true;
    m.wave = false;
    m.status.burn = m.status.poison = m.status.slow = 0;
    m.target = null;
    m.applyLevel(Math.max(m.level, Waves.n));
    m.hp = Math.round(m.maxHp * 0.75);
    const ring = new THREE.Mesh(
      M.cached('allyRingGeo', () => new THREE.RingGeometry(0.85, 1, 40).rotateX(-Math.PI / 2)),
      M.cached('allyRingMat', () => {
        const mm = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x4fb4ff).multiplyScalar(2), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
        mm.userData.shared = true;
        return mm;
      })
    );
    ring.position.y = 0.08;
    ring.scale.setScalar(m.radius * 1.5);
    m.root.add(ring);
    m.allyRing = ring;
    G.stats.tamed++;
    FX.burst(tmp.set(m.pos.x, m.pos.y + m.height, m.pos.z), { count: 24, color: 0xff6fa8, glow: true, speed: 4, up: 3, size: 0.24, life: 0.9, gravity: 2 });
    FX.ring(m.pos, 0x4fb4ff, 3, 0.6);
    Audio.play('tame');
    UI.notify(`${m.def.name} tamed! It will hunt other monsters for you.`, '#7fd0ff');
    UI.refreshAllies();
  } else {
    m.enrage = 6;
    FX.burst(tmp.set(m.pos.x, m.pos.y + m.height, m.pos.z), { count: 12, color: 0xff3a3a, glow: true, speed: 3, size: 0.2, life: 0.5 });
    Audio.play('fail');
    UI.notify(`The ${m.def.name} resisted and is enraged!`, '#ff8f8f');
  }
}

export function updateMonsters(dt) {
  const here = G.playerIsland;
  for (let i = G.monsters.length - 1; i >= 0; i--) {
    const m = G.monsters[i];
    // Monsters on islands you're not on wait for you (flyers always act).
    if (!m.dead && !m.def.flying && m.island !== here) continue;
    if (!m.update(dt)) {
      m.destroy();
      G.monsters.splice(i, 1);
    }
  }
}

// Ally regen + leveling between waves
export function levelAllies(level) {
  for (const a of allies()) {
    const ratio = a.hp / a.maxHp;
    a.applyLevel(Math.max(a.level, level));
    a.hp = Math.min(a.maxHp, Math.round(a.maxHp * Math.max(ratio, 0.6)));
  }
}

// Boss helper: call minions in a ring around the summoner.
export function summonMinions(boss, types, radius = 3) {
  for (const t of types) {
    const a = Math.random() * Math.PI * 2;
    const p = new THREE.Vector3(boss.pos.x + Math.cos(a) * radius, 0, boss.pos.z + Math.sin(a) * radius);
    if (!G.world.walkable(p.x, p.z)) p.set(boss.pos.x, 0, boss.pos.z);
    p.y = G.world.getHeight(p.x, p.z);
    spawnMonster(t, p, boss.level, { island: boss.island, wave: boss.wave });
  }
  FX.ring(tmp.set(boss.pos.x, G.world.getHeight(boss.pos.x, boss.pos.z), boss.pos.z), 0xc56bff, 5, 0.6);
  UI.notify(`${boss.def.name} summons minions!`, '#c56bff');
}

// Lob a projectile in an arc so it lands on the target.
function throwBoulder(m, t) {
  const from = new THREE.Vector3(m.pos.x, m.pos.y + m.height * 0.95, m.pos.z);
  const aim = new THREE.Vector3(t.pos.x, t.pos.y + 0.5, t.pos.z);
  if (t.vel) aim.addScaledVector(tmp.set(t.vel.x, 0, t.vel.z), 0.5);
  const g = 22;
  const T = Math.min(1.8, Math.max(0.8, from.distanceTo(aim) / 20));
  const vel = new THREE.Vector3((aim.x - from.x) / T, (aim.y - from.y + 0.5 * g * T * T) / T, (aim.z - from.z) / T);
  spawnProjectile({ pos: from, vel, team: 'enemy', kind: 'iceboulder', dmg: m.dmg * 0.9, owner: m, radius: 0.9, life: 4, gravity: g, aoe: 3.6, slow: 2 });
  Audio.play('slam');
}
