// The quest line: three Sky Relics -> the Elder gives your pet Sky Wings -> Ignis awakens -> slay it to win.
import { G } from './game.js';
import { QUESTS, RELIC_BONUS } from './data.js';
import { UI } from './ui.js';
import { Audio } from './audio.js';
import { FX } from './effects.js';
import { Regions } from './regions.js';

export const Quests = {
  stage: 'relics', // relics -> empower -> dragon -> won
  done: {},
  feathers: 0,
  awakenT: -1,

  reset() {
    this.stage = 'relics';
    this.done = { ogre: false, titan: false, feathers: false };
    this.feathers = 0;
    this.awakenT = -1;
  },

  relics() { return QUESTS.filter((q) => this.done[q.id]).length; },

  onKill(m) {
    if (m.type === 'ogre' && !this.done.ogre) this.complete('ogre');
    else if (m.type === 'titan' && !this.done.titan) this.complete('titan');
    else if (m.type === 'dragon' && this.stage !== 'won') {
      this.stage = 'won';
      UI.banner('IGNIS IS SLAIN', 'The islands are free. You and your pet are legends!', '#ffcf4a');
      Audio.play('victory');
      UI.refreshQuests();
      G.onVictory && G.onVictory();
    }
  },

  addFeather() {
    if (this.done.feathers) return;
    this.feathers++;
    const goal = QUESTS[2].goal;
    UI.notify(`Phoenix feather ${this.feathers}/${goal}`, '#ff9a4a');
    Audio.play('pickup');
    if (this.feathers >= goal) this.complete('feathers');
    else UI.refreshQuests();
  },

  complete(id) {
    const q = QUESTS.find((x) => x.id === id);
    this.done[id] = true;
    G.money += RELIC_BONUS;
    G.stats.earned += RELIC_BONUS;
    UI.moneyPop(RELIC_BONUS);
    const n = this.relics();
    Audio.play('relic');
    if (n >= QUESTS.length) {
      this.stage = 'empower';
      UI.banner('ALL THREE SKY RELICS', 'Return to the Elder at the shrine on Haven Isle', '#7dffb0');
    } else {
      UI.banner(`SKY RELIC: ${q.relic.toUpperCase()}`, `${n} of 3 relics · +${RELIC_BONUS} coins`, q.color);
    }
    UI.refreshQuests();
  },

  // Called from the Elder's dialog.
  empower() {
    if (this.stage !== 'empower') return false;
    this.stage = 'dragon';
    const pet = G.pet;
    pet.giveWings();
    FX.ring(pet.pos, 0x8fe8ff, 6, 1);
    FX.burst(pet.pos.clone().setY(pet.pos.y + 1.5), { count: 60, color: 0xbff2ff, glow: true, speed: 7, up: 4, size: 0.3, life: 1.4, gravity: -1 });
    Audio.play('empower');
    UI.banner(`${pet.name.toUpperCase()} CAN FLY`, `Press ${UI.keyLabel('KeyF')} to ride. Space climbs, Shift dives.`, '#8fe8ff');
    this.awakenT = 6;
    UI.refreshQuests();
    return true;
  },

  update(dt) {
    if (this.awakenT > 0) {
      this.awakenT -= dt;
      if (this.awakenT <= 0) {
        Regions.awakenDragon();
        UI.banner('THE DRAGON AWAKENS', "Ignis rises over Dragon's Roost. The red portal is open.", '#ff5a3a');
        Audio.play('roar');
        G.shake = Math.max(G.shake, 0.5);
        UI.refreshQuests();
      }
    }
  },
};
