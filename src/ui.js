// HUD, floating labels, minimap, shop/backpack panel, menus.
import * as THREE from 'three';
import { G, enemies, allies } from './game.js';
import {
  RARITY, ELEMENTS, ELEMENT_KEYS, ELEMENT_BONUS, ENCHANTS, PET_UPGRADES, PETS, WEAPONS, ARMORS,
  TREAT_COST, REVIVE_COST, MAX_WEAPONS, MAX_ARMORS, itemName, itemRarity, enchantList, weaponDps, sellPrice,
} from './data.js';
import { itemIcon, getIcon, makePet } from './models.js';
import { Input } from './input.js';
import { ROMAN } from './util.js';
import { Audio } from './audio.js';
import { BURST_CD } from './pet.js';
import { HALF, CELL } from './world.js';

const $ = (id) => document.getElementById(id);
const proj = new THREE.Vector3();
let shopApi = null;

const ICON = {
  coin: '<span class="coin-ico" aria-hidden="true"></span>',
  shield: '<svg viewBox="0 0 24 24" class="ico" aria-hidden="true"><path d="M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5z" fill="currentColor"/></svg>',
  heart: '<svg viewBox="0 0 24 24" class="ico" aria-hidden="true"><path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.8 4.5c2.1 0 3.6 1.1 5.2 3 1.6-1.9 3.1-3 5.2-3 3.8 0 5.9 3.9 4.4 7.3C19.5 16.4 12 21 12 21z" fill="currentColor"/></svg>',
  paw: '<svg viewBox="0 0 24 24" class="ico" aria-hidden="true"><ellipse cx="6" cy="10" rx="2.2" ry="2.8" fill="currentColor"/><ellipse cx="10" cy="6" rx="2.2" ry="2.8" fill="currentColor"/><ellipse cx="14.5" cy="6" rx="2.2" ry="2.8" fill="currentColor"/><ellipse cx="18.5" cy="10" rx="2.2" ry="2.8" fill="currentColor"/><path d="M12 11c3 0 6 4.5 6 7 0 2-2 2.6-3.2 2.2-1-.3-1.8-.8-2.8-.8s-1.8.5-2.8.8C8 20.6 6 20 6 18c0-2.5 3-7 6-7z" fill="currentColor"/></svg>',
  skull: '<svg viewBox="0 0 24 24" class="ico" aria-hidden="true"><path d="M12 2C7 2 3.5 5.6 3.5 10.2c0 2.8 1.3 5 3.5 6.3V20c0 1.1.9 2 2 2h6c1.1 0 2-.9 2-2v-3.5c2.2-1.3 3.5-3.5 3.5-6.3C20.5 5.6 17 2 12 2zM8.5 14a2 2 0 1 1 0-4 2 2 0 0 1 0 4zm7 0a2 2 0 1 1 0-4 2 2 0 0 1 0 4z" fill="currentColor"/></svg>',
};

const fmt = (n) => Math.floor(n).toLocaleString('en-US');

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
        </div>
        <div class="hud-top">
          <div id="waveTitle">WAVE 1</div>
          <div id="waveSub"></div>
        </div>
        <div class="hud-tr">
          <div class="money" id="moneyBox">${ICON.coin}<span id="money">0</span><span id="moneyPop"></span></div>
          <div class="map-wrap"><canvas id="minimap" width="190" height="190"></canvas></div>
          <div class="kills">${ICON.skull}<span id="kills">0</span></div>
        </div>
        <div id="notifs"></div>
        <div class="hud-bl">
          <div class="ability" id="ability"><div class="ab-key" id="abKey">Q</div><div class="ab-cd" id="abCd"></div><div class="ab-txt">Pet Heal</div></div>
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
      </div>
      <div id="labels"></div>
      <div id="panel" hidden role="dialog" aria-label="Shop"></div>
      <div id="menu"></div>
      <div id="pause" hidden></div>
      <div id="gameover" hidden></div>`;
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
    let best = 0;
    try { best = +localStorage.getItem('paw-best-wave') || 0; } catch (e) { best = 0; }
    const k = (c) => Input.label(c);
    $('menu').innerHTML = `
      <div class="menu-inner">
        <div class="logo"><span class="l1">PETS</span><span class="l2">at</span><span class="l1">WAR</span></div>
        <p class="tagline">Your pet keeps you alive. Keep your pet alive.</p>
        <div class="pet-row">${pets}</div>
        <button class="play" id="playBtn">PLAY</button>
        ${best ? `<div class="best">Best run: wave ${best}</div>` : ''}
        <div class="controls">
          <div><kbd>${k('KeyW')}</kbd><kbd>${k('KeyA')}</kbd><kbd>${k('KeyS')}</kbd><kbd>${k('KeyD')}</kbd> move</div>
          <div><kbd>Mouse</kbd> look · <kbd>Click</kbd> attack</div>
          <div><kbd>Space</kbd> jump · <kbd>Shift</kbd> sprint</div>
          <div><kbd>${k('KeyE')}</kbd> pick up / open / tame</div>
          <div><kbd>${k('KeyQ')}</kbd> pet heal burst</div>
          <div><kbd>B</kbd> shop · <kbd>${k('KeyI')}</kbd> backpack · <kbd>1-8</kbd> weapons</div>
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
    $('playBtn').addEventListener('click', () => this.handlers.start());
    $('qualBtn').addEventListener('click', () => { this.handlers.toggleQuality(); $('qualBtn').textContent = `Graphics: ${G.quality === 'high' ? 'High' : 'Fast'}`; });
    $('muteBtn').addEventListener('click', () => { Audio.toggle(); $('muteBtn').textContent = `Sound: ${Audio.muted ? 'Off' : 'On'}`; });
  },
  showMenu() {
    this.buildMenu();
    $('menu').hidden = false;
    $('hud').hidden = true;
    $('gameover').hidden = true;
    $('pause').hidden = true;
    $('panel').hidden = true;
    this.clearLabels();
  },
  startHUD() {
    $('menu').hidden = true;
    $('hud').hidden = false;
    $('gameover').hidden = true;
    $('notifs').innerHTML = '';
    const pet = G.pet;
    $('petPortrait').src = getIcon('pet:' + pet.id, () => makePet(pet.id).root, 'front');
    $('petName').textContent = `${pet.name} the ${pet.def.species}`;
    $('abKey').textContent = Input.label('KeyQ');
    this.moneyShown = G.money;
    this.refreshHotbar();
    this.refreshAllies();
    this.clearLabels();
  },
  showPause() {
    const k = (c) => Input.label(c);
    $('pause').innerHTML = `
      <div class="modal">
        <h2>Paused</h2>
        <p class="muted">Click Resume to lock the mouse again.</p>
        <button class="play small" id="resumeBtn">Resume</button>
        <div class="menu-opts">
          <button class="opt" id="pQual">Graphics: ${G.quality === 'high' ? 'High' : 'Fast'}</button>
          <button class="opt" id="pMute">Sound: ${Audio.muted ? 'Off' : 'On'}</button>
          <button class="opt" id="pQuit">Quit to menu</button>
        </div>
        <div class="controls compact">
          <div><kbd>${k('KeyW')}</kbd><kbd>${k('KeyA')}</kbd><kbd>${k('KeyS')}</kbd><kbd>${k('KeyD')}</kbd> move · <kbd>Space</kbd> jump</div>
          <div><kbd>${k('KeyE')}</kbd> interact · <kbd>${k('KeyQ')}</kbd> pet heal · <kbd>B</kbd> shop</div>
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
        <p class="muted">Without your pet, nobody can bring you back.</p>
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
          <button class="opt" id="menuBtn">Change pet</button>
        </div>
      </div>`;
    $('gameover').hidden = false;
    $('againBtn').addEventListener('click', () => this.handlers.start());
    $('menuBtn').addEventListener('click', () => this.handlers.quit());
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
  clearLabels() {
    for (const [, el] of this.labels) el.remove();
    this.labels.clear();
    for (const d of this.dmgs) d.el.remove();
    this.dmgs.length = 0;
    if (this.merchantEl) { this.merchantEl.remove(); this.merchantEl = null; }
  },
  updateLabels(dt) {
    const cam = G.camera;
    const seen = new Set();
    for (const m of G.monsters) {
      if (m.dead) continue;
      const d = cam.position.distanceTo(m.pos);
      const low = m.hp / m.maxHp;
      const show = m.ally || m.def.boss || d < 45;
      if (!show) continue;
      const sp = this.toScreen(proj.set(m.pos.x, m.pos.y + m.height + 0.45, m.pos.z));
      if (!sp) continue;
      seen.add(m);
      let el = this.labels.get(m);
      if (!el) {
        el = document.createElement('div');
        el.className = 'mlabel' + (m.def.boss ? ' boss' : '');
        el.innerHTML = `<div class="ml-name"></div><div class="ml-bar"><div class="ml-fill"></div></div>`;
        this.labelsEl.appendChild(el);
        this.labels.set(m, el);
        el._state = '';
      }
      const canTame = m.tameable && !m.ally && low <= 0.35;
      const state = `${m.ally ? 'a' : 'e'}${canTame ? 't' : ''}${m.level}`;
      if (el._state !== state) {
        el._state = state;
        el.classList.toggle('ally', m.ally);
        el.classList.toggle('tame', canTame);
        el.querySelector('.ml-name').innerHTML = (m.ally ? ICON.heart : canTame ? ICON.paw : '') + `<span>${m.def.name}</span><em>Lv ${m.level}</em>`;
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
    // merchant tag
    if (G.world) {
      if (!this.merchantEl) {
        this.merchantEl = document.createElement('div');
        this.merchantEl.className = 'wlabel';
        this.merchantEl.innerHTML = `<b>Merchant</b><span>Press B to shop</span>`;
        this.labelsEl.appendChild(this.merchantEl);
      }
      const mp = G.world.merchantPos;
      const sp = this.toScreen(proj.set(mp.x, mp.y + 4.9, mp.z));
      const d = G.player ? G.player.pos.distanceTo(mp) : 99;
      const calm = this.handlers.waves().state === 'prep';
      if (sp && (d < 18 || (calm && d < 55))) {
        this.merchantEl.hidden = false;
        this.merchantEl.style.transform = `translate(${sp.x}px, ${sp.y}px) translate(-50%, -100%)`;
      } else this.merchantEl.hidden = true;
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
    $('petCard').classList.toggle('danger', petK <= REVIVE_COST);
    $('petHeal').querySelector('span').textContent = `${pet.healRate.toFixed(1)}/s`;
    $('petHeal').classList.toggle('active', pet.healing);
    $('petSub').textContent = petK <= REVIVE_COST ? 'Too weak to revive you!' : `Revives you for ${Math.round(pet.maxHp * REVIVE_COST)} HP`;

    // money ticker
    if (this.moneyShown !== G.money) {
      const diff = G.money - this.moneyShown;
      this.moneyShown += Math.abs(diff) < 1 ? diff : diff * Math.min(1, dt * 10);
      $('money').textContent = fmt(Math.round(this.moneyShown));
    }
    $('kills').textContent = G.stats.kills;

    // wave
    const W = this.handlers.waves();
    if (W.state === 'prep') {
      $('waveTitle').textContent = W.n === 0 ? 'GET READY' : `WAVE ${W.n} CLEARED`;
      $('waveSub').textContent = `Wave ${W.n + 1} in ${Math.ceil(W.timer)}s`;
    } else {
      $('waveTitle').textContent = `WAVE ${W.n}`;
      const rem = W.remaining();
      $('waveSub').textContent = `${rem} monster${rem === 1 ? '' : 's'} left`;
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
    this.setHint(Input.locked || Input.touchActive ? '' : 'Click the game to lock the mouse, or hold right-click and drag to turn the camera.');
    this.updateLabels(dt);
    this.drawMinimap();
  },

  drawMinimap() {
    const ctx = this.mapCtx;
    const W = 190, R = W / 2;
    const p = G.player;
    const range = 70; // world units from centre to edge
    const scale = R / range;
    const yaw = G.cam.yaw;
    ctx.save();
    ctx.clearRect(0, 0, W, W);
    ctx.beginPath();
    ctx.arc(R, R, R - 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = '#2a7fb8';
    ctx.fillRect(0, 0, W, W);
    // rotate so camera-forward is up
    ctx.translate(R, R);
    ctx.rotate(yaw);
    ctx.save();
    ctx.scale(scale * CELL, scale * CELL);
    ctx.translate(-(p.pos.x + HALF) / CELL, -(p.pos.z + HALF) / CELL);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(G.world.mapCanvas, 0, 0);
    ctx.restore();
    const dot = (x, z, r, color, stroke) => {
      const dx = (x - p.pos.x) * scale, dz = (z - p.pos.z) * scale;
      ctx.beginPath();
      ctx.arc(dx, dz, r, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      if (stroke) { ctx.lineWidth = 1.5; ctx.strokeStyle = stroke; ctx.stroke(); }
    };
    for (const pt of G.world.portals) dot(pt.x, pt.z, 4.5, '#b45cff', '#2a1040');
    dot(G.world.merchantPos.x, G.world.merchantPos.z, 4, '#ffcf4a', '#3a2a00');
    for (const c of G.chests) if (!c.opened) dot(c.pos.x, c.pos.z, 4, '#ffd24a', '#ffffff');
    for (const d of G.drops) dot(d.pos.x, d.pos.z, 3, RARITY[itemRarity(d.item)].color, '#000');
    // Monsters are revealed near you, near your pet, and near tamed allies (they scout for you).
    const scouts = [p.pos, G.pet.pos, ...allies().map((a) => a.pos)];
    for (const m of enemies()) {
      let seen = m.def.boss;
      for (const s of scouts) if (!seen && Math.hypot(m.pos.x - s.x, m.pos.z - s.z) < 32) seen = true;
      if (seen) dot(m.pos.x, m.pos.z, m.def.boss ? 5.5 : 3, '#ff4a4a', '#3a0000');
    }
    for (const a of allies()) {
      dot(a.pos.x, a.pos.z, 3.5, '#4fb4ff', '#ffffff');
      // scouting radius
      ctx.beginPath();
      ctx.arc((a.pos.x - p.pos.x) * scale, (a.pos.z - p.pos.z) * scale, 32 * scale, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(79,180,255,0.35)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    dot(G.pet.pos.x, G.pet.pos.z, 3.5, '#5effa8', '#0a3a20');
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
    ctx.fillStyle = '#ffffff';
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
    this.renderPanel();
    $('panel').hidden = false;
  },
  closePanel() { $('panel').hidden = true; },
  isPanelOpen() { return !$('panel').hidden; },

  renderPanel() {
    const p = G.player, pet = G.pet;
    const tabs = [
      ['weapons', 'Weapons'], ['armor', 'Armor'], ['enchant', 'Enchants'],
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

    if (this.panelTab === 'weapons') {
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
          <div class="held-ench">If you fall, ${pet.name} spends ${Math.round(REVIVE_COST * 100)}% of max HP to revive you. If ${pet.name} falls, the run is over.</div></div></div>
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
      body = `<h3>Weapons <span class="muted">${p.weapons.length}/${MAX_WEAPONS}</span></h3><div class="grid">${wcards}</div>
        <h3>Armor <span class="muted">${p.armors.length}/${MAX_ARMORS}</span></h3><div class="grid">${acards}</div>`;
    }
    $('panel').innerHTML = `
      <div class="panel-inner">
        <header>
          <div class="ph-title">${this.panelTab === 'backpack' ? 'Backpack' : "Merchant's Stall"}</div>
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
    }[act];
    if (!fn) return;
    const err = fn();
    this.panelMsg = err || '';
    const scroll = $('panel').querySelector('.panel-body')?.scrollTop || 0;
    this.renderPanel();
    const pb = $('panel').querySelector('.panel-body');
    if (pb) pb.scrollTop = scroll;
  },
};
