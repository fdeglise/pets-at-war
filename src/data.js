// All tunable game content lives here: items, monsters, pets, prices.
import { pick, weightedPick, ROMAN } from './util.js';

export const RARITY_ORDER = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
export const RARITY = {
  common:    { name: 'Common',    color: '#c9d3db', hex: 0xc9d3db },
  uncommon:  { name: 'Uncommon',  color: '#6be05a', hex: 0x6be05a },
  rare:      { name: 'Rare',      color: '#4aa8ff', hex: 0x4aa8ff },
  epic:      { name: 'Epic',      color: '#c06bff', hex: 0xc06bff },
  legendary: { name: 'Legendary', color: '#ffb627', hex: 0xffb627 },
};

export const ELEMENTS = {
  fire:      { name: 'Fire',  color: '#ff7a2f', hex: 0xff6a1f, desc: 'Burns for extra damage over 3s' },
  ice:       { name: 'Frost', color: '#8fe8ff', hex: 0x7fe0ff, desc: 'Slows enemies by 45%' },
  lightning: { name: 'Storm', color: '#ffe45c', hex: 0xffe04a, desc: 'Arcs to nearby enemies' },
  poison:    { name: 'Venom', color: '#9bff5c', hex: 0x86ff3a, desc: 'Stacking poison damage' },
};
export const ELEMENT_KEYS = ['fire', 'ice', 'lightning', 'poison'];
export const ELEMENT_BONUS = [0, 0.3, 0.55, 0.85];
export const ELEMENT_COST = [0, 180, 420, 900];
export const WEAK_MULT = 1.75;
export const RESIST_MULT = 0.5;

export const WEAPONS = {
  wood_sword:    { kind: 'sword', name: 'Wooden Sword',   rarity: 'common',    dmg: 10, rate: 0.5,  range: 3.3, price: 0,    blade: 0xb07a45, guard: 0x6b4423, len: 1.0, metal: 0, rough: 0.8 },
  stone_sword:   { kind: 'sword', name: 'Stone Sword',    rarity: 'common',    dmg: 15, rate: 0.52, range: 3.4, price: 60,   blade: 0x9aa0a6, guard: 0x5b4633, len: 1.1, metal: 0.1, rough: 0.85 },
  iron_sword:    { kind: 'sword', name: 'Iron Sword',     rarity: 'uncommon',  dmg: 22, rate: 0.48, range: 3.6, price: 160,  blade: 0xe3e9ef, guard: 0x4a4f57, len: 1.25 },
  knight_blade:  { kind: 'sword', name: "Knight's Blade", rarity: 'rare',      dmg: 32, rate: 0.46, range: 3.8, price: 420,  blade: 0xcfe0ff, guard: 0xd4a63a, len: 1.4, width: 0.13 },
  crystal_saber: { kind: 'sword', name: 'Crystal Saber',  rarity: 'epic',      dmg: 46, rate: 0.42, range: 4.0, price: 1050, blade: 0x8ff0ff, guard: 0x3a6fb0, len: 1.5, glow: 0x2ad4ff, metal: 0.2 },
  dragonfang:    { kind: 'sword', name: 'Dragonfang',     rarity: 'legendary', dmg: 68, rate: 0.44, range: 4.3, price: 2600, blade: 0xff4a32, guard: 0xffc23d, len: 1.7, width: 0.16, glow: 0xff2a00 },
  short_bow:     { kind: 'bow', name: 'Short Bow',  rarity: 'common',    dmg: 9,  rate: 0.65, speed: 42, price: 45,   wood: 0x9a6a3a, size: 0.62 },
  hunter_bow:    { kind: 'bow', name: 'Hunter Bow', rarity: 'uncommon',  dmg: 15, rate: 0.6,  speed: 48, price: 140,  wood: 0x6d4a2a, size: 0.7 },
  longbow:       { kind: 'bow', name: 'Longbow',    rarity: 'rare',      dmg: 25, rate: 0.58, speed: 56, price: 400,  wood: 0x4e3220, size: 0.85, trim: 0xd4a63a },
  elven_bow:     { kind: 'bow', name: 'Elven Bow',  rarity: 'epic',      dmg: 37, rate: 0.48, speed: 64, price: 1000, wood: 0xe8f5e0, size: 0.8, trim: 0x5ee0a0, glow: 0x3affb0 },
  starshot:      { kind: 'bow', name: 'Starshot',   rarity: 'legendary', dmg: 50, rate: 0.46, speed: 72, price: 2400, wood: 0x2a2350, size: 0.85, trim: 0xffd75e, glow: 0xffd75e, shots: 3 },
};

export const ARMORS = {
  leather: { name: 'Leather Armor',     rarity: 'common',    def: 0.10, hp: 10, price: 55,   color: 0x9b6338, trim: 0x5e3a1e, metal: 0,    rough: 0.85 },
  iron:    { name: 'Iron Armor',        rarity: 'uncommon',  def: 0.20, hp: 25, price: 220,  color: 0xc8d0d8, trim: 0x6e7781, metal: 0.75, rough: 0.35 },
  gold:    { name: 'Golden Armor',      rarity: 'rare',      def: 0.30, hp: 40, price: 540,  color: 0xffc941, trim: 0xb07d12, metal: 0.9,  rough: 0.3 },
  crystal: { name: 'Crystal Armor',     rarity: 'epic',      def: 0.42, hp: 60, price: 1250, color: 0x8beeff, trim: 0x2f7fb8, metal: 0.3,  rough: 0.15, emissive: 0x1d8fb8 },
  dragon:  { name: 'Dragonscale Armor', rarity: 'legendary', def: 0.55, hp: 90, price: 3100, color: 0xc0281e, trim: 0x2a1210, metal: 0.5,  rough: 0.35, emissive: 0x501008, horns: true },
};

export const ENCHANTS = {
  sharpness: { name: 'Sharpness', max: 5, text: (l) => `+${l * 15}% damage`, cost: (l) => Math.round(70 * Math.pow(l, 1.55)) },
  swiftness: { name: 'Swiftness', max: 3, text: (l) => `+${l * 12}% attack speed`, cost: (l) => Math.round(120 * Math.pow(l, 1.6)) },
  vampire:   { name: 'Vampire',   max: 3, text: (l) => `Heal ${l * 4}% of damage dealt`, cost: (l) => Math.round(140 * Math.pow(l, 1.6)) },
  critical:  { name: 'Critical',  max: 3, text: (l) => `${l * 10}% chance to hit for x2`, cost: (l) => Math.round(130 * Math.pow(l, 1.6)) },
};

export const MONSTERS = {
  slime:    { name: 'Slime',       hp: 30,  dmg: 6,  speed: 3.4, range: 1.5, rate: 1.2, windup: 0.3,  coins: 5,   weak: 'fire',      resist: 'poison', tame: 0.75, unlock: 1, color: 0x63d95a },
  wolf:     { name: 'Frost Wolf',  hp: 42,  dmg: 8,  speed: 6.4, range: 1.9, rate: 1.0, windup: 0.28, coins: 8,   weak: 'poison',    resist: 'ice',    tame: 0.6,  unlock: 2, color: 0xdce8f5, huntsPet: true },
  imp:      { name: 'Ember Imp',   hp: 36,  dmg: 9,  speed: 4.4, range: 15,  rate: 2.4, windup: 0.5,  coins: 10,  weak: 'ice',       resist: 'fire',   tame: 0.55, unlock: 3, color: 0xd9412b, ranged: 'fireball', projSpeed: 17 },
  skeleton: { name: 'Bone Archer', hp: 48,  dmg: 10, speed: 3.8, range: 20,  rate: 2.6, windup: 0.55, coins: 12,  weak: 'lightning', resist: 'ice',    tame: 0.55, unlock: 4, color: 0xece6d6, ranged: 'bonearrow', projSpeed: 30 },
  golem:    { name: 'Stone Golem', hp: 170, dmg: 18, speed: 2.5, range: 2.6, rate: 2.3, windup: 0.7,  coins: 25,  weak: 'lightning', resist: 'poison', tame: 0.4,  unlock: 6, color: 0x8a8a86, slam: 3.6, heavy: true },
  ogre:     { name: 'Shadow Ogre', hp: 800, dmg: 26, speed: 3.1, range: 3.6, rate: 2.4, windup: 0.8,  coins: 160, weak: null,        resist: null,     tame: 0,    unlock: 99, color: 0x8a5cc0, slam: 5.5, heavy: true, boss: true },
};

export const PETS = {
  fox:    { name: 'Ember',  species: 'Fox',    hp: 220, heal: 3.2, blurb: 'Balanced healer with a sturdy coat.' },
  bunny:  { name: 'Clover', species: 'Bunny',  hp: 160, heal: 5.0, blurb: 'Fragile, but heals you fast.' },
  turtle: { name: 'Shelly', species: 'Turtle', hp: 340, heal: 2.2, blurb: 'Slow healer with a thick shell.' },
};
export const PET_UPGRADES = {
  vitality: { name: 'Vitality', max: 6, text: (l) => `+${l * 40} pet max HP`, cost: (l) => Math.round(110 * Math.pow(l, 1.45)) },
  mending:  { name: 'Mending',  max: 5, text: (l) => `+${l} pet healing per second`, cost: (l) => Math.round(140 * Math.pow(l, 1.5)) },
};
export const TREAT_COST = 35;
export const REVIVE_COST = 0.35; // fraction of pet max HP spent to revive the player
export const MAX_WEAPONS = 8;
export const MAX_ARMORS = 6;
export const MAX_ALLIES = 3;

// ---------- items ----------
let uid = 1;
export function makeItem(type, id, extra = {}) {
  return {
    uid: uid++, type, id,
    element: null, elLevel: 0,
    ench: { sharpness: 0, swiftness: 0, vampire: 0, critical: 0 },
    ...extra,
  };
}
export const itemDef = (item) => (item.type === 'weapon' ? WEAPONS[item.id] : ARMORS[item.id]);
export const itemRarity = (item) => itemDef(item).rarity;
export function itemName(item) {
  const d = itemDef(item);
  if (item.type === 'weapon' && item.element) return `${ELEMENTS[item.element].name} ${d.name}`;
  return d.name;
}
export function enchantList(item) {
  if (item.type !== 'weapon') return [];
  const out = [];
  for (const k of Object.keys(ENCHANTS)) if (item.ench[k]) out.push(`${ENCHANTS[k].name} ${ROMAN[item.ench[k]]}`);
  return out;
}
export function weaponDps(item) {
  const d = WEAPONS[item.id];
  let dmg = d.dmg * (1 + item.ench.sharpness * 0.15);
  if (item.element) dmg *= 1 + ELEMENT_BONUS[item.elLevel];
  dmg *= 1 + item.ench.critical * 0.1;
  const rate = d.rate / (1 + item.ench.swiftness * 0.12);
  return (dmg * (d.shots || 1)) / rate;
}
export function itemValue(item) {
  const d = itemDef(item);
  let v = d.price || 12;
  if (item.type === 'weapon') {
    for (const k of Object.keys(ENCHANTS)) for (let l = 1; l <= item.ench[k]; l++) v += ENCHANTS[k].cost(l) * 0.6;
    for (let l = 1; l <= item.elLevel; l++) v += ELEMENT_COST[l] * 0.6;
  }
  return v;
}
export const sellPrice = (item) => Math.max(5, Math.round(itemValue(item) * 0.4));

export function rollRarity(wave, luck = 0) {
  return weightedPick([
    ['common', Math.max(6, 55 - wave * 3.5 - luck * 25)],
    ['uncommon', 30 + luck * 6],
    ['rare', 9 + wave * 1.6 + luck * 14],
    ['epic', wave >= 3 ? 1.5 + wave * 0.9 + luck * 8 : luck * 3],
    ['legendary', wave >= 5 ? 0.3 + wave * 0.35 + luck * 3 : 0],
  ]);
}

export function rollItem(wave, luck = 0) {
  const rar = rollRarity(wave, luck);
  const pool = [];
  for (const [k, d] of Object.entries(WEAPONS)) if (d.rarity === rar && k !== 'wood_sword') pool.push(['weapon', k]);
  for (const [k, d] of Object.entries(ARMORS)) if (d.rarity === rar) pool.push(['armor', k]);
  const [type, id] = pick(pool);
  const item = makeItem(type, id);
  if (type === 'weapon') {
    if (Math.random() < 0.15 + luck * 0.25) { item.element = pick(ELEMENT_KEYS); item.elLevel = 1; }
    if (Math.random() < 0.25 + luck * 0.25) {
      const e = pick(Object.keys(ENCHANTS));
      item.ench[e] = Math.min(ENCHANTS[e].max, 1 + (Math.random() < 0.3 ? 1 : 0));
    }
  }
  return item;
}
