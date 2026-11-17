// Aegis Line — the simulation. Enemies advance along the road by distance travelled, towers pick
// the furthest-travelled enemy in range, and everything (spawning, gold, lives, waves) is decided
// here at a fixed step. The renderer only reads; sounds are queued as event names for main to play.

import {
  COLS, ROWS, TILE, OX, OY, ROAD_TILES, tileCentre, TOWERS, ENEMIES,
  DMG_MUL, RANGE_MUL, RATE_MUL, UPGRADE_COST, SELL_REFUND, hpMul, waveSpec,
  START_GOLD, START_LIVES, LAST_WAVE, waveBonus,
} from './config.js';

// Road polyline in pixels plus cumulative lengths, and the set of tiles the road occupies.
export const ROAD_PTS = ROAD_TILES.map(([c, r]) => tileCentre(c, r));
export const ROAD_LEN = [];
{
  let total = 0;
  for (let i = 0; i < ROAD_PTS.length; i += 1) {
    if (i > 0) total += Math.hypot(ROAD_PTS[i].x - ROAD_PTS[i - 1].x, ROAD_PTS[i].y - ROAD_PTS[i - 1].y);
    ROAD_LEN.push(total);
  }
}
export const ROAD_TOTAL = ROAD_LEN[ROAD_LEN.length - 1];
export const ROAD_TILES_SET = new Set();
for (let i = 0; i < ROAD_TILES.length - 1; i += 1) {
  const [c1, r1] = ROAD_TILES[i];
  const [c2, r2] = ROAD_TILES[i + 1];
  const dc = Math.sign(c2 - c1);
  const dr = Math.sign(r2 - r1);
  let c = c1;
  let r = r1;
  ROAD_TILES_SET.add(c + ',' + r);
  while (c !== c2 || r !== r2) {
    c += dc;
    r += dr;
    if (c >= 0 && c < COLS && r >= 0 && r < ROWS) ROAD_TILES_SET.add(c + ',' + r);
  }
}

export function roadPos(dist) {
  const d = Math.max(0, Math.min(ROAD_TOTAL, dist));
  let seg = 1;
  while (seg < ROAD_LEN.length - 1 && ROAD_LEN[seg] < d) seg += 1;
  const a = ROAD_PTS[seg - 1];
  const b = ROAD_PTS[seg];
  const span = ROAD_LEN[seg] - ROAD_LEN[seg - 1] || 1;
  const t = (d - ROAD_LEN[seg - 1]) / span;
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, ang: Math.atan2(b.y - a.y, b.x - a.x) };
}

export function towerStats(t) {
  const def = TOWERS[t.type];
  const lv = t.level - 1;
  return {
    dmg: def.dmg * DMG_MUL[lv],
    range: def.range * TILE * RANGE_MUL[lv],
    rate: def.rate * RATE_MUL[lv],
    slowPct: def.slowPct ? def.slowPct[lv] : 0,
    slowDur: def.slowDur ? def.slowDur[lv] : 0,
    chains: def.chains ? def.chains[lv] : 0,
  };
}

export function upgradeCost(t) {
  if (t.level >= 3) return 0;
  return Math.round(TOWERS[t.type].cost * UPGRADE_COST[t.level]);
}

export function createWorld(rng) {
  const state = {
    screen: 'menu', phase: 'build', time: 0,
    gold: START_GOLD, lives: START_LIVES, wave: 0, kills: 0, leaks: 0, earned: 0,
    towers: [], enemies: [], projs: [], beams: [], parts: [], texts: [],
    schedule: [], spawnClock: 0, selected: null, shake: 0, endless: false,
    events: [], bossNow: null, ambientClock: 0,
  };

  function pushText(x, y, str, color) {
    state.texts.push({ x, y, str, color, life: 0.9 });
  }

  function burst(x, y, color, n, power) {
    for (let i = 0; i < n; i += 1) {
      const a = rng() * Math.PI * 2;
      const v = (0.3 + rng() * 0.7) * power;
      state.parts.push({
        x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
        life: 0.35 + rng() * 0.4, maxLife: 0.75, color, size: 2 + rng() * 3,
      });
    }
  }

  function spawnEnemy(type) {
    const def = ENEMIES[type];
    const mul = hpMul(state.wave);
    let hp = def.hp * mul;
    if (type === 'boss') hp *= 1 + (Math.floor(state.wave / 5) - 1) * 0.9;
    const e = {
      type, x: ROAD_PTS[0].x, y: ROAD_PTS[0].y, dist: 0, ang: 0,
      hp, maxHp: hp, shield: (def.shield || 0) * mul, maxShield: (def.shield || 0) * mul,
      speed: def.speed, reward: def.reward, dmg: def.dmg, radius: def.radius,
      slowUntil: 0, slowPct: 0, flash: 0, alive: true, wob: rng() * Math.PI * 2,
    };
    const p = roadPos(0);
    e.x = p.x;
    e.y = p.y;
    state.enemies.push(e);
    if (type === 'boss') {
      state.bossNow = e;
      state.events.push('boss');
    }
    return e;
  }

  function damage(e, amount, kind) {
    if (!e.alive) return;
    let left = amount;
    if (e.shield > 0) {
      const absorbed = Math.min(e.shield, left);
      e.shield -= absorbed;
      left -= absorbed;
    }
    e.hp -= left;
    e.flash = 0.09;
    if (e.hp <= 0) {
      e.alive = false;
      state.kills += 1;
      state.gold += e.reward;
      state.earned += e.reward;
      burst(e.x, e.y, ENEMIES[e.type].color, e.type === 'boss' ? 46 : 11, e.type === 'boss' ? 190 : 110);
      pushText(e.x, e.y - 14, '+' + e.reward + 'g', '#fde68a');
      state.events.push('kill');
      if (e.type === 'boss') {
        state.shake = Math.max(state.shake, 0.55);
        state.bossNow = null;
        pushText(e.x, e.y - 34, 'BOSS DOWN', '#fca5a5');
      }
    }
  }

  function firePulse(t, st, target) {
    state.projs.push({
      x: t.x, y: t.y, target, tx: target.x, ty: target.y,
      speed: TOWERS[t.type].projSpeed, dmg: st.dmg, kind: t.type,
      slowPct: st.slowPct, slowDur: st.slowDur, color: TOWERS[t.type].color,
    });
    state.events.push('shot:' + t.type);
  }

  function fireRail(t, st, target) {
    const ang = Math.atan2(target.y - t.y, target.x - t.x);
    const x2 = t.x + Math.cos(ang) * st.range;
    const y2 = t.y + Math.sin(ang) * st.range;
    for (const e of state.enemies) {
      if (!e.alive) continue;
      // Distance from the enemy to the rail segment decides the pierce hit.
      const vx = x2 - t.x;
      const vy = y2 - t.y;
      const tt = Math.max(0, Math.min(1, ((e.x - t.x) * vx + (e.y - t.y) * vy) / (vx * vx + vy * vy)));
      const dx = e.x - (t.x + vx * tt);
      const dy = e.y - (t.y + vy * tt);
      if (dx * dx + dy * dy <= (e.radius + 9) * (e.radius + 9)) damage(e, st.dmg, 'rail');
    }
    state.beams.push({ x1: t.x, y1: t.y, x2, y2, life: 0.15, maxLife: 0.15, color: TOWERS.rail.color, width: 5 });
    burst(target.x, target.y, TOWERS.rail.color, 6, 90);
    state.events.push('shot:rail');
  }

  function fireTesla(t, st, target) {
    const pts = [{ x: t.x, y: t.y }];
    let current = target;
    let amount = st.dmg;
    const hit = new Set();
    for (let hop = 0; hop < st.chains && current; hop += 1) {
      // Jittered mid-points make the arc look like lightning instead of a ruler line.
      const mx = (pts[pts.length - 1].x + current.x) / 2 + (rng() - 0.5) * 26;
      const my = (pts[pts.length - 1].y + current.y) / 2 + (rng() - 0.5) * 26;
      pts.push({ x: mx, y: my }, { x: current.x, y: current.y });
      hit.add(current);
      damage(current, amount, 'tesla');
      amount *= TOWERS.tesla.chainFalloff;
      let next = null;
      let best = TOWERS.tesla.chainRange * TILE;
      for (const e of state.enemies) {
        if (!e.alive || hit.has(e)) continue;
        const d = Math.hypot(e.x - current.x, e.y - current.y);
        if (d < best) { best = d; next = e; }
      }
      current = next;
    }
    state.beams.push({ pts, life: 0.16, maxLife: 0.16, color: TOWERS.tesla.color, width: 2.5 });
    state.events.push('shot:tesla');
  }

  function stepTowers(dt) {
    for (const t of state.towers) {
      const st = towerStats(t);
      t.cool -= dt;
      let target = null;
      let bestDist = -1;
      for (const e of state.enemies) {
        if (!e.alive) continue;
        const d = Math.hypot(e.x - t.x, e.y - t.y);
        if (d <= st.range + e.radius && e.dist > bestDist) { bestDist = e.dist; target = e; }
      }
      t.target = target;
      if (target) t.ang = Math.atan2(target.y - t.y, target.x - t.x);
      if (target && t.cool <= 0) {
        t.cool = 1 / st.rate;
        t.flash = 0.06;
        if (t.type === 'rail') fireRail(t, st, target);
        else if (t.type === 'tesla') fireTesla(t, st, target);
        else firePulse(t, st, target);
      }
      if (t.flash > 0) t.flash -= dt;
    }
  }

  function stepProjs(dt) {
    for (const p of state.projs) {
      if (p.target && p.target.alive) { p.tx = p.target.x; p.ty = p.target.y; }
      const dx = p.tx - p.x;
      const dy = p.ty - p.y;
      const d = Math.hypot(dx, dy);
      const move = p.speed * dt;
      if (d <= move + 4) {
        p.done = true;
        if (p.target && p.target.alive && Math.hypot(p.target.x - p.tx, p.target.y - p.ty) < 30) {
          if (p.kind === 'frost' && p.target.alive) {
            p.target.slowPct = Math.max(p.target.slowPct, p.slowPct);
            p.target.slowUntil = state.time + p.slowDur;
          }
          damage(p.target, p.dmg, p.kind);
          state.events.push('hit');
        }
      } else {
        p.x += (dx / d) * move;
        p.y += (dy / d) * move;
      }
    }
    state.projs = state.projs.filter((p) => !p.done);
  }

  function stepEnemies(dt) {
    for (const e of state.enemies) {
      if (!e.alive) continue;
      const slowed = state.time < e.slowUntil;
      const factor = slowed ? 1 - e.slowPct : 1;
      e.dist += e.speed * factor * dt;
      const p = roadPos(e.dist);
      e.x = p.x;
      e.y = p.y;
      e.ang = p.ang;
      if (e.flash > 0) e.flash -= dt;
      if (e.dist >= ROAD_TOTAL - 2) {
        e.alive = false;
        state.lives -= e.dmg;
        state.leaks += 1;
        state.shake = Math.max(state.shake, 0.22);
        state.events.push('leak');
        burst(p.x - 10, p.y, '#f87171', 12, 120);
        pushText(p.x - 26, p.y - 16, '-' + e.dmg + ' CORE', '#fca5a5');
        if (e.type === 'boss') state.bossNow = null;
        if (state.lives <= 0) {
          state.lives = 0;
          state.screen = 'over';
          state.events.push('defeat');
        }
      }
    }
    state.enemies = state.enemies.filter((e) => e.alive);
  }

  function stepFx(dt) {
    for (const pt of state.parts) {
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.vx *= 0.92;
      pt.vy *= 0.92;
      pt.life -= dt;
    }
    state.parts = state.parts.filter((p) => p.life > 0);
    for (const tx of state.texts) { tx.y -= 32 * dt; tx.life -= dt; }
    state.texts = state.texts.filter((t) => t.life > 0);
    for (const b of state.beams) b.life -= dt;
    state.beams = state.beams.filter((b) => b.life > 0);
    if (state.shake > 0) state.shake = Math.max(0, state.shake - dt * 1.4);
  }

  function startWave() {
    if (state.phase !== 'build' || state.screen !== 'playing') return false;
    const spec = waveSpec(state.wave + 1);
    state.wave += 1;
    state.schedule = [];
    let at = 0.6;
    for (const group of spec) {
      for (let i = 0; i < group.n; i += 1) {
        state.schedule.push({ at, type: group.t });
        at += group.gap;
      }
      at += 1.4;
    }
    state.spawnClock = 0;
    state.phase = 'wave';
    state.events.push('wave');
    return true;
  }

  function step(dt) {
    state.time += dt;
    if (state.screen === 'menu') {
      // Attract mode: a lone walker loops the road behind the title, nothing at stake.
      state.ambientClock -= dt;
      if (state.ambientClock <= 0 && state.enemies.length < 5) {
        const kinds = ['grunt', 'runner', 'shielded', 'tank', 'swarm'];
        spawnEnemy(kinds[Math.floor(rng() * kinds.length)]);
        state.ambientClock = 1.7;
      }
      for (const e of state.enemies) {
        e.dist += e.speed * 0.7 * dt;
        const p = roadPos(e.dist);
        e.x = p.x; e.y = p.y; e.ang = p.ang;
        if (e.dist >= ROAD_TOTAL) e.alive = false;
      }
      state.enemies = state.enemies.filter((e) => e.alive);
      stepFx(dt);
      return;
    }
    if (state.screen !== 'playing') { stepFx(dt); return; }

    if (state.phase === 'wave') {
      state.spawnClock += dt;
      while (state.schedule.length && state.schedule[0].at <= state.spawnClock) {
        spawnEnemy(state.schedule.shift().type);
      }
      if (!state.schedule.length && state.enemies.length === 0) {
        const bonus = waveBonus(state.wave);
        state.gold += bonus;
        pushText(ROAD_PTS[ROAD_PTS.length - 1].x - 190, ROAD_PTS[ROAD_PTS.length - 1].y - 60, 'WAVE CLEAR +' + bonus + 'g', '#6ee7b7');
        state.events.push('clear');
        if (state.wave >= LAST_WAVE && !state.endless) {
          state.screen = 'victory';
          state.events.push('victory');
        } else {
          state.phase = 'build';
        }
      }
    }
    stepEnemies(dt);
    stepTowers(dt);
    stepProjs(dt);
    stepFx(dt);
  }

  function tileFree(col, row) {
    if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return false;
    if (ROAD_TILES_SET.has(col + ',' + row)) return false;
    return !state.towers.some((t) => t.col === col && t.row === row);
  }

  function placeTower(type, col, row) {
    const def = TOWERS[type];
    if (!def || !tileFree(col, row) || state.gold < def.cost) return null;
    state.gold -= def.cost;
    const c = tileCentre(col, row);
    const t = {
      type, col, row, x: c.x, y: c.y, level: 1, invested: def.cost,
      cool: 0, ang: -Math.PI / 2, target: null, flash: 0,
    };
    state.towers.push(t);
    state.events.push('place');
    return t;
  }

  function upgradeTower(t) {
    const cost = upgradeCost(t);
    if (!t || cost === 0 || state.gold < cost) return false;
    state.gold -= cost;
    t.invested += cost;
    t.level += 1;
    state.events.push('upgrade');
    burst(t.x, t.y, TOWERS[t.type].color, 14, 90);
    return true;
  }

  function sellTower(t) {
    const i = state.towers.indexOf(t);
    if (i === -1) return false;
    state.gold += Math.round(t.invested * SELL_REFUND);
    state.towers.splice(i, 1);
    if (state.selected === t) state.selected = null;
    state.events.push('sell');
    return true;
  }

  function reset() {
    state.screen = 'menu';
    state.phase = 'build';
    state.time = 0;
    state.gold = START_GOLD;
    state.lives = START_LIVES;
    state.wave = 0;
    state.kills = 0;
    state.leaks = 0;
    state.earned = 0;
    state.towers = [];
    state.enemies = [];
    state.projs = [];
    state.beams = [];
    state.parts = [];
    state.texts = [];
    state.schedule = [];
    state.selected = null;
    state.shake = 0;
    state.endless = false;
    state.bossNow = null;
    state.ambientClock = 0;
  }

  return { state, step, startWave, placeTower, upgradeTower, sellTower, tileFree, reset };
}
