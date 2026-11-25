// HUD, floating labels, minimap, shop/backpack panel, menus.
import * as THREE from 'three';
import { G, enemies, allies, diff, recordKey } from './game.js';
import {
  RARITY, ELEMENTS, ELEMENT_KEYS, ELEMENT_BONUS, ENCHANTS, PET_UPGRADES, PETS, WEAPONS, ARMORS,
  TREAT_COST, MAX_WEAPONS, MAX_ARMORS, QUESTS, DIFFICULTIES, DIFFICULTY_KEYS, itemName, itemRarity, enchantList, weaponDps, sellPrice,
} from './data.js';
import { itemIcon, getIcon, makePet } from './models.js';
import { Input } from './input.js';
import { ROMAN } from './util.js';
import { Audio } from './audio.js';
import { BURST_CD } from './pet.js';
import { HALF, CELL, ISLANDS } from './world.js';

const $ = (id) => document.getElementById(id);
const proj = new THREE.Vector3();
let shopApi = null;

const ICON = {
  coin: '<span class="coin-ico" aria-hidden="true"></span>',
  shield: '<svg viewBox="0 0 24 24" class="ico" aria-hidden="true"><path d="M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5z" fill="currentColor"/></svg>',
  heart: '<svg viewBox="0 0 24 24" class="ico" aria-hidden="true"><path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.8 4.5c2.1 0 3.6 1.1 5.2 3 1.6-1.9 3.1-3 5.2-3 3.8 0 5.9 3.9 4.4 7.3C19.5 16.4 12 21 12 21z" fill="currentColor"/></svg>',
  paw: '<svg viewBox="0 0 24 24" class="ico" aria-hidden="true"><ellipse cx="6" cy="10" rx="2.2" ry="2.8" fill="currentColor"/><ellipse cx="10" cy="6" rx="2.2" ry="2.8" fill="currentColor"/><ellipse cx="14.5" cy="6" rx="2.2" ry="2.8" fill="currentColor"/><ellipse cx="18.5" cy="10" rx="2.2" ry="2.8" fill="currentColor"/><path d="M12 11c3 0 6 4.5 6 7 0 2-2 2.6-3.2 2.2-1-.3-1.8-.8-2.8-.8s-1.8.5-2.8.8C8 20.6 6 20 6 18c0-2.5 3-7 6-7z" fill="currentColor"/></svg>',
  wing: '<svg viewBox="0 0 24 24" class="ico" aria-hidden="true"><path d="M2 14c3-1 5-4 6-8 1 3 0 6-1 8 2-1 4-3 5-6 0 3-1 6-3 8 2 0 4-1 6-3-1 3-3 5-6 6 2 .5 4 0 6-1-2 2-5 3-8 3-3 0-6-2-10-7z" fill="currentColor"/></svg>',
  check: '<svg viewBox="0 0 24 24" class="ico" aria-hidden="true"><path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z" fill="currentColor"/></svg>',
  dome: '<svg viewBox="0 0 24 24" class="ico" aria-hidden="true"><path d="M2 20h20v2H2zM4 19a8 8 0 0 1 16 0zM11 3h2v4h-2z" fill="currentColor"/></svg>',
  skull: '<svg viewBox="0 0 24 24" class="ico" aria-hidden="true"><path d="M12 2C7 2 3.5 5.6 3.5 10.2c0 2.8 1.3 5 3.5 6.3V20c0 1.1.9 2 2 2h6c1.1 0 2-.9 2-2v-3.5c2.2-1.3 3.5-3.5 3.5-6.3C20.5 5.6 17 2 12 2zM8.5 14a2 2 0 1 1 0-4 2 2 0 0 1 0 4zm7 0a2 2 0 1 1 0-4 2 2 0 0 1 0 4z" fill="currentColor"/></svg>',
};

const fmt = (n) => Math.floor(n).toLocaleString('en-US');
const fmtTime = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const diffTag = () => `<span class="diff-tag" style="--dc:${diff().color}">${diff().name}</span>`;

function statLine(item) {
  if (item.type === 'armor') {
    const d = ARMORS[item.id];
    return `${Math.round(d.def * 100)}% damage reduction · +${d.hp} HP`;
  }
  const d = WEAPONS[item.id];
  return `${d.kind === 'bow' ? 'Bow' : 'Sword'} · ${d.dmg}${d.shots ? ' x' + d.shots : ''} dmg · ${Math.round(weaponDps(item))} DPS`;
}
function elementTag(item) {
  if (!item.element) return '';
  const e = ELEMENTS[item.element];
  return `<span class="el-tag" style="--el:${e.color}">${e.name} ${ROMAN[item.elLevel]}</span>`;
}

export const UI = {
  labels: new Map(),
  dmgs: [],
  promptText: '',
  panelTab: 'weapons',
  panelMsg: '',
  moneyShown: 0,
  hpLag: 1,
  bannerT: 0,

  init(shop, handlers) {
    shopApi = shop;
    this.handlers = handlers;
    const root = document.createElement('div');
    root.id = 'ui';
    root.innerHTML = `
      <div id="hud" hidden>
        <div class="hud-tl">
          <div class="card">
            <div class="card-row"><span class="label">You</span><span class="chip" id="armorChip">${ICON.shield}<span>0%</span></span></div>
            <div class="bar hp"><div class="lag" id="hpLag"></div><div class="fill" id="hpFill"></div><span id="hpText"></span></div>
          </div>
          <div class="card pet-card" id="petCard">
            <img id="petPortrait" alt="" />
            <div class="pet-info">
              <div class="card-row"><span class="label" id="petName"></span><span class="chip heal-chip" id="petHeal">${ICON.heart}<span></span></span></div>
              <div class="bar pet"><div class="fill" id="petFill"></div><span id="petText"></span></div>
              <div class="sub" id="petSub"></div>
            </div>
          </div>
          <div id="allyList"></div>
          <div class="card quests" id="questBox"></div>
        </div>
        <div class="hud-top">
          <div id="waveTitle">WAVE 1</div>
          <div id="waveSub"></div>
          <div id="bossBar" hidden><div class="bb-name"></div><div class="bb-bar"><div class="bb-fill"></div></div></div>
          <div id="safeChip" hidden>${ICON.dome}<span>Safe in the shelter · healing fast</span></div>
        </div>
        <div class="hud-tr">
          <div class="money" id="moneyBox">${ICON.coin}<span id="money">0</span><span id="moneyPop"></span></div>
          <div class="map-wrap"><canvas id="minimap" width="190" height="190"></canvas></div>
          <div class="kills">${ICON.skull}<span id="kills">0</span></div>
        </div>
        <div id="notifs"></div>
        <div class="hud-bl">
          <div class="ability" id="ability"><div class="ab-key" id="abKey">Q</div><div class="ab-cd" id="abCd"></div><div class="ab-txt">Pet Heal</div></div>
          <div class="ability ride" id="rideAb" hidden><div class="ab-key" id="rideKey">F</div><div class="ab-txt" id="rideTxt">Ride</div></div>
          <div class="hint" id="hint"></div>
        </div>
        <div class="hud-bottom">
          <div id="weaponInfo"></div>
          <div id="hotbar"></div>
        </div>
        <div id="crosshair"></div>
        <div id="prompt" hidden></div>
        <div id="banner"><div class="b-title"></div><div class="b-sub"></div></div>
        <div id="vignette"></div>
        <div id="petVignette"></div>
        <div id="flash"></div>
      </div>
      <div id="labels"></div>
      <div id="panel" hidden role="dialog" aria-label="Shop"></div>
      <div id="menu"></div>
      <div id="pause" hidden></div>
      <div id="gameover" hidden></div>
      <div id="victory" hidden></div>`;
    document.body.appendChild(root);
    this.labelsEl = $('labels');
    this.mapCtx = $('minimap').getContext('2d');
    $('panel').addEventListener('click', (e) => this.onPanelClick(e));
    $('hotbar').addEventListener('click', (e) => {
      const s = e.target.closest('[data-slot]');
      if (s && G.player) G.player.equip(+s.dataset.slot);
    });
    this.buildMenu();
  },

  // ---------- menus ----------
  buildMenu() {
    const pets = Object.entries(PETS)
      .map(([id, p]) => `
        <button class="pet-pick${id === G.petId ? ' on' : ''}" data-pet="${id}" id="pet-${id}">
          <img src="${getIcon('pet:' + id, () => makePet(id).root, 'front')}" alt="" />
          <span class="pp-name">${p.name}</span>
          <span class="pp-species">${p.species}</span>
          <span class="pp-stats"><b>${p.hp}</b> HP · heals <b>${p.heal}</b>/s</span>
          <span class="pp-blurb">${p.blurb}</span>
        </button>`)
      .join('');
    const diffs = DIFFICULTY_KEYS.map((k, i) => {
      const d = DIFFICULTIES[k];
      return `<button class="diff-pick${k === G.difficulty ? ' on' : ''}" data-diff="${k}" role="radio" aria-checked="${k === G.difficulty}" style="--dc:${d.color}">
          <span class="dp-pips">${'<i></i>'.repeat(i + 1)}</span><span class="dp-name">${d.name}</span></button>`;
    }).join('');
    const k = (c) => Input.label(c);
    $('menu').innerHTML = `
      <div class="menu-inner">
        <div class="logo"><span class="l1">PETS</span><span class="l2">at</span><span class="l1">WAR</span></div>
        <p class="credits">a game by <b>Nylan</b>, <b>Claude</b> and <b>Frédéric</b></p>
        <p class="tagline">Your pet keeps you alive. Keep your pet alive.<br><span>Find three Sky Relics, give your pet wings, and ride it into battle against Ignis the Dragon.</span></p>
        <div class="pet-row">${pets}</div>
        <div class="diff-wrap">
          <div class="diff-row" role="radiogroup" aria-label="Difficulty">${diffs}</div>
          <p class="diff-blurb" id="diffBlurb">${diff().blurb}</p>
        </div>
        <button class="play" id="playBtn">PLAY</button>
        <div class="best" id="bestLine">${this.bestLine()}</div>
        <div class="controls">
          <div><kbd>${k('KeyW')}</kbd><kbd>${k('KeyA')}</kbd><kbd>${k('KeyS')}</kbd><kbd>${k('KeyD')}</kbd> move</div>
          <div><kbd>Mouse</kbd> look · <kbd>Click</kbd> attack</div>
          <div><kbd>Space</kbd> jump · <kbd>Shift</kbd> sprint</div>
          <div><kbd>${k('KeyE')}</kbd> pick up / open / tame</div>
          <div><kbd>${k('KeyQ')}</kbd> pet heal burst · <kbd>F</kbd> ride your pet</div>
          <div><kbd>B</kbd> shop · <kbd>${k('KeyI')}</kbd> backpack · <kbd>J</kbd> quests</div>
          <div class="wide">Walk into a portal to travel to another island · riding: <kbd>Space</kbd> climb, <kbd>Shift</kbd> dive</div>
        </div>
        <div class="menu-opts">
          <button class="opt" id="qualBtn">Graphics: ${G.quality === 'high' ? 'High' : 'Fast'}</button>
          <button class="opt" id="muteBtn">Sound: ${Audio.muted ? 'Off' : 'On'}</button>
        </div>
      </div>`;
    $('menu').querySelectorAll('.pet-pick').forEach((b) =>
      b.addEventListener('click', () => {
        G.petId = b.dataset.pet;
        $('menu').querySelectorAll('.pet-pick').forEach((x) => x.classList.toggle('on', x === b));
        Audio.init();
        Audio.play('click');
      })
    );
    $('menu').querySelectorAll('.diff-pick').forEach((b) =>
      b.addEventListener('click', () => {
        this.handlers.setDifficulty(b.dataset.diff);
        $('menu').querySelectorAll('.diff-pick').forEach((x) => {
          x.classList.toggle('on', x === b);
          x.setAttribute('aria-checked', String(x === b));
        });
        $('diffBlurb').textContent = diff().blurb;
        $('bestLine').innerHTML = this.bestLine();
        Audio.init();
        Audio.play('click');
      })
    );
    $('playBtn').addEventListener('click', () => this.handlers.start());
    $('qualBtn').addEventListener('click', () => { this.handlers.toggleQuality(); $('qualBtn').textContent = `Graphics: ${G.quality === 'high' ? 'High' : 'Fast'}`; });
    $('muteBtn').addEventListener('click', () => { Audio.toggle(); $('muteBtn').textContent = `Sound: ${Audio.muted ? 'Off' : 'On'}`; });
  },
  // Records for the difficulty picked on the menu.
  bestLine() {
    let best = 0, bestWin = 0;
    try {
      best = +localStorage.getItem(recordKey('paw-best-wave')) || 0;
      bestWin = +localStorage.getItem(recordKey('paw-best-win')) || 0;
    } catch (e) { best = 0; }
    const parts = [];
    if (bestWin) parts.push(`Dragon slain in ${fmtTime(bestWin)}`);
    if (best) parts.push(`Best wave: ${best}`);
    return parts.length ? `${diff().name}: ${parts.join(' · ')}` : '';
  },
  showMenu() {
    this.buildMenu();
    $('menu').hidden = false;
    $('hud').hidden = true;
    $('gameover').hidden = true;
    $('victory').hidden = true;
    $('pause').hidden = true;
    $('panel').hidden = true;
    this.clearLabels();
  },
  startHUD() {
    $('menu').hidden = true;
    $('hud').hidden = false;
    $('gameover').hidden = true;
    $('victory').hidden = true;
    $('notifs').innerHTML = '';
    $('safeChip').hidden = true;
    this.refreshQuests();
    const pet = G.pet;
    $('petPortrait').src = getIcon('pet:' + pet.id, () => makePet(pet.id).root, 'front');
    $('petName').textContent = `${pet.name} the ${pet.def.species}`;
    $('abKey').textContent = Input.label('KeyQ');
    this.moneyShown = G.money;
    $('money').textContent = fmt(G.money);
    this.refreshHotbar();
    this.refreshAllies();
    this.clearLabels();
  },
  showPause() {
    const k = (c) => Input.label(c);
    $('pause').innerHTML = `
      <div class="modal">
        <h2>Paused</h2>
        <p class="muted">${diffTag()} Click Resume to lock the mouse again.</p>
        <button class="play small" id="resumeBtn">Resume</button>
        <div class="menu-opts">
          <button class="opt" id="pQual">Graphics: ${G.quality === 'high' ? 'High' : 'Fast'}</button>
          <button class="opt" id="pMute">Sound: ${Audio.muted ? 'Off' : 'On'}</button>
          <button class="opt" id="pQuit">Quit to menu</button>
        </div>
        <div class="controls compact">
          <div><kbd>${k('KeyW')}</kbd><kbd>${k('KeyA')}</kbd><kbd>${k('KeyS')}</kbd><kbd>${k('KeyD')}</kbd> move · <kbd>Space</kbd> jump</div>
          <div><kbd>${k('KeyE')}</kbd> interact · <kbd>${k('KeyQ')}</kbd> pet heal · <kbd>F</kbd> ride · <kbd>B</kbd> shop · <kbd>J</kbd> quests</div>
          <div>Riding: <kbd>Space</kbd> climb · <kbd>Shift</kbd> dive</div>
        </div>
      </div>`;
    $('pause').hidden = false;
    $('resumeBtn').addEventListener('click', () => this.handlers.resume());
    $('pQual').addEventListener('click', () => { this.handlers.toggleQuality(); $('pQual').textContent = `Graphics: ${G.quality === 'high' ? 'High' : 'Fast'}`; });
    $('pMute').addEventListener('click', () => { Audio.toggle(); $('pMute').textContent = `Sound: ${Audio.muted ? 'Off' : 'On'}`; });
    $('pQuit').addEventListener('click', () => this.handlers.quit());
  },
  hidePause() { $('pause').hidden = true; },
  showGameOver(best) {
    const s = G.stats;
    const pet = G.pet;
    const mins = Math.floor(s.time / 60), secs = Math.floor(s.time % 60);
    $('gameover').innerHTML = `
      <div class="modal go">
        <img class="go-pet" src="${getIcon('pet:' + pet.id, () => makePet(pet.id).root, 'front')}" alt="" />
        <h2>${pet.name} has fallen</h2>
        <p class="muted">${diffTag()} Without your pet, nobody can bring you back.</p>
        <div class="go-stats">
          <div><b>${s.wave}</b><span>wave reached</span></div>
          <div><b>${s.kills}</b><span>monsters defeated</span></div>
          <div><b>${fmt(s.earned)}</b><span>coins earned</span></div>
          <div><b>${s.tamed}</b><span>monsters tamed</span></div>
          <div><b>${mins}:${String(secs).padStart(2, '0')}</b><span>time survived</span></div>
          <div><b>${best}</b><span>best wave</span></div>
        </div>
        <div class="go-btns">
          <button class="play small" id="againBtn">Play again</button>
          <button class="opt" id="menuBtn">Change pet or difficulty</button>
        </div>
      </div>`;
    $('gameover').hidden = false;
    $('againBtn').addEventListener('click', () => this.handlers.start());
    $('menuBtn').addEventListener('click', () => this.handlers.quit());
  },

  showVictory(bestTime) {
    const s = G.stats;
    const pet = G.pet;
    $('victory').innerHTML = `
      <div class="modal go win">
        <img class="go-pet" src="${getIcon('pet:' + pet.id, () => makePet(pet.id).root, 'front')}" alt="" />
        <div class="win-kicker">Victory</div>
        <h2>Ignis the Dragon is slain</h2>
        <p class="muted">${diffTag()} ${pet.name} and you saved the islands. The skies are yours.</p>
        <div class="go-stats">
          <div><b>${fmtTime(s.time)}</b><span>time to win</span></div>
          <div><b>${s.kills}</b><span>monsters defeated</span></div>
          <div><b>${s.bosses}</b><span>bosses beaten</span></div>
          <div><b>${s.wave}</b><span>wave reached</span></div>
          <div><b>${s.tamed}</b><span>monsters tamed</span></div>
          <div><b>${fmtTime(bestTime)}</b><span>best win</span></div>
        </div>
        <div class="go-btns">
          <button class="play small" id="winAgain">Play again</button>
          <button class="opt" id="winMenu">Change pet or difficulty</button>
        </div>
      </div>`;
    $('victory').hidden = false;
    $('winAgain').addEventListener('click', () => this.handlers.start());
    $('winMenu').addEventListener('click', () => this.handlers.quit());
  },

  keyLabel(code) { return Input.label(code); },

  flash(color = '#ffffff') {
    const f = $('flash');
    f.style.setProperty('--c', color);
    f.classList.remove('on');
    void f.offsetWidth;
    f.classList.add('on');
  },

  // Quest tracker under the minimap.
  refreshQuests() {
    const Q = this.handlers.quests && this.handlers.quests();
    if (!Q || !$('questBox')) return;
    let html = '';
    if (Q.stage === 'relics' || Q.stage === 'empower') {
      html += `<div class="q-head">${ICON.wing}<span>Sky Relics ${Q.relics()}/3</span></div>`;
      for (const q of QUESTS) {
        const done = Q.done[q.id];
        const prog = q.goal && !done ? ` <em>${Q.feathers}/${q.goal}</em>` : '';
        html += `<div class="q-row${done ? ' done' : ''}" style="--qc:${q.color}"><i>${done ? ICON.check : ''}</i><span>${q.title}${prog}</span></div>`;
      }
      if (Q.stage === 'empower') html += `<div class="q-row next"><i>!</i><span>Return to the Elder at the shrine</span></div>`;
    } else if (Q.stage === 'dragon') {
      html += `<div class="q-head dragon">${ICON.wing}<span>Final quest</span></div>
        <div class="q-row next" style="--qc:#ff6a4a"><i>!</i><span>Slay Ignis the Dragon on Dragon's Roost</span></div>
        <div class="q-tip">Ride with <kbd>F</kbd> · Frost hurts it most</div>`;
    } else {
      html += `<div class="q-head">${ICON.check}<span>The islands are free</span></div>`;
    }
    $('questBox').innerHTML = html;
  },

  // ---------- HUD pieces ----------
  refreshHotbar() {
    const p = G.player;
    if (!p) return;
    let html = '';
    for (let i = 0; i < MAX_WEAPONS; i++) {
      const w = p.weapons[i];
      if (!w) {
        html += `<div class="slot empty"><span class="sk">${i + 1}</span></div>`;
        continue;
      }
      const rar = RARITY[itemRarity(w)];
      const el = w.element ? ELEMENTS[w.element] : null;
      html += `<button class="slot${i === p.slot ? ' on' : ''}" data-slot="${i}" style="--rar:${rar.color}" aria-label="${itemName(w)}">
        <img src="${itemIcon(w)}" alt="" /><span class="sk">${i + 1}</span>${el ? `<span class="el-dot" style="background:${el.color}"></span>` : ''}</button>`;
    }
    $('hotbar').innerHTML = html;
    const w = p.weapon;
    if (w) {
      const rar = RARITY[itemRarity(w)];
      const ench = enchantList(w).join(' · ');
      $('weaponInfo').innerHTML = `<span class="wi-name" style="color:${rar.color}">${itemName(w)}</span>${elementTag(w)}<span class="wi-stats">${statLine(w)}${ench ? ' · ' + ench : ''}</span>`;
    }
    const a = p.armorDef();
    $('armorChip').querySelector('span').textContent = a ? `${Math.round(a.def * 100)}%` : '0%';
    $('armorChip').title = a ? a.name : 'No armor';
  },
  refreshAllies() {
    const list = allies();
    $('allyList').innerHTML = list.length
      ? list.map((a, i) => `<div class="ally"><span class="ally-ico">${ICON.paw}</span><span class="ally-name">${a.def.name}</span><div class="bar mini ally-bar"><div class="fill" id="ally${i}"></div></div></div>`).join('')
      : '';
  },
  notify(html, color = '#fff', item = null) {
    const el = document.createElement('div');
    el.className = 'notif';
    el.style.setProperty('--c', color);
    el.innerHTML = (item ? `<img src="${itemIcon(item)}" alt="" />` : '') + `<span>${html}</span>`;
    $('notifs').prepend(el);
    while ($('notifs').children.length > 5) $('notifs').lastChild.remove();
    setTimeout(() => el.classList.add('out'), 3800);
    setTimeout(() => el.remove(), 4400);
  },
  banner(title, sub = '', color = '#ffcf4a') {
    const b = $('banner');
    b.querySelector('.b-title').textContent = title;
    b.querySelector('.b-sub').textContent = sub;
    b.style.setProperty('--c', color);
    b.classList.remove('show');
    void b.offsetWidth;
    b.classList.add('show');
  },
  moneyPop(v) {
    const el = $('moneyPop');
    el.textContent = `+${v}`;
    el.classList.remove('pop');
    void el.offsetWidth;
    el.classList.add('pop');
  },
  hurt() {
    const v = $('vignette');
    v.classList.remove('hit');
    void v.offsetWidth;
    v.classList.add('hit');
  },
  petHurt() {
    const v = $('petVignette');
    v.classList.remove('hit');
    void v.offsetWidth;
    v.classList.add('hit');
    $('petCard').classList.remove('shake');
    void $('petCard').offsetWidth;
    $('petCard').classList.add('shake');
  },
  setSafe(on) {
    $('safeChip').hidden = !on;
    if (on) Audio.play('heal');
  },
  setPrompt(html) {
    if (html === this.promptText) return;
    this.promptText = html;
    const el = $('prompt');
    if (!html) { el.hidden = true; return; }
    el.innerHTML = html;
    el.hidden = false;
  },
  setHint(text) {
    const el = $('hint');
    if (el.textContent !== text) el.textContent = text;
  },

  // ---------- world-space labels ----------
  toScreen(v) {
    proj.copy(v).project(G.camera);
    if (proj.z > 1) return null;
    return { x: (proj.x * 0.5 + 0.5) * window.innerWidth, y: (-proj.y * 0.5 + 0.5) * window.innerHeight };
  },
  dmg(pos, text, color = '#fff', cls = '', tag = null) {
    const el = document.createElement('div');
    el.className = 'dmg ' + cls;
    el.style.color = color;
    el.textContent = text;
    if (tag === 'weak') {
      const t = document.createElement('small');
      t.textContent = 'WEAK';
      el.appendChild(t);
    }
    this.labelsEl.appendChild(el);
    this.dmgs.push({ el, pos: pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.8, 0, (Math.random() - 0.5) * 0.8)), life: 0.9, vy: 2.2 });
    if (this.dmgs.length > 40) {
      const d = this.dmgs.shift();
      d.el.remove();
    }
  },
  worldLabel(html) {
    const el = document.createElement('div');
    el.className = 'wlabel';
    el.innerHTML = html;
    el.hidden = true;
    this.labelsEl.appendChild(el);
    return el;
  },
  clearLabels() {
    for (const [, el] of this.labels) el.remove();
    this.labels.clear();
    for (const d of this.dmgs) d.el.remove();
    this.dmgs.length = 0;
    if (this.merchantEl) {
      this.merchantEl.remove();
      this.elderEl.remove();
      this.shelterEl.remove();
      for (const el of this.portalEls) el.remove();
      this.merchantEl = null;
    }
  },
  updateLabels(dt) {
    const cam = G.camera;
    const seen = new Set();
    for (const m of G.monsters) {
      if (m.dead) continue;
      const d = cam.position.distanceTo(m.pos);
      const low = m.hp / m.maxHp;
      const show = (m.ally && d < 120) || (m.def.boss && d < (m.def.flying ? 220 : 120)) || d < 45;
      if (!show) continue;
      const sp = this.toScreen(proj.set(m.pos.x, m.pos.y + m.height + 0.45, m.pos.z));
      if (!sp) continue;
      seen.add(m);
      let el = this.labels.get(m);
      if (!el) {
        el = document.createElement('div');
        el.className = 'mlabel' + (m.def.boss ? ' boss ' + m.type : '');
        el.innerHTML = `<div class="ml-name"></div><div class="ml-bar"><div class="ml-fill"></div></div>`;
        this.labelsEl.appendChild(el);
        this.labels.set(m, el);
        el._state = '';
      }
      const canTame = m.tameable && !m.ally && low <= 0.35;
      const state = `${m.ally ? 'a' : 'e'}${canTame ? 't' : ''}${m.level}${m.dormant ? 'z' : ''}`;
      if (el._state !== state) {
        el._state = state;
        el.classList.toggle('ally', m.ally);
        el.classList.toggle('tame', canTame);
        el.querySelector('.ml-name').innerHTML = (m.ally ? ICON.heart : canTame ? ICON.paw : '') + `<span>${m.def.name}</span>${m.def.fixedLevel ? '' : `<em>Lv ${m.level}</em>`}${m.dormant ? '<em>asleep</em>' : ''}`;
      }
      el.querySelector('.ml-fill').style.width = `${Math.max(0, low) * 100}%`;
      const scale = Math.max(0.6, Math.min(1.1, 22 / d));
      el.style.transform = `translate(${sp.x}px, ${sp.y}px) translate(-50%, -100%) scale(${m.def.boss ? 1.2 : scale})`;
      el.style.opacity = m.ally || m.def.boss || low < 1 || d < 22 ? 1 : 0.55;
    }
    for (const [m, el] of this.labels) {
      if (!seen.has(m)) {
        el.remove();
        this.labels.delete(m);
      }
    }
    // merchant, Elder and portal tags
    if (G.world) {
      if (!this.merchantEl) {
        this.merchantEl = this.worldLabel('<b>Merchant</b><span>Press B to shop</span>');
        this.elderEl = this.worldLabel('<b class="elder">Elder</b><span>Press E to talk</span>');
        this.portalEls = G.world.portals.map(() => this.worldLabel(''));
        this.shelterEl = this.worldLabel(`<b class="safe">${ICON.dome} Shelter</b><span>Monsters can't get in</span>`);
      }
      const calm = this.handlers.waves().state === 'prep';
      const pp = G.player ? G.player.pos : cam.position;
      const place = (el, pos, yOff, maxD) => {
        const sp = this.toScreen(proj.set(pos.x, pos.y + yOff, pos.z));
        const d = pp.distanceTo(pos);
        if (sp && d < maxD) {
          el.hidden = false;
          el.style.transform = `translate(${sp.x}px, ${sp.y}px) translate(-50%, -100%)`;
        } else el.hidden = true;
      };
      place(this.merchantEl, G.world.merchantPos, 4.9, calm ? 55 : 18);
      const S = G.world.shelter;
      if (S.active && G.playerIsland === 'haven' && !G.inShelter) place(this.shelterEl, S, 11.2, 95);
      else this.shelterEl.hidden = true;
      const Q = this.handlers.quests();
      const ready = Q.stage === 'empower';
      if (this.elderEl._ready !== ready) {
        this.elderEl._ready = ready;
        this.elderEl.classList.toggle('alert', ready);
        this.elderEl.innerHTML = ready ? '<i class="bang">!</i><b class="elder">Elder</b><span>Bring the relics here</span>' : '<b class="elder">Elder</b><span>Press E to talk</span>';
      }
      place(this.elderEl, G.world.elderPos, 4.4, ready ? 140 : calm ? 50 : 20);
      G.world.portals.forEach((pt, i) => {
        const el = this.portalEls[i];
        const key = `${pt.sealed}`;
        if (el._key !== key) {
          el._key = key;
          const to = ISLANDS[pt.dest];
          el.classList.toggle('sealed', pt.sealed);
          el.innerHTML = pt.sealed ? `<b style="color:#ff6a7a">Sealed</b><span>${to.name}</span>` : `<b style="color:${to.color}">${to.name}</b><span>Portal</span>`;
        }
        place(el, pt, 6.6, 40);
      });
    }
    // damage numbers
    for (let i = this.dmgs.length - 1; i >= 0; i--) {
      const d = this.dmgs[i];
      d.life -= dt;
      d.pos.y += d.vy * dt;
      d.vy *= Math.exp(-dt * 2);
      const sp = this.toScreen(d.pos);
      if (d.life <= 0 || !sp) {
        d.el.remove();
        this.dmgs.splice(i, 1);
        continue;
      }
      const k = d.life / 0.9;
      const pop = k > 0.8 ? 1 + (k - 0.8) * 3 : 1;
      d.el.style.transform = `translate(${sp.x}px, ${sp.y}px) translate(-50%, -50%) scale(${pop})`;
      d.el.style.opacity = Math.min(1, k * 2.5);
    }
  },

  // ---------- per-frame HUD ----------
  update(dt) {
    if (!G.player || $('hud').hidden) return;
    const p = G.player, pet = G.pet;
    const hpK = Math.max(0, p.hp / p.maxHp);
    $('hpFill').style.width = hpK * 100 + '%';
    this.hpLag = hpK < this.hpLag ? this.hpLag - dt * 0.5 : hpK;
    $('hpLag').style.width = Math.max(hpK, this.hpLag) * 100 + '%';
    $('hpText').textContent = p.downed > 0 ? 'KNOCKED OUT' : `${Math.ceil(p.hp)} / ${p.maxHp}`;
    $('hpFill').parentElement.classList.toggle('low', hpK < 0.3);
    const petK = Math.max(0, pet.hp / pet.maxHp);
    $('petFill').style.width = petK * 100 + '%';
    $('petText').textContent = `${Math.ceil(pet.hp)} / ${pet.maxHp}`;
    const revive = diff().revive;
    $('petCard').classList.toggle('danger', petK <= revive);
    $('petHeal').querySelector('span').textContent = `${pet.healRate.toFixed(1)}/s`;
    $('petHeal').classList.toggle('active', pet.healing);
    $('petSub').textContent = petK <= revive ? 'Too weak to revive you!' : `Revives you for ${Math.round(pet.maxHp * revive)} HP`;

    // money ticker
    if (this.moneyShown !== G.money) {
      const diff = G.money - this.moneyShown;
      this.moneyShown += Math.abs(diff) < 1 ? diff : diff * Math.min(1, dt * 10);
      $('money').textContent = fmt(Math.round(this.moneyShown));
    }
    $('kills').textContent = G.stats.kills;

    // wave (on Haven) or location name (elsewhere)
    const W = this.handlers.waves();
    const isl = G.playerIsland;
    if (isl === 'haven') {
      if (W.state === 'prep') {
        $('waveTitle').textContent = W.n === 0 ? 'GET READY' : `WAVE ${W.n} CLEARED`;
        $('waveSub').textContent = `Wave ${W.n + 1} in ${Math.ceil(W.timer)}s`;
      } else {
        $('waveTitle').textContent = `WAVE ${W.n}`;
        const rem = W.remaining();
        $('waveSub').textContent = `${rem} monster${rem === 1 ? '' : 's'} left`;
      }
      $('waveTitle').style.color = '';
    } else {
      const I = isl ? ISLANDS[isl] : null;
      $('waveTitle').textContent = I ? I.name.toUpperCase() : 'OPEN SEA';
      $('waveTitle').style.color = I ? I.color : '#9fd8ff';
      $('waveSub').textContent = W.n > 0 || W.state === 'active' ? 'Haven waves wait for your return' : I ? I.sub : 'Flying between the islands';
    }

    // boss health bar: the closest boss that is awake
    let boss = null, bd = 1e9;
    for (const m of enemies()) {
      if (!m.def.boss || m.dormant) continue;
      const d = m.pos.distanceTo(p.pos);
      if (d < (m.def.flying ? 200 : 75) && d < bd) { bd = d; boss = m; }
    }
    const bb = $('bossBar');
    if (boss) {
      bb.hidden = false;
      if (bb._m !== boss) {
        bb._m = boss;
        bb.querySelector('.bb-name').textContent = boss.def.name;
        bb.className = boss.type;
      }
      bb.querySelector('.bb-fill').style.width = `${Math.max(0, boss.hp / boss.maxHp) * 100}%`;
    } else bb.hidden = true;

    // ride button
    const ride = $('rideAb');
    ride.hidden = !pet.winged;
    if (pet.winged) {
      $('rideKey').textContent = Input.label('KeyF');
      $('rideTxt').textContent = p.mounted ? 'Land' : 'Ride';
      ride.classList.toggle('ready', !p.mounted);
    }

    // pet ability
    const cd = pet.burstCd;
    $('ability').classList.toggle('ready', cd <= 0);
    $('abCd').style.height = (cd / BURST_CD) * 100 + '%';

    // allies
    allies().forEach((a, i) => {
      const f = $('ally' + i);
      if (f) f.style.width = (a.hp / a.maxHp) * 100 + '%';
    });

    $('crosshair').classList.toggle('on', Input.locked || Input.touchActive);
    this.setHint(
      !Input.locked && !Input.touchActive ? 'Click the game to lock the mouse, or hold right-click and drag to turn the camera.'
        : p.mounted ? `Flying · Space climb · Shift dive · ${Input.label('KeyF')} land` : ''
    );
    this.updateLabels(dt);
    this.drawMinimap();
  },

  drawMinimap() {
    const ctx = this.mapCtx;
    const W = 190, R = W / 2;
    const p = G.player;
    // zoom out while flying so the other islands show up
    const want = p.mounted ? 170 : 70;
    this.mapRange = (this.mapRange || 70) + (want - (this.mapRange || 70)) * 0.08;
    const range = this.mapRange;
    const scale = R / range;
    const yaw = G.cam.yaw;
    ctx.save();
    ctx.clearRect(0, 0, W, W);
    ctx.beginPath();
    ctx.arc(R, R, R - 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = '#2a70b0';
    ctx.fillRect(0, 0, W, W);
    ctx.translate(R, R);
    ctx.rotate(yaw);
    ctx.save();
    ctx.scale(scale * CELL, scale * CELL);
    ctx.translate(-(p.pos.x + HALF) / CELL, -(p.pos.z + HALF) / CELL);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(G.world.mapCanvas, 0, 0);
    ctx.restore();
    const sx = (x) => (x - p.pos.x) * scale, sz = (z) => (z - p.pos.z) * scale;
    const dot = (x, z, r, color, stroke) => {
      ctx.beginPath();
      ctx.arc(sx(x), sz(z), r, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      if (stroke) { ctx.lineWidth = 1.5; ctx.strokeStyle = stroke; ctx.stroke(); }
    };
    const diamond = (x, z, r, color) => {
      ctx.save();
      ctx.translate(sx(x), sz(z));
      ctx.rotate(Math.PI / 4 - yaw);
      ctx.fillStyle = color;
      ctx.strokeStyle = '#1a0f00';
      ctx.lineWidth = 1.5;
      ctx.fillRect(-r, -r, r * 2, r * 2);
      ctx.strokeRect(-r, -r, r * 2, r * 2);
      ctx.restore();
    };
    const S = G.world.shelter;
    if (S.active) {
      ctx.beginPath();
      ctx.arc(sx(S.x), sz(S.z), Math.max(5, S.r * scale), 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(94,255,208,0.28)';
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = '#5effd0';
      ctx.stroke();
      dot(S.x, S.z, 2.5, '#eafff8', '#0a3a30');
    }
    for (const pt of G.world.portals) dot(pt.x, pt.z, 4.5, pt.sealed ? '#3a2030' : '#' + pt.colors.c2.toString(16).padStart(6, '0'), pt.sealed ? '#ff4a6a' : '#10122a');
    if (G.playerIsland === 'haven' || p.mounted) {
      dot(G.world.merchantPos.x, G.world.merchantPos.z, 4, '#ffcf4a', '#3a2a00');
      const ready = this.handlers.quests().stage === 'empower';
      dot(G.world.elderPos.x, G.world.elderPos.z, ready ? 5.5 : 4, ready ? '#7dffb0' : '#9fd0ff', '#0a2a20');
    }
    for (const c of G.chests) if (!c.opened) dot(c.pos.x, c.pos.z, 4, '#ffd24a', '#ffffff');
    for (const d of G.drops) dot(d.pos.x, d.pos.z, 3, RARITY[itemRarity(d.item)].color, '#000');
    for (const f of this.handlers.regions().feathers) if (!f.collected) diamond(f.pos.x, f.pos.z, 3.6, '#ff9a2a');
    // Monsters are revealed near you, near your pet, and near tamed allies (they scout for you).
    const scouts = [p.pos, G.pet.pos, ...allies().map((a) => a.pos)];
    for (const m of enemies()) {
      let seen = m.def.boss;
      for (const s of scouts) if (!seen && Math.hypot(m.pos.x - s.x, m.pos.z - s.z) < 32) seen = true;
      if (seen) dot(m.pos.x, m.pos.z, m.def.boss ? 5.5 : 3, m.def.flying ? '#ff8a2a' : '#ff4a4a', '#3a0000');
    }
    for (const a of allies()) {
      dot(a.pos.x, a.pos.z, 3.5, '#4fb4ff', '#ffffff');
      ctx.beginPath();
      ctx.arc(sx(a.pos.x), sz(a.pos.z), 32 * scale, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(79,180,255,0.35)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    if (!G.pet.mounted) dot(G.pet.pos.x, G.pet.pos.z, 3.5, '#5effa8', '#0a3a20');
    ctx.restore();
    // player arrow (always pointing up, rotated by facing relative to camera)
    ctx.save();
    ctx.translate(R, R);
    ctx.rotate(-(p.yaw - (yaw + Math.PI)));
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(5, 5);
    ctx.lineTo(0, 2.5);
    ctx.lineTo(-5, 5);
    ctx.closePath();
    ctx.fillStyle = p.mounted ? '#8fe8ff' : '#ffffff';
    ctx.fill();
    ctx.strokeStyle = '#10182a';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  },

  // ---------- shop / backpack panel ----------
  openPanel(tab) {
    if (tab) this.panelTab = tab;
    this.panelMsg = '';
    this.clearConfirm = false;
    this.renderPanel();
    $('panel').hidden = false;
  },
  closePanel() { $('panel').hidden = true; },
  isPanelOpen() { return !$('panel').hidden; },

  renderPanel() {
    const p = G.player, pet = G.pet;
    const tabs = [
      ['quests', 'Quests'], ['weapons', 'Weapons'], ['armor', 'Armor'], ['enchant', 'Enchants'],
      ['element', 'Elements'], ['pet', 'Pet Care'], ['backpack', 'Backpack'],
    ];
    const tabHtml = tabs.map(([k, n]) => `<button class="tab${this.panelTab === k ? ' on' : ''}" data-tab="${k}">${n}</button>`).join('');
    let body = '';
    const card = (o) => `
      <div class="scard${o.owned ? ' owned' : ''}" style="--rar:${o.rarColor || '#c9d3db'}">
        <div class="sc-ico">${o.icon ? `<img src="${o.icon}" alt="" />` : o.glyph || ''}</div>
        <div class="sc-body">
          <div class="sc-name">${o.name}</div>
          ${o.rar ? `<div class="sc-rar">${o.rar}</div>` : ''}
          <div class="sc-stat">${o.stat}</div>
          ${o.extra ? `<div class="sc-extra">${o.extra}</div>` : ''}
        </div>
        <div class="sc-buy">${o.button}</div>
      </div>`;
    const buyBtn = (action, arg, cost, label = 'Buy') =>
      cost === null
        ? `<button class="buy maxed" disabled>Max</button>`
        : `<button class="buy${G.money >= cost ? '' : ' poor'}" data-act="${action}" data-arg="${arg}">${label}<span>${ICON.coin}${fmt(cost)}</span></button>`;
    const held = p.weapon;

    if (this.panelTab === 'quests') {
      const Q = this.handlers.quests();
      const elderSays = {
        relics: `Ignis the Dragon sleeps on Dragon's Roost, and the monsters pouring out of our portals answer to it. Only a pet with <b>Sky Wings</b> can carry you to fight it in the sky. Bring me the three <b>Sky Relics</b> and I will awaken ${pet.name}'s wings.`,
        empower: `You found all three Sky Relics! Stand beside me and I will awaken ${pet.name}'s wings.`,
        dragon: `${pet.name} can fly! Press <kbd>${Input.label('KeyF')}</kbd> to ride, <kbd>Space</kbd> to climb and <kbd>Shift</kbd> to dive. Ignis is awake on Dragon's Roost: the red portal is open, or fly there yourself. Frost hurts it most, and its wounds never heal, so fly back to the merchant for pet treats whenever you need to.`,
        won: 'The dragon is gone and the islands are safe. Thank you, hero.',
      }[Q.stage];
      const rows = QUESTS.map((q) => {
        const done = Q.done[q.id];
        const prog = q.goal ? `<div class="qbar"><div style="width:${(Math.min(Q.feathers, q.goal) / q.goal) * 100}%"></div></div><span class="muted">${Math.min(Q.feathers, q.goal)} / ${q.goal} feathers</span>` : '';
        return `<div class="qcard${done ? ' done' : ''}" style="--qc:${q.color}">
          <div class="qc-check">${done ? ICON.check : ''}</div>
          <div class="qc-body"><div class="qc-relic">${q.relic}</div><div class="qc-title">${q.title}</div><div class="qc-where">${q.where}</div>${prog}</div>
          <div class="qc-state">${done ? 'Found' : 'To do'}</div></div>`;
      }).join('');
      const finalRow = `<div class="qcard final${Q.stage === 'won' ? ' done' : ''}" style="--qc:#ff6a4a">
          <div class="qc-check">${Q.stage === 'won' ? ICON.check : ICON.wing}</div>
          <div class="qc-body"><div class="qc-relic">Final quest</div><div class="qc-title">Ride ${pet.name} and slay Ignis the Dragon</div>
          <div class="qc-where">${Q.stage === 'relics' || Q.stage === 'empower' ? 'Unlocks once your pet has Sky Wings' : "Dragon's Roost · red portal, or fly there"}</div></div>
          <div class="qc-state">${Q.stage === 'won' ? 'Done' : Q.stage === 'dragon' ? 'Go!' : 'Locked'}</div></div>`;
      const btn = Q.stage === 'empower' ? `<button class="play small empower" data-act="empower">Awaken Sky Wings</button>` : '';
      body = `<div class="elder-say"><div class="es-who">The Elder</div><p>${elderSays}</p>${btn}</div><div class="qlist">${rows}${finalRow}</div>`;
    } else if (this.panelTab === 'weapons') {
      body = `<p class="tab-note">New weapons go into your hotbar (${p.weapons.length}/${MAX_WEAPONS} slots used).</p><div class="grid">` +
        Object.entries(WEAPONS)
          .filter(([, d]) => d.price > 0)
          .map(([id, d]) => {
            const item = { type: 'weapon', id, element: null, elLevel: 0, ench: { sharpness: 0, swiftness: 0, vampire: 0, critical: 0 } };
            return card({
              name: d.name, rar: RARITY[d.rarity].name, rarColor: RARITY[d.rarity].color, icon: itemIcon(item),
              stat: statLine(item), extra: d.shots ? 'Fires 3 arrows at once' : d.kind === 'sword' ? `Reach ${d.range}m · hits all in front` : `Arrow speed ${d.speed}`,
              button: buyBtn('weapon', id, d.price),
            });
          }).join('') + '</div>';
    } else if (this.panelTab === 'armor') {
      body = `<p class="tab-note">Armor reduces all damage you take and adds max HP. It shows on your character.</p><div class="grid">` +
        Object.entries(ARMORS)
          .map(([id, d]) => card({
            name: d.name, rar: RARITY[d.rarity].name, rarColor: RARITY[d.rarity].color, icon: itemIcon({ type: 'armor', id }),
            stat: `${Math.round(d.def * 100)}% damage reduction`, extra: `+${d.hp} max HP`,
            owned: p.armor && p.armor.id === id,
            button: buyBtn('armor', id, d.price),
          })).join('') + '</div>';
    } else if (this.panelTab === 'enchant' || this.panelTab === 'element') {
      const rar = RARITY[itemRarity(held)];
      body = `<div class="held" style="--rar:${rar.color}">
          <img src="${itemIcon(held)}" alt="" />
          <div><div class="held-lbl">Upgrading the weapon in your hand</div><div class="held-name" style="color:${rar.color}">${itemName(held)} ${elementTag(held)}</div>
          <div class="held-stat">${statLine(held)}</div>
          <div class="held-ench">${enchantList(held).join(' · ') || 'No enchants yet'}</div></div>
          <div class="held-swap">Switch weapon with <kbd>1</kbd>–<kbd>8</kbd></div>
        </div>`;
      if (this.panelTab === 'enchant') {
        body += '<div class="rows">' + Object.entries(ENCHANTS).map(([k, e]) => {
          const lv = held.ench[k];
          const pips = Array.from({ length: e.max }, (_, i) => `<i class="${i < lv ? 'on' : ''}"></i>`).join('');
          const cost = shopApi.enchantCost(k);
          return `<div class="row"><div class="row-name">${e.name} <span class="pips">${pips}</span></div>
            <div class="row-desc">${lv ? `Now: ${e.text(lv)}` : 'Not enchanted'}${lv < e.max ? ` → <b>${e.text(lv + 1)}</b>` : ''}</div>
            ${buyBtn('enchant', k, cost, lv ? 'Upgrade' : 'Enchant')}</div>`;
        }).join('') + '</div>';
      } else {
        body += `<p class="tab-note">An element adds bonus damage to every hit and a special effect. Each monster has a weakness (x1.75 damage) and a resistance (x0.5).</p><div class="rows">` +
          ELEMENT_KEYS.map((k) => {
            const e = ELEMENTS[k];
            const same = held.element === k;
            const lv = same ? held.elLevel : 0;
            const cost = shopApi.elementCost(k);
            const weakTo = Object.values(this.handlers.monsters()).filter((m) => m.weak === k).map((m) => m.name).join(', ');
            const pips = [1, 2, 3].map((i) => `<i class="${i <= lv ? 'on' : ''}" style="--el:${e.color}"></i>`).join('');
            return `<div class="row el-row" style="--el:${e.color}"><div class="row-name"><span class="el-swatch"></span>${e.name} <span class="pips el">${pips}</span></div>
              <div class="row-desc">${e.desc} · +${Math.round(ELEMENT_BONUS[Math.min(3, lv + 1)] * 100)}% damage at level ${ROMAN[Math.min(3, lv + 1)]}<br><span class="muted">Strong against: ${weakTo}</span></div>
              ${buyBtn('element', k, cost, same ? 'Upgrade' : held.element ? 'Replace' : 'Infuse')}</div>`;
          }).join('') + '</div>';
      }
    } else if (this.panelTab === 'pet') {
      const petIcon = getIcon('pet:' + pet.id, () => makePet(pet.id).root, 'front');
      body = `<div class="held pet-held"><img src="${petIcon}" alt="" /><div><div class="held-lbl">Your pet</div>
          <div class="held-name">${pet.name} the ${pet.def.species}</div>
          <div class="held-stat">${Math.ceil(pet.hp)} / ${pet.maxHp} HP · heals you ${pet.healRate.toFixed(1)} HP/s</div>
          <div class="held-ench">If you fall, ${pet.name} spends ${Math.round(diff().revive * 100)}% of max HP to revive you. If ${pet.name} falls, the run is over.</div></div></div>
        <div class="rows">
          <div class="row"><div class="row-name">Pet Treat</div><div class="row-desc">Restores 50% of ${pet.name}'s HP right now</div>${buyBtn('treat', '', TREAT_COST)}</div>
          ${Object.entries(PET_UPGRADES).map(([k, u]) => {
            const lv = pet.upg[k];
            const pips = Array.from({ length: u.max }, (_, i) => `<i class="${i < lv ? 'on' : ''}"></i>`).join('');
            return `<div class="row"><div class="row-name">${u.name} <span class="pips">${pips}</span></div>
              <div class="row-desc">${lv ? `Now: ${u.text(lv)}` : 'Not upgraded'}${lv < u.max ? ` → <b>${u.text(lv + 1)}</b>` : ''}</div>
              ${buyBtn('petup', k, shopApi.petUpgradeCost(k), 'Upgrade')}</div>`;
          }).join('')}
        </div>`;
    } else if (this.panelTab === 'backpack') {
      const wcards = p.weapons.map((w, i) => {
        const rar = RARITY[itemRarity(w)];
        return card({
          name: `${itemName(w)} ${elementTag(w)}`, rar: `${rar.name} · slot ${i + 1}`, rarColor: rar.color, icon: itemIcon(w),
          stat: statLine(w), extra: enchantList(w).join(' · '), owned: i === p.slot,
          button: `${i === p.slot ? '<span class="equipped">In hand</span>' : `<button class="buy alt" data-act="equipW" data-arg="${w.uid}">Hold</button>`}
            <button class="buy sell" data-act="sell" data-arg="${w.uid}">Sell<span>${ICON.coin}${sellPrice(w)}</span></button>`,
        });
      }).join('');
      const acards = p.armors.length
        ? p.armors.map((a) => {
          const rar = RARITY[itemRarity(a)];
          const on = p.armor === a;
          return card({
            name: itemName(a), rar: rar.name, rarColor: rar.color, icon: itemIcon(a), stat: statLine(a), owned: on,
            button: `<button class="buy alt" data-act="equipA" data-arg="${a.uid}">${on ? 'Take off' : 'Wear'}</button>
              <button class="buy sell" data-act="sell" data-arg="${a.uid}">Sell<span>${ICON.coin}${sellPrice(a)}</span></button>`,
          });
        }).join('')
        : '<p class="tab-note">No armor yet. Buy some or find it in chests.</p>';
      const prev = shopApi.clearPreview();
      const clearBar = !prev.count
        ? '<div class="clear-bar empty"><span>Your backpack only holds what you are using right now.</span></div>'
        : this.clearConfirm
          ? `<div class="clear-bar confirm"><span>Sell <b>${prev.count}</b> item${prev.count === 1 ? '' : 's'} for ${ICON.coin}<b>${fmt(prev.value)}</b>? You keep the weapon in your hand and the armor you wear.</span>
              <button class="buy sell" data-act="clearYes">Yes, clear it</button><button class="buy alt" data-act="clearNo">Cancel</button></div>`
          : `<div class="clear-bar"><span>Too full? Clearing sells everything except the weapon in your hand and the armor you wear.</span>
              <button class="buy sell" data-act="clear">Clear backpack<span>${ICON.coin}${fmt(prev.value)}</span></button></div>`;
      body = `${clearBar}<h3>Weapons <span class="muted">${p.weapons.length}/${MAX_WEAPONS}</span></h3><div class="grid">${wcards}</div>
        <h3>Armor <span class="muted">${p.armors.length}/${MAX_ARMORS}</span></h3><div class="grid">${acards}</div>`;
    }
    $('panel').innerHTML = `
      <div class="panel-inner">
        <header>
          <div class="ph-title">${this.panelTab === 'backpack' ? 'Backpack' : this.panelTab === 'quests' ? 'Quest Journal' : "Merchant's Stall"}</div>
          <div class="ph-money">${ICON.coin}<span>${fmt(G.money)}</span></div>
          <button class="close" data-act="close" aria-label="Close">Close <kbd>B</kbd></button>
        </header>
        <nav>${tabHtml}</nav>
        <div class="panel-msg${this.panelMsg ? ' on' : ''}">${this.panelMsg}</div>
        <div class="panel-body">${body}</div>
      </div>`;
  },

  onPanelClick(e) {
    const tab = e.target.closest('[data-tab]');
    if (tab) {
      this.panelTab = tab.dataset.tab;
      this.panelMsg = '';
      this.clearConfirm = false;
      Audio.play('click');
      const body = $('panel').querySelector('.panel-body');
      this.renderPanel();
      if (body) $('panel').querySelector('.panel-body').scrollTop = 0;
      return;
    }
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const act = btn.dataset.act, arg = btn.dataset.arg;
    if (act === 'close') { this.handlers.closePanel(); return; }
    const fn = {
      weapon: () => shopApi.buyWeapon(arg),
      armor: () => shopApi.buyArmor(arg),
      enchant: () => shopApi.buyEnchant(arg),
      element: () => shopApi.buyElement(arg),
      treat: () => shopApi.buyTreat(),
      petup: () => shopApi.buyPetUpgrade(arg),
      sell: () => shopApi.sell(+arg),
      equipW: () => shopApi.equipWeapon(+arg),
      equipA: () => shopApi.equipArmor(+arg),
      empower: () => this.handlers.empower(),
      clear: () => { this.clearConfirm = true; Audio.play('click'); return null; },
      clearNo: () => { this.clearConfirm = false; Audio.play('click'); return null; },
      clearYes: () => { this.clearConfirm = false; return shopApi.clearBackpack(); },
    }[act];
    if (!fn) return;
    const err = fn();
    if (act === 'empower' && !err) return;
    this.panelMsg = err || '';
    const scroll = $('panel').querySelector('.panel-body')?.scrollTop || 0;
    this.renderPanel();
    const pb = $('panel').querySelector('.panel-body');
    if (pb) pb.scrollTop = scroll;
  },
};
