// Coins, dropped items and treasure chests.
import * as THREE from 'three';
import { G, diff } from './game.js';
import { RARITY, itemRarity, itemName, rollItem, MAX_WEAPONS, MAX_ARMORS, ARMORS } from './data.js';
import * as M from './models.js';
import { FX } from './effects.js';
import { Audio } from './audio.js';
import { UI } from './ui.js';
import { Waves } from './waves.js';

const tmp = new THREE.Vector3();

export function spawnCoins(pos, amount) {
  const n = Math.min(10, Math.max(1, Math.ceil(amount / 4)));
  let left = amount;
  for (let i = 0; i < n; i++) {
    const v = i === n - 1 ? left : Math.floor(amount / n);
    left -= v;
    const mesh = new THREE.Mesh(M.coinGeo(), M.coinMat());
    mesh.castShadow = true;
    const a = Math.random() * Math.PI * 2;
    const c = {
      mesh, value: v,
      pos: new THREE.Vector3(pos.x, pos.y + 1, pos.z),
      vel: new THREE.Vector3(Math.cos(a) * (2 + Math.random() * 3), 6 + Math.random() * 4, Math.sin(a) * (2 + Math.random() * 3)),
      life: 40, spin: Math.random() * 6, magnet: false, age: 0,
    };
    mesh.position.copy(c.pos);
    G.scene.add(mesh);
    G.coins.push(c);
  }
}

export function spawnDrop(pos, item) {
  const g = new THREE.Group();
  const model = M.makeItemModel(item);
  model.scale.setScalar(item.type === 'armor' ? 0.7 : 1.15);
  if (item.type === 'weapon') model.rotation.z = -Math.PI / 4;
  const holder = new THREE.Group();
  holder.add(model);
  holder.position.y = 1.2;
  g.add(holder);
  const rar = RARITY[itemRarity(item)];
  const beam = M.makeBeam(rar.hex, item.type && itemRarity(item) === 'legendary' ? 12 : 7);
  g.add(beam);
  const ring = new THREE.Mesh(
    M.cached('dropRing', () => new THREE.RingGeometry(0.6, 0.85, 32).rotateX(-Math.PI / 2)),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(rar.hex).multiplyScalar(2), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  ring.position.y = 0.06;
  g.add(ring);
  pos.y = G.world.getHeight(pos.x, pos.z);
  g.position.copy(pos);
  G.scene.add(g);
  const d = { item, group: g, holder, pos: pos.clone(), age: 0 };
  G.drops.push(d);
  FX.burst(tmp.set(pos.x, pos.y + 1, pos.z), { count: 18, color: rar.hex, glow: true, speed: 5, size: 0.2, life: 0.8 });
  return d;
}

export function removeDrop(d) {
  G.scene.remove(d.group);
  M.disposeMats(d.group);
  const i = G.drops.indexOf(d);
  if (i >= 0) G.drops.splice(i, 1);
}

// Pick up an item into the backpack. Returns false if there is no room.
export function pickUp(d) {
  const p = G.player;
  const item = d.item;
  if (item.type === 'weapon') {
    if (p.weapons.length >= MAX_WEAPONS) {
      UI.notify(`Weapon slots are full. Open your backpack (${UI.keyLabel('KeyI')}) to sell or clear it.`, '#ffb3b3');
      Audio.play('error');
      return false;
    }
    p.weapons.push(item);
    UI.refreshHotbar();
  } else {
    if (p.armors.length >= MAX_ARMORS) {
      UI.notify(`Armor rack is full. Open your backpack (${UI.keyLabel('KeyI')}) to sell or clear it.`, '#ffb3b3');
      Audio.play('error');
      return false;
    }
    p.armors.push(item);
    const cur = p.armor ? ARMORS[p.armor.id].def : -1;
    if (ARMORS[item.id].def > cur) p.equipArmor(item);
  }
  const rar = RARITY[itemRarity(item)];
  UI.notify(`Picked up <b style="color:${rar.color}">${itemName(item)}</b>`, '#ffffff', item);
  Audio.play('pickup');
  removeDrop(d);
  return true;
}

export function spawnChest(pos, life = 150, level = 0) {
  const c = M.makeChest();
  c.root.position.copy(pos);
  c.root.rotation.y = Math.random() * Math.PI * 2;
  G.scene.add(c.root);
  const beam = M.makeBeam(0xffd24a, 9);
  beam.material.color.multiplyScalar(0.6);
  c.root.add(beam);
  const chest = { ...c, pos: pos.clone(), opened: false, openT: 0, life, level, beam };
  G.chests.push(chest);
  return chest;
}

export function openChest(c) {
  if (c.opened) return;
  c.opened = true;
  c.openT = 0;
  Audio.play('chest');
  const wave = Math.max(1, Waves.n, c.level || 0);
  const p = c.pos.clone();
  p.x += Math.sin(c.root.rotation.y) * 1.8;
  p.z += Math.cos(c.root.rotation.y) * 1.8;
  spawnDrop(p, rollItem(wave, 0.6));
  spawnCoins(c.pos, Math.round((15 + wave * 6) * diff().coins));
  FX.burst(tmp.set(c.pos.x, c.pos.y + 1, c.pos.z), { count: 30, color: 0xffd24a, glow: true, speed: 6, up: 4, size: 0.2, life: 1 });
}

export function updateLoot(dt) {
  const p = G.player;
  const world = G.world;
  // coins
  for (let i = G.coins.length - 1; i >= 0; i--) {
    const c = G.coins[i];
    c.age += dt;
    c.life -= dt;
    const d = p ? c.pos.distanceTo(tmp.set(p.pos.x, p.pos.y + 1.2, p.pos.z)) : 99;
    if (c.age > 0.5 && d < (p.mounted ? 16 : 7) && p.isAlive()) c.magnet = true;
    if (c.magnet) {
      const dir = tmp.set(p.pos.x, p.pos.y + 1.2, p.pos.z).sub(c.pos).normalize();
      c.vel.lerp(dir.multiplyScalar(18), Math.min(1, dt * 8));
      c.pos.addScaledVector(c.vel, dt);
      if (d < 0.9) {
        G.money += c.value;
        G.stats.earned += c.value;
        Audio.play('coin');
        UI.moneyPop(c.value);
        G.scene.remove(c.mesh);
        G.coins.splice(i, 1);
        continue;
      }
    } else {
      c.vel.y -= 25 * dt;
      c.vel.x *= Math.exp(-dt * 2);
      c.vel.z *= Math.exp(-dt * 2);
      c.pos.addScaledVector(c.vel, dt);
      const gh = world.getHeight(c.pos.x, c.pos.z) + 0.4;
      if (c.pos.y < gh) {
        c.pos.y = gh;
        c.vel.y = Math.abs(c.vel.y) > 2 ? -c.vel.y * 0.35 : 0;
      }
    }
    c.spin += dt * 5;
    c.mesh.position.copy(c.pos);
    c.mesh.position.y += c.magnet ? 0 : Math.sin(c.age * 3) * 0.08;
    c.mesh.rotation.y = c.spin;
    if (c.life <= 0) {
      G.scene.remove(c.mesh);
      G.coins.splice(i, 1);
    }
  }
  // drops
  for (const d of G.drops) {
    d.age += dt;
    d.holder.rotation.y += dt * 1.6;
    d.holder.position.y = 1.2 + Math.sin(d.age * 2.2) * 0.18;
  }
  // chests
  for (let i = G.chests.length - 1; i >= 0; i--) {
    const c = G.chests[i];
    if (c.opened) {
      c.openT += dt;
      c.lid.rotation.x = -Math.min(1, c.openT * 3) * 1.9;
      c.beam.scale.x = c.beam.scale.z = Math.max(0.01, 1 - c.openT);
      if (c.openT > 6) {
        c.root.scale.setScalar(Math.max(0.01, 1 - (c.openT - 6) * 2));
        if (c.openT > 6.5) {
          G.scene.remove(c.root);
          G.chests.splice(i, 1);
        }
      }
    } else {
      c.life -= dt;
      if (Math.random() < dt * 3) FX.burst(tmp.set(c.pos.x + (Math.random() - 0.5) * 1.6, c.pos.y + 1, c.pos.z + (Math.random() - 0.5) * 1.6), { count: 1, color: 0xffd24a, glow: true, speed: 0.5, up: 1.5, size: 0.12, life: 0.8, gravity: -1 });
      if (c.life <= 0) {
        G.scene.remove(c.root);
        G.chests.splice(i, 1);
      }
    }
  }
}

export function clearLoot() {
  for (const c of G.coins) G.scene.remove(c.mesh);
  for (const d of G.drops) G.scene.remove(d.group);
  for (const c of G.chests) G.scene.remove(c.root);
  G.coins.length = 0;
  G.drops.length = 0;
  G.chests.length = 0;
}
