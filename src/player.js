// The player avatar: movement, sword swings, bow shots, getting knocked down.
import * as THREE from 'three';
import { G, enemies } from './game.js';
import { WEAPONS, ARMORS, ELEMENTS, REVIVE_COST, makeItem } from './data.js';
import * as M from './models.js';
import { FX } from './effects.js';
import { Audio } from './audio.js';
import { UI } from './ui.js';
import { Input } from './input.js';
import { weaponHit, hitMonster, spawnProjectile } from './combat.js';
import { dampAngle, damp } from './util.js';

const tmp = new THREE.Vector3();
const tmp2 = new THREE.Vector3();
const camDir = new THREE.Vector3();

export class Player {
  constructor() {
    this.rig = M.makeAvatar({ shirt: 0x2f7fe8, pants: 0x283044, hair: 0x4a2c1a });
    this.root = this.rig.root;
    this.root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    G.scene.add(this.root);
    this.pos = G.world.spawnPoint.clone();
    this.vel = new THREE.Vector3();
    this.yaw = Math.PI;
    this.onGround = true;
    this.radius = 0.6;
    this.height = 2.7;
    this.baseHp = 100;
    this.maxHp = 100;
    this.hp = 100;
    this.weapons = [makeItem('weapon', 'wood_sword')];
    this.slot = 0;
    this.armors = [];
    this.armor = null;
    this.attackCd = 0;
    this.swingT = 0;
    this.swingDur = 0.3;
    this.swingSide = 1;
    this.swingHit = false;
    this.aimT = 0;
    this.downed = 0;
    this.invuln = 0;
    this.phase = 0;
    this.moveAmt = 0;
    this.faceLockT = 0;
    this.weaponObj = null;
    this.mats = M.collectMats(this.root);
    this.flashT = 0;
    this.refreshWeaponModel();
  }

  get weapon() { return this.weapons[this.slot] || null; }
  armorDef() { return this.armor ? ARMORS[this.armor.id] : null; }
  isAlive() { return this.downed <= 0; }

  recalc() {
    const a = this.armorDef();
    const old = this.maxHp;
    this.maxHp = this.baseHp + (a ? a.hp : 0);
    if (this.maxHp > old) this.hp += this.maxHp - old;
    this.hp = Math.min(this.hp, this.maxHp);
  }

  equip(i) {
    if (!this.weapons[i] || i === this.slot) return;
    this.slot = i;
    this.swingT = 0;
    this.refreshWeaponModel();
    UI.refreshHotbar();
    Audio.play('click');
  }

  refreshWeaponModel() {
    if (this.weaponObj && this.weaponObj.parent) this.weaponObj.parent.remove(this.weaponObj);
    this.weaponObj = null;
    const w = this.weapon;
    if (!w) return;
    const d = WEAPONS[w.id];
    let obj;
    if (d.kind === 'sword') {
      obj = M.makeSword(w.id, w.element);
      // blade points forward and a little up so it reads from the camera behind the player
      obj.rotation.set(Math.PI / 2 - 0.6, 0, -0.25);
      this.rig.handR.add(obj);
    } else {
      obj = M.makeBow(w.id, w.element);
      obj.quaternion.copy(M.BOW_IDLE_Q);
      this.rig.handL.add(obj);
    }
    obj.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this.weaponObj = obj;
  }

  equipArmor(item) {
    this.armor = item;
    M.applyArmor(this.rig, item ? item.id : null);
    this.mats = M.collectMats(this.root);
    this.recalc();
    UI.refreshHotbar();
  }

  heal(n) {
    if (this.downed > 0) return;
    this.hp = Math.min(this.maxHp, this.hp + n);
  }

  takeHit(dmg) {
    if (this.downed > 0 || this.invuln > 0 || G.state !== 'playing') return;
    const a = this.armorDef();
    dmg *= 1 - (a ? a.def : 0);
    dmg = Math.max(1, Math.round(dmg));
    this.hp -= dmg;
    this.flashT = 0.12;
    Audio.play('hurt');
    UI.hurt();
    UI.dmg(tmp.set(this.pos.x, this.pos.y + 3, this.pos.z), String(dmg), '#ff5a5a', 'player');
    G.shake = Math.max(G.shake, 0.16);
    if (this.hp <= 0) this.goDown();
  }

  // The pet sacrifices part of its HP to bring the player back.
  goDown() {
    this.hp = 0;
    this.downed = 2.4;
    this.swingT = 0;
    const pet = G.pet;
    const cost = Math.round(pet.maxHp * REVIVE_COST);
    Audio.play('down');
    if (pet.hp <= cost) {
      UI.banner(`${pet.name} gave everything`, 'There was not enough pet HP left to revive you.', '#ff6b8a');
      pet.die();
      return;
    }
    pet.hp -= cost;
    pet.lastHurt = 0;
    UI.banner(`${pet.name} is reviving you`, `Revive cost ${cost} pet HP · protect your pet!`, '#5effa8');
    FX.ring(pet.pos, 0xff6fa8, 4, 0.8);
  }

  revive() {
    this.hp = Math.round(this.maxHp * 0.6);
    this.invuln = 2.5;
    FX.ring(this.pos, 0x5effa8, 5, 0.7);
    FX.burst(tmp.set(this.pos.x, this.pos.y + 1.2, this.pos.z), { count: 30, color: 0x5effa8, glow: true, speed: 5, up: 4, size: 0.24, life: 1, gravity: -2 });
    Audio.play('heal');
  }

  // Where the crosshair is pointing in the world.
  aimPoint() {
    const cam = G.camera;
    cam.getWorldDirection(camDir);
    const origin = cam.position;
    const toPlayer = tmp.copy(this.pos).sub(origin).dot(camDir);
    let best = 140;
    for (const m of enemies()) {
      const c = tmp2.set(m.pos.x, m.pos.y + m.height * 0.5, m.pos.z);
      const t = tmp.copy(c).sub(origin).dot(camDir);
      if (t < toPlayer) continue;
      const closest = tmp.copy(origin).addScaledVector(camDir, t);
      const r = m.radius + 0.6;
      if (closest.distanceToSquared(c) < r * r && t < best) best = t;
    }
    for (let t = Math.max(2, toPlayer); t < best; t += 1) {
      const px = origin.x + camDir.x * t, py = origin.y + camDir.y * t, pz = origin.z + camDir.z * t;
      if (py < G.world.getHeight(px, pz)) { best = t; break; }
    }
    return new THREE.Vector3().copy(origin).addScaledVector(camDir, best);
  }

  attack() {
    const w = this.weapon;
    if (!w) return;
    const d = WEAPONS[w.id];
    const rate = d.rate / (1 + w.ench.swiftness * 0.12);
    this.attackCd = rate;
    this.yaw = G.cam.yaw + Math.PI;
    this.faceLockT = 0.45;
    if (d.kind === 'sword') {
      this.swingDur = Math.min(0.32, rate * 0.85);
      this.swingT = 0.0001;
      this.swingSide *= -1;
      this.swingHit = false;
      Audio.play('swing');
    } else {
      const aim = this.aimPoint();
      const from = new THREE.Vector3(this.pos.x + Math.sin(this.yaw) * 0.7, this.pos.y + 1.95, this.pos.z + Math.cos(this.yaw) * 0.7);
      const dir = aim.sub(from).normalize();
      const shots = d.shots || 1;
      for (let i = 0; i < shots; i++) {
        const spread = (i - (shots - 1) / 2) * 0.09;
        const v = dir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), spread);
        spawnProjectile({
          pos: from, vel: v.multiplyScalar(d.speed), team: 'player', kind: 'arrow',
          hit: weaponHit(w), gravity: 5, life: 2.5, radius: 0.3,
        });
      }
      this.aimT = 0.6;
      Audio.play('bow');
    }
  }

  doSwingHits() {
    const w = this.weapon;
    const d = WEAPONS[w.id];
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    for (const m of enemies()) {
      const dx = m.pos.x - this.pos.x, dz = m.pos.z - this.pos.z;
      const dist = Math.hypot(dx, dz) || 0.001;
      if (dist > d.range + m.radius) continue;
      if (Math.abs(m.pos.y - this.pos.y) > 3.5) continue;
      const dot = (dx * fx + dz * fz) / dist;
      if (dist > m.radius + 0.8 && dot < 0.3) continue;
      hitMonster(m, weaponHit(w), { dir: new THREE.Vector3(dx / dist, 0, dz / dist), knock: 7, fromPlayer: true });
    }
    const col = w.element ? ELEMENTS[w.element].hex : d.glow ?? 0xffffff;
    FX.slash(tmp.set(this.pos.x, this.pos.y + 1.35, this.pos.z), this.yaw, col, d.range, this.swingSide);
  }

  update(dt) {
    const world = G.world;
    const cam = G.cam;
    this.attackCd -= dt;
    this.invuln = Math.max(0, this.invuln - dt);
    this.aimT = Math.max(0, this.aimT - dt);
    this.faceLockT = Math.max(0, this.faceLockT - dt);

    if (this.downed > 0) {
      this.downed -= dt;
      this.vel.set(0, 0, 0);
      if (this.downed <= 0 && G.pet.alive) this.revive();
    }

    // ---- movement ----
    let ix = 0, iz = 0;
    if (this.downed <= 0) {
      // physical key codes: WASD on QWERTY, ZQSD on AZERTY
      if (Input.down('KeyW') || Input.down('ArrowUp')) iz += 1;
      if (Input.down('KeyS') || Input.down('ArrowDown')) iz -= 1;
      if (Input.down('KeyA') || Input.down('ArrowLeft')) ix -= 1;
      if (Input.down('KeyD') || Input.down('ArrowRight')) ix += 1;
      ix += Input.touchMove.x;
      iz += Input.touchMove.y;
    }
    const sy = Math.sin(cam.yaw), cy = Math.cos(cam.yaw);
    let mx = -sy * iz + cy * ix;
    let mz = -cy * iz - sy * ix;
    const ml = Math.hypot(mx, mz);
    if (ml > 1) { mx /= ml; mz /= ml; }
    const inWater = world.getHeight(this.pos.x, this.pos.z) < 0.1;
    const sprint = Input.down('ShiftLeft') || Input.down('ShiftRight');
    const speed = (sprint ? 13 : 8.5) * (inWater ? 0.6 : 1) * (this.aimT > 0 ? 0.8 : 1);
    this.vel.x = damp(this.vel.x, mx * speed, 12, dt);
    this.vel.z = damp(this.vel.z, mz * speed, 12, dt);

    if (this.downed <= 0 && (Input.hit('Space')) && this.onGround) {
      this.vel.y = 12;
      this.onGround = false;
    }
    this.vel.y -= 34 * dt;

    const ox = this.pos.x, oz = this.pos.z;
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    world.collide(this.pos, this.radius);
    for (const m of G.monsters) {
      if (m.dead) continue;
      const dx = this.pos.x - m.pos.x, dz = this.pos.z - m.pos.z;
      const rr = this.radius + m.radius * 0.8;
      const d2 = dx * dx + dz * dz;
      if (d2 < rr * rr && d2 > 1e-5) {
        const d = Math.sqrt(d2);
        this.pos.x = m.pos.x + (dx / d) * rr;
        this.pos.z = m.pos.z + (dz / d) * rr;
      }
    }
    if (!world.walkable(this.pos.x, this.pos.z)) { this.pos.x = ox; this.pos.z = oz; }
    this.pos.y += this.vel.y * dt;
    const gh = world.getHeight(this.pos.x, this.pos.z);
    if (this.pos.y <= gh) {
      this.pos.y = gh;
      this.vel.y = 0;
      this.onGround = true;
    } else if (this.onGround && this.vel.y <= 0 && this.pos.y - gh < 0.7) {
      this.pos.y = gh;
      this.vel.y = 0;
    } else {
      this.onGround = false;
    }

    // ---- facing ----
    const moving = ml > 0.1 && this.downed <= 0;
    if (this.faceLockT > 0 || this.aimT > 0 || (Input.locked && moving)) {
      this.yaw = dampAngle(this.yaw, cam.yaw + Math.PI, 18, dt);
    } else if (moving) {
      this.yaw = dampAngle(this.yaw, Math.atan2(mx, mz), 12, dt);
    }

    // ---- attacks ----
    if (this.downed <= 0 && Input.mouseDown && this.attackCd <= 0 && G.state === 'playing') this.attack();
    if (this.swingT > 0) {
      this.swingT += dt / this.swingDur;
      if (!this.swingHit && this.swingT >= 0.4) {
        this.swingHit = true;
        this.doSwingHits();
      }
      if (this.swingT >= 1) this.swingT = 0;
    }

    this.animate(dt, Math.hypot(this.vel.x, this.vel.z));
  }

  animate(dt, speed) {
    const r = this.rig;
    this.moveAmt = damp(this.moveAmt, Math.min(1, speed / 8.5), 10, dt);
    this.phase += dt * (3 + speed * 1.1);
    M.walkRig(r, this.phase, this.onGround ? this.moveAmt : 0.3, 0.8);
    if (!this.onGround) {
      r.hipL.rotation.x = -0.5;
      r.hipR.rotation.x = 0.3;
    }
    r.body.rotation.set(0, 0, 0);
    r.shR.rotation.z = 0;
    r.shL.rotation.z = 0;
    r.shR.rotation.y = 0;
    const w = this.weapon;
    const kind = w ? WEAPONS[w.id].kind : null;
    if (this.swingT > 0) {
      const t = this.swingT;
      const s = this.swingSide;
      let ax, az;
      if (t < 0.3) {
        const k = t / 0.3;
        ax = -0.2 - k * 2.3;
        az = s * k * 0.9;
      } else if (t < 0.6) {
        const k = (t - 0.3) / 0.3;
        const e = 1 - Math.pow(1 - k, 3);
        ax = -2.5 + e * 2.0;
        az = s * (0.9 - e * 1.6);
      } else {
        const k = (t - 0.6) / 0.4;
        ax = -0.5 + k * 0.3;
        az = s * (-0.7 + k * 0.7);
      }
      r.shR.rotation.x = ax;
      r.shR.rotation.z = az;
      r.body.rotation.y = -s * Math.sin(t * Math.PI) * 0.35;
    } else if (kind === 'sword') {
      r.shR.rotation.x = Math.min(r.shR.rotation.x, 0) * 0.4 - 0.25;
    }
    if (kind === 'bow') {
      const aiming = this.aimT > 0;
      const k = aiming ? 1 : 0;
      r.shL.rotation.x = aiming ? -1.55 : r.shL.rotation.x * 0.5 - 0.15;
      if (aiming) {
        const pull = Math.max(0, this.aimT - 0.4) / 0.2;
        r.shR.rotation.x = -1.5;
        r.shR.rotation.y = -0.5 + pull * 0.3;
        r.shR.rotation.z = 0.15;
        r.shL.rotation.y = 0.1;
      }
      if (this.weaponObj) this.weaponObj.quaternion.slerp(k ? M.BOW_AIM_Q : M.BOW_IDLE_Q, Math.min(1, dt * 18));
    }

    if (this.downed > 0) {
      r.body.rotation.x = -Math.PI / 2 * Math.min(1, (2.4 - this.downed) * 4);
      r.body.position.y = 0.35;
    } else {
      r.body.rotation.x = 0;
    }
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.yaw;
    // blink while invulnerable
    this.root.visible = this.invuln <= 0 || Math.floor(this.invuln * 12) % 2 === 0;
    if (this.flashT > 0) {
      this.flashT -= dt;
      M.setFlash(this.mats, this.flashT > 0 ? 0.8 : 0, 0xff3a3a);
    }
  }

  destroy() {
    G.scene.remove(this.root);
  }
}
