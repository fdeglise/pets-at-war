// Damage math, elemental effects and projectiles.
import * as THREE from 'three';
import { G, enemies, allies } from './game.js';
import { WEAPONS, ELEMENTS, ELEMENT_BONUS, WEAK_MULT, RESIST_MULT } from './data.js';
import { FX } from './effects.js';
import { Audio } from './audio.js';
import { UI } from './ui.js';
import * as M from './models.js';
import { killMonster } from './monsters.js';

const tmp = new THREE.Vector3();
const tmp2 = new THREE.Vector3();

// Roll the damage of one weapon hit (before the target's weakness/resistance).
export function weaponHit(item) {
  const d = WEAPONS[item.id];
  let dmg = d.dmg * (1 + item.ench.sharpness * 0.15);
  if (item.element) dmg *= 1 + ELEMENT_BONUS[item.elLevel];
  dmg *= 0.9 + Math.random() * 0.2;
  const crit = Math.random() < item.ench.critical * 0.1;
  if (crit) dmg *= 2;
  return { dmg, crit, element: item.element, elLevel: item.elLevel, vamp: item.ench.vampire * 0.04 };
}

export function hitMonster(m, hit, opts = {}) {
  if (m.dead) return 0;
  if (m.dormant) m.wake();
  let dmg = hit.dmg;
  let tag = null;
  if (hit.element) {
    if (m.def.weak === hit.element) { dmg *= WEAK_MULT; tag = 'weak'; }
    else if (m.def.resist === hit.element) { dmg *= RESIST_MULT; tag = 'resist'; }
  }
  dmg = Math.max(1, Math.round(dmg));
  m.hp -= dmg;
  m.flashT = 0.12;
  m.lastHitT = 0;
  if (opts.dir) m.knock.addScaledVector(opts.dir, (opts.knock ?? 4) * (m.def.heavy ? 0.2 : 1));
  if (hit.element && !opts.chain) applyElement(m, hit, dmg);
  if (hit.element === 'lightning' && opts.chain) m.status.slow = Math.max(m.status.slow, 0.3);

  const top = tmp.set(m.pos.x, m.pos.y + m.height * 0.9, m.pos.z);
  const color = hit.element ? ELEMENTS[hit.element].color : hit.crit ? '#ffd84a' : m.ally ? '#ff8f8f' : '#ffffff';
  UI.dmg(top, String(dmg), color, hit.crit || tag === 'weak' ? 'big' : tag === 'resist' ? 'small' : '', tag);
  const mid = tmp2.set(m.pos.x, m.pos.y + m.height * 0.5, m.pos.z);
  FX.burst(mid, { count: hit.crit ? 12 : 6, color: hit.element ? ELEMENTS[hit.element].hex : m.def.color, speed: 5, glow: !!hit.element, size: 0.16, life: 0.45 });
  if (!opts.silent) Audio.play(hit.crit ? 'crit' : 'hit');
  if (hit.crit) G.shake = Math.max(G.shake, 0.22);
  if (opts.fromPlayer && hit.vamp) G.player.heal(dmg * hit.vamp);
  if (m.hp <= 0) killMonster(m);
  return dmg;
}

function applyElement(m, hit, dmg) {
  const lv = hit.elLevel || 1;
  const s = m.status;
  switch (hit.element) {
    case 'fire':
      s.burn = 3;
      s.burnDps = Math.max(s.burnDps * 0.5, dmg * 0.13 * lv);
      break;
    case 'ice':
      s.slow = 1.4 + lv * 0.5;
      break;
    case 'lightning':
      chain(m, hit, dmg, lv);
      break;
    case 'poison':
      s.poison = 4;
      s.poisonStacks = Math.min(5, s.poisonStacks + 1);
      s.poisonDps = Math.max(s.poisonDps, dmg * 0.05 * lv);
      break;
  }
}

function chain(src, hit, dmg, lv) {
  const pool = src.ally ? [] : enemies();
  const from = new THREE.Vector3(src.pos.x, src.pos.y + src.height * 0.55, src.pos.z);
  const near = pool
    .filter((o) => o !== src && o.pos.distanceTo(src.pos) < 9)
    .sort((a, b) => a.pos.distanceTo(src.pos) - b.pos.distanceTo(src.pos))
    .slice(0, 1 + lv);
  if (near.length) Audio.play('zap');
  for (const o of near) {
    const to = new THREE.Vector3(o.pos.x, o.pos.y + o.height * 0.55, o.pos.z);
    FX.bolt(from, to);
    hitMonster(o, { dmg: dmg * 0.5, element: 'lightning', elLevel: lv }, { chain: true, silent: true });
  }
}

// ---------- projectiles ----------
// team: 'player' and 'ally' hit enemies; 'enemy' hits the player, the pet and allies.
export function spawnProjectile(o) {
  let obj;
  if (o.kind === 'fireball') {
    obj = new THREE.Mesh(M.cached('projFB', () => new THREE.IcosahedronGeometry(0.32, 1)), M.cached('projFBm', () => M.glowMat(0xff7a2a, 3)));
  } else if (o.kind === 'dragonfire') {
    obj = new THREE.Group();
    obj.add(new THREE.Mesh(M.cached('projDF', () => new THREE.IcosahedronGeometry(0.9, 1)), M.cached('projDFm', () => M.glowMat(0xff8a2a, 3.4))));
    obj.add(new THREE.Mesh(M.cached('projDF2', () => new THREE.IcosahedronGeometry(0.55, 1)), M.cached('projDFm2', () => M.glowMat(0xfff0a0, 4))));
  } else if (o.kind === 'iceboulder') {
    obj = new THREE.Mesh(M.cached('projIB', () => new THREE.IcosahedronGeometry(0.95, 0)), M.cached('projIBm', () => M.std(0xc4ecff, { rough: 0.15, metal: 0.1, emissive: 0x2a7fc0, ei: 0.5, flat: true })));
    obj.castShadow = true;
  } else if (o.kind === 'bonearrow') {
    obj = M.makeArrow(0xd8ccb0, 0xff5a3a);
  } else {
    obj = M.makeArrow(0xc8a676, o.hit && o.hit.element ? ELEMENTS[o.hit.element].hex : null);
  }
  obj.position.copy(o.pos);
  G.scene.add(obj);
  const p = {
    obj, team: o.team, kind: o.kind, pos: o.pos.clone(), vel: o.vel.clone(), prev: o.pos.clone(),
    hit: o.hit, dmg: o.dmg ?? 0, owner: o.owner, gravity: o.gravity ?? 0, life: o.life ?? 3,
    radius: o.radius ?? 0.35, stuck: 0, fromPlayer: o.team === 'player', aoe: o.aoe ?? 0, slow: o.slow ?? 0,
    trail: o.hit && o.hit.element ? ELEMENTS[o.hit.element].hex : o.kind === 'fireball' || o.kind === 'dragonfire' ? 0xff7a2a : o.kind === 'iceboulder' ? 0x9fefff : null,
  };
  G.projectiles.push(p);
  return p;
}

function segSphere(a, b, c, r) {
  // distance from sphere centre c to segment ab
  const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
  const l2 = abx * abx + aby * aby + abz * abz || 1e-6;
  let t = ((c.x - a.x) * abx + (c.y - a.y) * aby + (c.z - a.z) * abz) / l2;
  t = Math.max(0, Math.min(1, t));
  const dx = a.x + abx * t - c.x, dy = a.y + aby * t - c.y, dz = a.z + abz * t - c.z;
  return dx * dx + dy * dy + dz * dz <= r * r;
}

function removeProjectile(i) {
  const p = G.projectiles[i];
  G.scene.remove(p.obj);
  G.projectiles.splice(i, 1);
}

export function updateProjectiles(dt) {
  const world = G.world;
  const targetsEnemy = enemies();
  const friendly = [];
  if (G.player && G.player.isAlive()) friendly.push(G.player);
  if (G.pet && G.pet.alive) friendly.push(G.pet);
  for (const a of allies()) friendly.push(a);

  for (let i = G.projectiles.length - 1; i >= 0; i--) {
    const p = G.projectiles[i];
    p.life -= dt;
    if (p.stuck > 0) {
      p.stuck -= dt;
      if (p.stuck <= 0) removeProjectile(i);
      continue;
    }
    if (p.life <= 0) { removeProjectile(i); continue; }
    p.prev.copy(p.pos);
    p.vel.y -= p.gravity * dt;
    p.pos.addScaledVector(p.vel, dt);
    p.obj.position.copy(p.pos);
    tmp.copy(p.pos).add(p.vel);
    p.obj.lookAt(tmp);
    if (p.kind === 'fireball' || p.kind === 'dragonfire' || p.kind === 'iceboulder') p.obj.rotation.z += dt * 10;
    const big = p.kind === 'dragonfire';
    if (p.trail && Math.random() < (big ? 1 : 0.7)) FX.burst(p.pos, { count: big ? 3 : 1, color: p.trail, glow: true, speed: big ? 1.5 : 0.5, up: 0.5, size: big ? 0.7 : p.kind === 'fireball' ? 0.3 : p.kind === 'iceboulder' ? 0.35 : 0.14, size1: big ? 1.1 : 0, life: big ? 0.5 : 0.3, gravity: 0, spread: big ? 0.8 : 0.2 });

    let hitSomething = false;
    if (p.team === 'enemy') {
      for (const f of friendly) {
        const c = tmp2.set(f.pos.x, f.pos.y + f.height * 0.5, f.pos.z);
        if (segSphere(p.prev, p.pos, c, f.radius + p.radius + 0.25)) {
          if (p.aoe) explode(p, friendly);
          else f.takeHit(p.dmg, p.owner);
          hitSomething = true;
          break;
        }
      }
    } else {
      for (const m of targetsEnemy) {
        if (m.dead) continue;
        const c = tmp2.set(m.pos.x, m.pos.y + m.height * 0.5, m.pos.z);
        if (segSphere(p.prev, p.pos, c, m.radius + p.radius + 0.15)) {
          const dir = new THREE.Vector3(p.vel.x, 0, p.vel.z).normalize();
          const hit = typeof p.hit === 'function' ? p.hit() : p.hit;
          hitMonster(m, hit, { dir, knock: 3, fromPlayer: p.fromPlayer });
          hitSomething = true;
          break;
        }
      }
    }
    if (hitSomething) {
      if (p.kind === 'fireball') {
        FX.burst(p.pos, { count: 16, color: 0xff7a2a, glow: true, speed: 6, size: 0.25, life: 0.5 });
        Audio.play('fireball');
      } else Audio.play('arrowHit');
      removeProjectile(i);
      continue;
    }
    const gh = world.getHeight(p.pos.x, p.pos.z);
    if (p.pos.y < Math.max(gh, p.aoe ? -0.2 : -99)) {
      if (p.aoe) {
        explode(p, friendly);
        removeProjectile(i);
      } else if (p.kind === 'fireball') {
        FX.burst(p.pos, { count: 12, color: 0xff7a2a, glow: true, speed: 5, size: 0.22, life: 0.45 });
        removeProjectile(i);
      } else {
        p.pos.y = gh + 0.05;
        p.obj.position.copy(p.pos);
        p.stuck = 1.5;
        FX.burst(p.pos, { count: 4, color: 0xb89a6a, speed: 2, size: 0.1, life: 0.4, floor: true });
      }
    }
  }
}

// Splash damage for big projectiles (ice boulders, dragon fireballs).
function explode(p, friendly) {
  const fire = p.kind === 'dragonfire';
  for (const f of friendly) {
    const c = tmp2.set(f.pos.x, f.pos.y + f.height * 0.5, f.pos.z);
    if (c.distanceTo(p.pos) < p.aoe + f.radius) {
      f.takeHit(p.dmg, p.owner);
      if (p.slow && f.slowFor) f.slowFor(p.slow);
    }
  }
  const at = tmp.copy(p.pos);
  FX.burst(at, { count: fire ? 40 : 26, color: fire ? 0xff7a2a : 0x9fefff, glow: true, speed: fire ? 11 : 8, up: 2, size: fire ? 0.5 : 0.3, size1: fire ? 0.2 : 0, life: 0.7, gravity: 4 });
  FX.burst(at, { count: 14, color: fire ? 0x3a2a24 : 0xe8f6ff, speed: 7, size: 0.4, life: 0.8, floor: true });
  at.y = G.world.getHeight(at.x, at.z);
  FX.ring(at, fire ? 0xff6a1a : 0x8fe8ff, p.aoe, 0.45);
  Audio.play(fire ? 'boom' : 'slam');
  if (G.player && G.player.pos.distanceTo(p.pos) < 25) G.shake = Math.max(G.shake, 0.3);
}

// Melee/AoE helper for monsters: who can a monster hurt?
export function hostileTargetsFor(m) {
  if (m.ally) return enemies();
  const list = [];
  if (G.player && G.player.isAlive()) list.push(G.player);
  if (G.pet && G.pet.alive) list.push(G.pet);
  for (const a of allies()) list.push(a);
  return list;
}
