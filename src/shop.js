// Buying, selling and upgrading. The UI calls these; they return a message on failure.
import { G } from './game.js';
import {
  WEAPONS, ARMORS, ENCHANTS, ELEMENTS, ELEMENT_COST, PET_UPGRADES, TREAT_COST,
  MAX_WEAPONS, MAX_ARMORS, makeItem, sellPrice, itemName,
} from './data.js';
import { Audio } from './audio.js';
import { UI } from './ui.js';

function pay(cost) {
  if (G.money < cost) {
    Audio.play('error');
    return false;
  }
  G.money -= cost;
  Audio.play('buy');
  return true;
}

export const Shop = {
  buyWeapon(id) {
    const p = G.player;
    if (p.weapons.length >= MAX_WEAPONS) return 'Your weapon slots are full. Sell one first.';
    if (!pay(WEAPONS[id].price)) return 'Not enough coins.';
    const item = makeItem('weapon', id);
    p.weapons.push(item);
    p.equip(p.weapons.length - 1);
    UI.refreshHotbar();
    return null;
  },
  buyArmor(id) {
    const p = G.player;
    if (p.armors.length >= MAX_ARMORS) return 'Your armor rack is full. Sell one first.';
    if (!pay(ARMORS[id].price)) return 'Not enough coins.';
    const item = makeItem('armor', id);
    p.armors.push(item);
    p.equipArmor(item);
    return null;
  },
  enchantCost(key) {
    const w = G.player.weapon;
    const lv = w.ench[key];
    if (lv >= ENCHANTS[key].max) return null;
    return ENCHANTS[key].cost(lv + 1);
  },
  buyEnchant(key) {
    const w = G.player.weapon;
    if (!w) return 'Hold a weapon first.';
    const cost = this.enchantCost(key);
    if (cost === null) return 'Already at max level.';
    if (!pay(cost)) return 'Not enough coins.';
    w.ench[key]++;
    UI.refreshHotbar();
    return null;
  },
  elementCost(key) {
    const w = G.player.weapon;
    if (w.element === key) return w.elLevel >= 3 ? null : ELEMENT_COST[w.elLevel + 1];
    return ELEMENT_COST[1];
  },
  buyElement(key) {
    const p = G.player;
    const w = p.weapon;
    if (!w) return 'Hold a weapon first.';
    const cost = this.elementCost(key);
    if (cost === null) return 'Already at max level.';
    if (!pay(cost)) return 'Not enough coins.';
    if (w.element === key) w.elLevel++;
    else { w.element = key; w.elLevel = 1; }
    p.refreshWeaponModel();
    UI.refreshHotbar();
    return null;
  },
  buyTreat() {
    const pet = G.pet;
    if (pet.hp >= pet.maxHp) return `${pet.name} is already at full health.`;
    if (!pay(TREAT_COST)) return 'Not enough coins.';
    pet.heal(pet.maxHp * 0.5);
    return null;
  },
  petUpgradeCost(key) {
    const lv = G.pet.upg[key];
    return lv >= PET_UPGRADES[key].max ? null : PET_UPGRADES[key].cost(lv + 1);
  },
  buyPetUpgrade(key) {
    const cost = this.petUpgradeCost(key);
    if (cost === null) return 'Already at max level.';
    if (!pay(cost)) return 'Not enough coins.';
    G.pet.upg[key]++;
    G.pet.recalc();
    return null;
  },
  sell(uid) {
    const p = G.player;
    const wi = p.weapons.findIndex((w) => w.uid === uid);
    if (wi >= 0) {
      if (p.weapons.length <= 1) return 'You need to keep at least one weapon.';
      const item = p.weapons[wi];
      const price = sellPrice(item);
      p.weapons.splice(wi, 1);
      if (p.slot >= p.weapons.length || wi === p.slot) p.slot = Math.min(p.slot, p.weapons.length - 1);
      else if (wi < p.slot) p.slot--;
      p.refreshWeaponModel();
      G.money += price;
      Audio.play('coin');
      UI.notify(`Sold ${itemName(item)} for ${price} coins`, '#ffd24a');
      UI.refreshHotbar();
      return null;
    }
    const ai = p.armors.findIndex((a) => a.uid === uid);
    if (ai >= 0) {
      const item = p.armors[ai];
      const price = sellPrice(item);
      p.armors.splice(ai, 1);
      if (p.armor === item) p.equipArmor(null);
      G.money += price;
      Audio.play('coin');
      UI.notify(`Sold ${itemName(item)} for ${price} coins`, '#ffd24a');
      return null;
    }
    return 'Item not found.';
  },
  // Everything that "Clear backpack" would sell: every weapon except the one in your hand
  // and every armor except the one you wear.
  clearList() {
    const p = G.player;
    const held = p.weapon, worn = p.armor;
    return [...p.weapons.filter((w) => w !== held), ...p.armors.filter((a) => a !== worn)];
  },
  clearPreview() {
    const list = this.clearList();
    return { count: list.length, value: list.reduce((s, it) => s + sellPrice(it), 0) };
  },
  clearBackpack() {
    const p = G.player;
    const { count, value } = this.clearPreview();
    if (!count) return 'Your backpack is already empty.';
    const held = p.weapon, worn = p.armor;
    p.weapons = held ? [held] : p.weapons.slice(0, 1);
    p.slot = 0;
    p.armors = worn ? [worn] : [];
    p.refreshWeaponModel();
    G.money += value;
    Audio.play('coin');
    UI.notify(`Backpack cleared: sold ${count} item${count === 1 ? '' : 's'} for ${value} coins`, '#ffd24a');
    UI.refreshHotbar();
    return null;
  },
  equipWeapon(uid) {
    const p = G.player;
    const i = p.weapons.findIndex((w) => w.uid === uid);
    if (i >= 0) p.equip(i);
    return null;
  },
  equipArmor(uid) {
    const p = G.player;
    const a = p.armors.find((x) => x.uid === uid);
    if (a) p.equipArmor(p.armor === a ? null : a);
    Audio.play('click');
    return null;
  },
};

export { ELEMENTS };
