# Pets at War

A blocky 3D browser game built with Three.js. Your pet heals you and revives you when you fall. If your pet dies, you lose.

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
| Space / Shift | Jump / sprint |
| E | Pick up loot, open chests, tame a weakened monster |
| Q (A on AZERTY) | Pet heal burst (heals you 40%, 22s cooldown) |
| 1–8, R, mouse wheel | Switch weapon, cycle weapons, zoom |
| B / I | Shop / backpack |
| P / Esc | Pause |
| M | Mute |

Touch screens get a virtual joystick and buttons.

### Rules

- **Your pet** follows you and heals you while it is near. When your HP reaches 0, it spends 35% of its max HP to revive you. If it doesn't have that much HP left, or monsters kill it, the run ends. It tries to stay on the far side of you from the closest monster, so stand between them.
- **Waves** come through 5 purple portals. They start slowly and grow, and every 5th wave brings a Shadow Ogre boss that summons minions.
- **Coins** drop from every kill and you get a bonus for clearing a wave. Spend them at the merchant (B): swords, bows, armor, enchants (Sharpness, Swiftness, Vampire, Critical), elements, and pet upgrades.
- **Elements** (Fire, Frost, Storm, Venom) add bonus damage and an effect: burn, slow, chain lightning, or stacking poison. Each monster type is weak to one element (x1.75 damage) and resists another (x0.5).
- **Loot** drops from monsters, and treasure chests appear around the map (they are shown on the minimap). Items come in 5 rarities, with colored light beams.
- **Taming**: some monsters show a paw icon when they drop under 35% HP. Press E next to one to try to tame it. A tamed monster fights for you, hunts down monsters anywhere on the island, and reveals the monsters near it on your minimap. You can have up to 3.

## Code map

| File | What it does |
| --- | --- |
| `src/main.js` | Renderer, bloom, game loop, state machine, camera, input routing |
| `src/world.js` | Island terrain, water, sky, trees, grass, plaza, merchant, portals, collisions |
| `src/models.js` | Procedural blocky models (avatars, pets, monsters, weapons, armor, loot) and icon rendering |
| `src/data.js` | All tunable content: weapons, armor, enchants, elements, monsters, pets, prices, loot tables |
| `src/player.js`, `src/pet.js`, `src/monsters.js` | Player controller, pet AI, monster AI and taming |
| `src/combat.js` | Damage, elemental effects, projectiles |
| `src/waves.js`, `src/loot.js`, `src/shop.js` | Wave director, coins/drops/chests, buying and selling |
| `src/ui.js`, `style.css` | HUD, minimap, floating labels, shop panel, menus |
| `src/effects.js`, `src/audio.js` | Particles and slashes, synthesized sound effects |

Balance numbers all live in `src/data.js`.
