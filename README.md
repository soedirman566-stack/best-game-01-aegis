[![make.fun · best-game-01](https://make.fun/badge/best-game-01.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![rank](https://make.fun/badge/best-game-01/soedirman566-stack/best-game-01-aegis/rank.svg)](https://make.fun/bounty/best-game-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![reward](https://make.fun/badge/best-game-01/soedirman566-stack/best-game-01-aegis/reward.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)

# Aegis Line — Neon Tower Defense

A neon tower defense in plain Canvas 2D. A swarm streams down a winding wire toward your core;
build towers beside the road, upgrade them as the waves harden, and hold the line for 15 waves.

## Run it

```
node serve.ts
```

then open http://localhost:8080 — or open `game/index.html` through any static file server.
No build step, no dependencies, no network: the game is plain static files and ES modules.

## How to play

- Click a tower card (or press 1–4), then click a free tile to build. Towers cannot sit on the road.
- Click a built tower to see its stats, **upgrade** it (3 levels: more damage, range and speed,
  stronger specials) or **sell** it for 70% of what you invested.
- Press **Space** or the START WAVE button to send the next wave. Gold comes from kills and a
  wave-clear bonus; every enemy that reaches the core costs core HP.
- Survive all **15 waves** to win. Bosses land on waves 5, 10 and 15 — victory unlocks endless mode.

## Towers

| Tower | Cost | Role |
| --- | --- | --- |
| Pulse Blaster | 50g | Fast, cheap bolts — the backbone |
| Frost Spire | 75g | Slows everything it touches |
| Rail Cannon | 150g | Slow, long-range shot that pierces the whole line |
| Tesla Coil | 120g | Lightning that chains to nearby enemies |

Enemies: runners, grunts, swarms, shielded (an energy shield eats the first hits), tanks, and
bosses with a health bar. Frost slows stack with focus fire; rail shots reward lining the road up.

## Controls

- Mouse: build, select, upgrade, sell, buttons
- `1–4` pick a tower card · `U` upgrade · `X` sell · `Space` start wave
- `F` speed 1x/2x · `P` pause · `M` mute · `Esc` cancel

## Tech

Fixed-step simulation (60 Hz) fully separated from rendering, one seeded random stream driving
the whole game (so staged scenes and tests are deterministic), WebAudio-synthesised sound effects
with no audio files, and deterministic screenshot hooks at `game/index.html?shot=menu|early|late|upgrade&seed=1`.

Entry for the make.fun bounty [best-game-01](https://make.fun/bounty/best-game-01).
Hand it in with `MAKEFUN_OUTPUT_DIR=out node main.ts`, which copies `game/` and `screenshots/`
to the output and writes the dossier the judge reads.
