# Pets at War

*A game by Nylan, Claude and Frédéric.*

A blocky 3D browser game built with Three.js. Your pet heals you and revives you when you fall. If your pet dies, you lose.
Finish three quests to give your pet Sky Wings, then ride it into the sky and slay Ignis the Dragon to win.

## Run it

```bash
npm start            # serves the game at http://localhost:8000 (no install needed)
```

Or build a single standalone file you can double-click (Three.js loads from the jsDelivr CDN, so you need internet):

```bash
npm install          # once, installs esbuild
npm run build        # writes dist/pets-at-war.html
```

Opening `index.html` directly from disk does not work, because browsers block ES modules on `file://`. Use `npm start` or the built file.

## How to play

| Key | Action |
| --- | --- |
| W A S D (Z Q S D on AZERTY) | Move |
| Mouse / right-drag | Turn the camera (click to lock the mouse) |
| Left click (hold) | Attack: swords slash everything in front, bows shoot where the crosshair points |
| Space / Shift | Jump / sprint. While riding: climb / dive |
| E | Pick up loot, open chests, tame a weakened monster, talk to the Elder, use a portal |
| Q (A on AZERTY) | Pet heal burst (heals you 40% and your pet 25%, 22s cooldown) |
| F | Ride your pet / land (once it has Sky Wings) |
| 1–8, R, mouse wheel | Switch weapon, cycle weapons, zoom |
| B / I / J | Shop / backpack / quest journal |
| P / Esc | Pause |
| M | Mute |

Touch screens get a virtual joystick and buttons (including RIDE, DOWN and QUEST).

### Difficulty

Pick Easy, Medium or Hard on the title screen, under the pets. The game remembers your choice and keeps separate records for each mode.

| | Easy | Medium | Hard |
| --- | --- | --- | --- |
| Monster HP / damage (bosses too) | x0.7 / x0.55 | x1 / x1 | x1.35 / x1.4 |
| Wave size | x0.7, slower spawns | normal | x1.35, faster spawns |
| Break between waves | 18s | 12s | 9s |
| Coins | x1.3, start with 120 | x1 | x0.9 |
| Pet HP spent to revive you | 25% | 35% | 45% |
| Pet healing | x1.25 | x1 | x0.85 |
| Taming chance | +15% | normal | -10% |
| Shelter on Haven Isle | yes | no | no |

**The shelter (Easy only)** is a pavilion under a glowing green dome in a clearing a short walk from the plaza (a green circle on the minimap). Monsters can't get through the dome, their arrows, fireballs and boulders stop at it, and nothing can hurt you or your pet inside. You heal 14 HP per second in there, and your pet heals faster too. Waves only end when their monsters are beaten, so you still have to come out and fight. You can shoot arrows out from inside.

### The islands

- **Haven Isle** is home: the plaza with the merchant and the Elder, and the monster waves.
- **Frostpeak** (blue portal): snowy pines, a frozen lake, and the Frost Titan asleep at the summit.
- **Ember Isle** (orange portal): a volcano with a lava crater and lava pools, imps and golems, and five phoenix feathers.
- **Dragon's Roost** (red portal): rock spires and Ignis's nest. Its portal stays sealed until your pet has wings.

Walk (or fly) through a portal ring to travel. Every outer island has a portal back to Haven. Each island has its own monsters and two hidden treasure chests. Haven's waves pause while you're away and wait for you to come back.

### Quests and the final boss

Talk to the Elder by the shrine (or press J) to see the quests. Each one earns a Sky Relic:

1. **Storm Feather**: defeat the Shadow Ogre. It comes through Haven's portals with wave 5.
2. **Frost Heart**: defeat the Frost Titan on Frostpeak. Fire burns it best; its slams and thrown ice boulders slow you down.
3. **Phoenix Plume**: collect 5 phoenix feathers on Ember Isle. Monsters appear to guard each one.

Bring all three relics to the Elder to give your pet **Sky Wings**: it gains max HP and can carry you. Press F to ride, Space to climb, Shift to dive. Then **Ignis the Dragon** awakens on Dragon's Roost. It flies, breathes fire that sets the ground alight, spits exploding fireballs, dives at you, lands to sweep its tail, and calls Ember Imps. On foot you can only hit it with arrows or when it lands; riding your pet lets you fight it in the sky. Frost hurts it most. Its wounds never heal, so you can fly back to the merchant for pet treats. Killing it wins the game.

### Rules

- **Your pet** follows you and heals you while it is near. When your HP reaches 0, it spends 35% of its max HP to revive you. If it doesn't have that much HP left, or monsters kill it, the run ends. It tries to stay on the far side of you from the closest monster, so stand between them.
- **Waves** come through Haven's portals. They start slowly and grow, and every 5th wave brings a Shadow Ogre boss that summons minions.
- **Coins** drop from every kill and you get a bonus for clearing a wave or finishing a quest. Spend them at the merchant (B): swords, bows, armor, enchants (Sharpness, Swiftness, Vampire, Critical), elements, and pet upgrades.
- **Elements** (Fire, Frost, Storm, Venom) add bonus damage and an effect: burn, slow, chain lightning, or stacking poison. Each monster type is weak to one element (x1.75 damage) and resists another (x0.5).
- **Loot** drops from monsters, and treasure chests appear around the islands (they are shown on the minimap). Items come in 5 rarities, with colored light beams.
- **Backpack** (I): hold, wear or sell each item. **Clear backpack** sells everything at once, except the weapon in your hand and the armor you wear (it asks you to confirm first). You can do it anywhere, not just at the merchant.
- **Taming**: some monsters show a paw icon when they drop under 35% HP. Press E next to one to try to tame it. A tamed monster fights for you, hunts down monsters on its island, reveals the monsters near it on your minimap, and follows you between islands. You can have up to 3.

## Code map

| File | What it does |
| --- | --- |
| `src/main.js` | Renderer, bloom and colour grading, game loop, state machine, camera, input routing |
| `src/world.js` | The four islands: terrain (cobbled plaza, cliff strata, sea-floor caustics), water and lava shaders, painted sky with clouds and far mountains, per-island atmosphere, trees, plaza, merchant, Elder, portals, collisions |
| `src/decor.js` | Haven's village (cottages, windmill, lamp posts, well, walkable pier and rowboat, bushes, mushrooms), gulls and butterflies, and the Easy-mode shelter and its dome |
| `src/models.js`, `src/bigModels.js` | Procedural blocky models (avatars, pets, wings, monsters, Frost Titan, dragon, weapons, armor, loot) and icon rendering |
| `src/data.js` | All tunable content: weapons, armor, enchants, elements, monsters and bosses, pets, quests, prices, loot tables, difficulty modes |
| `src/player.js`, `src/pet.js` | Player controller (walking and flying), pet AI, riding |
| `src/monsters.js`, `src/dragon.js` | Monster AI, taming, boss attacks; the dragon's flight and fire breath |
| `src/travel.js`, `src/regions.js`, `src/quests.js` | Portals and island tracking; outer-island monsters, Titan, feathers, dragon spawn; quest progress and victory |
| `src/combat.js` | Damage, elemental effects, projectiles and splash damage |
| `src/waves.js`, `src/loot.js`, `src/shop.js` | Wave director, coins/drops/chests, buying and selling |
| `src/ui.js`, `style.css` | HUD, quest tracker, boss bar, minimap, floating labels, shop and quest panels, menus |
| `src/effects.js`, `src/ambient.js`, `src/audio.js` | Particles and slashes, floating pollen/snow/embers, synthesized sound effects |

Balance numbers all live in `src/data.js`; the difficulty multipliers are in `DIFFICULTIES` there.
