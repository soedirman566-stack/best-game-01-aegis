// Aegis Line — every pixel. Pure Canvas 2D: a dark grid battlefield, a glowing road, neon towers
// and enemies drawn as distinct shapes per type. The panel/HUD layout is exported as rects so the
// input code in main.js hit-tests exactly what is drawn here.

import {
  VIEW_W, VIEW_H, TILE, COLS, ROWS, OX, OY, FIELD_W, FIELD_H, PANEL_X,
  TOWERS, TOWER_ORDER, ENEMIES, LAST_WAVE,
} from './config.js';
import { ROAD_PTS, ROAD_TILES_SET, towerStats, upgradeCost } from './world.js';

export const SCREEN_MENU = 'menu';
export const SCREEN_PLAY = 'playing';
export const SCREEN_OVER = 'over';
export const SCREEN_VICTORY = 'victory';

// Panel geometry (right of the field).
const PW = VIEW_W - PANEL_X - 8;
export const RECTS = {
  cards: TOWER_ORDER.map((type, i) => ({
    type,
    x: PANEL_X + 8 + (i % 2) * (PW / 2),
    y: 128 + Math.floor(i / 2) * 92,
    w: PW / 2 - 8,
    h: 84,
  })),
  info: { x: PANEL_X + 8, y: 320, w: PW - 8, h: 148 },
  upgrade: { x: PANEL_X + 16, y: 416, w: (PW - 32) / 2, h: 40 },
  sell: { x: PANEL_X + 16 + (PW - 32) / 2 + 8, y: 416, w: (PW - 32) / 2 - 8, h: 40 },
  wave: { x: PANEL_X + 8, y: 482, w: PW - 8, h: 54 },
  speed: { x: PANEL_X + 8, y: 548, w: (PW - 16) / 2, h: 40 },
  pause: { x: PANEL_X + 8 + (PW - 16) / 2 + 8, y: 548, w: (PW - 16) / 2 - 8, h: 40 },
  menuStart: { x: VIEW_W / 2 - 150, y: 486, w: 300, h: 58 },
  overRestart: { x: VIEW_W / 2 - 150, y: 470, w: 300, h: 58 },
  victoryEndless: { x: VIEW_W / 2 - 310, y: 470, w: 300, h: 58 },
  victoryAgain: { x: VIEW_W / 2 + 10, y: 470, w: 300, h: 58 },
};

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function label(ctx, text, x, y, size, color, align = 'left', weight = 700) {
  ctx.fillStyle = color;
  ctx.font = weight + ' ' + size + 'px system-ui, sans-serif';
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y);
}

function drawField(ctx, state) {
  ctx.fillStyle = '#0a101d';
  ctx.fillRect(OX - 8, OY - 8, FIELD_W + 16, FIELD_H + 16);
  ctx.strokeStyle = 'rgba(56,189,248,0.35)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(OX - 8, OY - 8, FIELD_W + 16, FIELD_H + 16);
  ctx.strokeStyle = 'rgba(148,163,184,0.07)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let c = 1; c < COLS; c += 1) { ctx.moveTo(OX + c * TILE, OY); ctx.lineTo(OX + c * TILE, OY + FIELD_H); }
  for (let r = 1; r < ROWS; r += 1) { ctx.moveTo(OX, OY + r * TILE); ctx.lineTo(OX + FIELD_W, OY + r * TILE); }
  ctx.stroke();

  // The road: a wide dark lane with a lit centre line, tile by tile so corners stay clean.
  for (const key of ROAD_TILES_SET) {
    const [c, r] = key.split(',').map(Number);
    ctx.fillStyle = '#1b2639';
    ctx.fillRect(OX + c * TILE + 1, OY + r * TILE + 1, TILE - 2, TILE - 2);
  }
  ctx.strokeStyle = 'rgba(251,191,36,0.28)';
  ctx.lineWidth = 2;
  ctx.setLineDash([10, 12]);
  ctx.lineDashOffset = -state.time * 26;
  ctx.beginPath();
  ROAD_PTS.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.stroke();
  ctx.setLineDash([]);

  // Spawn portal (left) and the core (right): concentric rings and a pulsing hex reactor.
  const s = ROAD_PTS[0];
  const e = ROAD_PTS[ROAD_PTS.length - 1];
  ctx.strokeStyle = '#f87171';
  for (let i = 0; i < 3; i += 1) {
    ctx.globalAlpha = 0.75 - i * 0.2;
    ctx.beginPath();
    ctx.arc(OX + 6, s.y, 6 + i * 6 + Math.sin(state.time * 3 + i) * 1.5, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  const pulse = 0.75 + Math.sin(state.time * 2.4) * 0.25;
  ctx.save();
  ctx.translate(OX + FIELD_W - 4, e.y);
  ctx.rotate(Math.PI / 6);
  ctx.fillStyle = '#134e4a';
  ctx.strokeStyle = '#2dd4bf';
  ctx.lineWidth = 2;
  const R = 17;
  ctx.beginPath();
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * Math.PI * 2;
    const px = Math.cos(a) * R;
    const py = Math.sin(a) * R;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  ctx.fillStyle = 'rgba(45,212,191,' + (0.55 * pulse + 0.3) + ')';
  ctx.beginPath();
  ctx.arc(OX + FIELD_W - 4, e.y, 6.5, 0, Math.PI * 2);
  ctx.fill();
}

function drawTowerShape(ctx, t, time) {
  const def = TOWERS[t.type];
  ctx.save();
  ctx.translate(t.x, t.y);
  // Plinth + level pips.
  ctx.fillStyle = '#131c2e';
  ctx.strokeStyle = def.color;
  ctx.lineWidth = 1.6;
  rr(ctx, -17, -17, 34, 34, 7);
  ctx.fill();
  ctx.stroke();
  if (t.level === 3) {
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    rr(ctx, -20, -20, 40, 40, 9);
    ctx.stroke();
  }
  ctx.fillStyle = def.color;
  for (let i = 0; i < t.level; i += 1) ctx.fillRect(-9 + i * 7, 12.5, 5, 3);

  ctx.rotate(t.ang || 0);
  if (t.type === 'pulse') {
    ctx.fillStyle = def.dark;
    ctx.fillRect(0, -3.5, 17, 7);
    ctx.fillStyle = def.color;
    ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ecfeff';
    ctx.beginPath(); ctx.arc(0, 0, 3.4, 0, Math.PI * 2); ctx.fill();
  } else if (t.type === 'rail') {
    ctx.fillStyle = def.dark;
    ctx.fillRect(-4, -4.5, 26, 9);
    ctx.fillStyle = def.color;
    ctx.fillRect(14, -2.5, 9, 5);
    ctx.beginPath(); ctx.arc(-4, 0, 7.5, 0, Math.PI * 2); ctx.fill();
  } else if (t.type === 'tesla') {
    ctx.rotate(-(t.ang || 0));
    ctx.strokeStyle = def.color;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, 8); ctx.lineTo(0, -6); ctx.stroke();
    const flick = 0.7 + Math.sin(time * 11 + t.x) * 0.3;
    ctx.fillStyle = def.color;
    ctx.globalAlpha = flick;
    ctx.beginPath(); ctx.arc(0, -10, 6, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#faf5ff';
    ctx.beginPath(); ctx.arc(0, -10, 2.6, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();

  if (t.type === 'frost') {
    ctx.save();
    ctx.translate(t.x, t.y);
    ctx.rotate(Math.PI / 4 + Math.sin(time * 1.4 + t.y) * 0.12);
    ctx.fillStyle = def.dark;
    ctx.fillRect(-9, -9, 18, 18);
    ctx.fillStyle = def.color;
    ctx.fillRect(-6, -6, 12, 12);
    ctx.fillStyle = '#f0fdff';
    ctx.fillRect(-2.6, -2.6, 5.2, 5.2);
    ctx.restore();
  }
  if (t.flash > 0) {
    ctx.fillStyle = 'rgba(255,255,255,' + Math.min(0.7, t.flash * 9) + ')';
    ctx.beginPath();
    ctx.arc(t.x + Math.cos(t.ang || 0) * 20, t.y + Math.sin(t.ang || 0) * 20, 7, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawEnemy(ctx, e, time) {
  const def = ENEMIES[e.type];
  ctx.save();
  ctx.translate(e.x, e.y);
  const slowed = time < e.slowUntil;
  if (e.type === 'runner') {
    ctx.rotate(e.ang);
    ctx.fillStyle = def.color;
    ctx.beginPath();
    ctx.moveTo(13, 0); ctx.lineTo(-9, -8); ctx.lineTo(-5, 0); ctx.lineTo(-9, 8);
    ctx.closePath(); ctx.fill();
  } else if (e.type === 'swarm') {
    ctx.fillStyle = def.color;
    ctx.beginPath(); ctx.arc(0, 0, e.radius, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fdf2f8';
    ctx.beginPath(); ctx.arc(0, 0, 3, 0, Math.PI * 2); ctx.fill();
  } else if (e.type === 'tank') {
    ctx.rotate(e.ang);
    ctx.fillStyle = def.color;
    rr(ctx, -16, -14, 32, 28, 6); ctx.fill();
    ctx.fillStyle = '#2e1065';
    rr(ctx, -8, -7, 16, 14, 4); ctx.fill();
  } else if (e.type === 'boss') {
    ctx.fillStyle = def.color;
    ctx.beginPath();
    for (let i = 0; i < 8; i += 1) {
      const a = (i / 8) * Math.PI * 2 + time * 0.7;
      const px = Math.cos(a) * (e.radius + 7);
      const py = Math.sin(a) * (e.radius + 7);
      ctx.moveTo(px, py);
      ctx.lineTo(Math.cos(a + 0.4) * e.radius * 0.8, Math.sin(a + 0.4) * e.radius * 0.8);
      ctx.lineTo(Math.cos(a - 0.4) * e.radius * 0.8, Math.sin(a - 0.4) * e.radius * 0.8);
    }
    ctx.fill();
    ctx.beginPath(); ctx.arc(0, 0, e.radius, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#7f1d1d';
    ctx.beginPath(); ctx.arc(0, 0, e.radius * 0.55, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fecaca';
    ctx.beginPath(); ctx.arc(0, 0, 5.5, 0, Math.PI * 2); ctx.fill();
  } else {
    ctx.fillStyle = def.color;
    ctx.beginPath(); ctx.arc(0, 0, e.radius, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.arc(0, 0, e.radius * 0.5, 0, Math.PI * 2); ctx.fill();
  }
  if (e.maxShield > 0 && e.shield > 0) {
    ctx.strokeStyle = 'rgba(125,211,252,' + (0.35 + 0.55 * (e.shield / e.maxShield)) + ')';
    ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.arc(0, 0, e.radius + 4.5, 0, Math.PI * 2); ctx.stroke();
  }
  if (slowed) {
    ctx.fillStyle = 'rgba(165,243,252,0.3)';
    ctx.beginPath(); ctx.arc(0, 0, e.radius + 1.5, 0, Math.PI * 2); ctx.fill();
  }
  if (e.flash > 0) {
    ctx.fillStyle = 'rgba(255,255,255,' + Math.min(0.85, e.flash * 8) + ')';
    ctx.beginPath(); ctx.arc(0, 0, e.radius, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();

  if (e.hp < e.maxHp && e.type !== 'boss') {
    const w = e.radius * 2;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(e.x - w / 2, e.y - e.radius - 10, w, 4);
    ctx.fillStyle = e.hp / e.maxHp > 0.35 ? '#4ade80' : '#f87171';
    ctx.fillRect(e.x - w / 2, e.y - e.radius - 10, w * Math.max(0, e.hp / e.maxHp), 4);
  }
}

function drawFx(ctx, state) {
  for (const p of state.projs) {
    ctx.fillStyle = p.color;
    ctx.globalAlpha = 0.35;
    ctx.beginPath(); ctx.arc(p.x, p.y, 7, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.beginPath(); ctx.arc(p.x, p.y, 3.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(p.x, p.y, 1.4, 0, Math.PI * 2); ctx.fill();
  }
  for (const b of state.beams) {
    const a = Math.max(0, b.life / b.maxLife);
    ctx.strokeStyle = b.color;
    ctx.globalAlpha = a * 0.4;
    ctx.lineWidth = b.width * 2.6;
    ctx.beginPath();
    if (b.pts) b.pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    else { ctx.moveTo(b.x1, b.y1); ctx.lineTo(b.x2, b.y2); }
    ctx.stroke();
    ctx.globalAlpha = a;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = b.width * 0.7;
    ctx.beginPath();
    if (b.pts) b.pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    else { ctx.moveTo(b.x1, b.y1); ctx.lineTo(b.x2, b.y2); }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  for (const p of state.parts) {
    ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
  }
  ctx.globalAlpha = 1;
  for (const t of state.texts) {
    ctx.globalAlpha = Math.min(1, t.life / 0.5);
    label(ctx, t.str, t.x, t.y, 13, t.color, 'center', 800);
  }
  ctx.globalAlpha = 1;
}

function drawHud(ctx, state) {
  ctx.fillStyle = '#0d1526';
  ctx.fillRect(0, 0, VIEW_W, 54);
  ctx.fillStyle = 'rgba(56,189,248,0.4)';
  ctx.fillRect(0, 54, VIEW_W, 1.5);
  label(ctx, 'AEGIS LINE', 24, 27, 21, '#7dd3fc', 'left', 900);
  label(ctx, 'GOLD ' + state.gold, 300, 27, 17, '#fde68a');
  label(ctx, 'CORE ' + state.lives, 470, 27, 17, state.lives <= 5 ? '#f87171' : '#6ee7b7');
  label(ctx, 'WAVE ' + Math.max(1, state.wave) + (state.endless ? ' (ENDLESS)' : ' / ' + LAST_WAVE), 640, 27, 17, '#e2e8f0');
  label(ctx, 'KILLS ' + state.kills, 900, 27, 17, '#cbd5e1');
  label(ctx, state.phase === 'wave' ? 'WAVE INBOUND' : 'BUILD PHASE', 1248, 27, 13, state.phase === 'wave' ? '#fca5a5' : '#93c5fd', 'right', 800);

  if (state.bossNow && state.bossNow.alive) {
    const b = state.bossNow;
    const w = 520;
    const x = OX + FIELD_W / 2 - w / 2;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(x - 4, 60, w + 8, 15);
    ctx.fillStyle = '#7f1d1d';
    ctx.fillRect(x, 63, w, 9);
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(x, 63, w * Math.max(0, b.hp / b.maxHp), 9);
    label(ctx, 'BOSS', x + w / 2, 56 + 11, 10, '#fecaca', 'center', 900);
  }
}

function drawPanel(ctx, state, ui) {
  ctx.fillStyle = '#0d1526';
  ctx.fillRect(PANEL_X, OY - 8, VIEW_W - PANEL_X, FIELD_H + 16);
  label(ctx, 'COMMAND', PANEL_X + 8, 96, 13, '#64748b', 'left', 900);
  label(ctx, 'BUILD A TOWER', PANEL_X + 8, 118, 12, '#94a3b8', 'left', 800);

  for (const card of RECTS.cards) {
    const def = TOWERS[card.type];
    const afford = state.gold >= def.cost;
    const active = ui.placing === card.type;
    ctx.fillStyle = active ? '#1e3a4c' : '#111c30';
    ctx.strokeStyle = active ? def.color : 'rgba(148,163,184,0.3)';
    ctx.lineWidth = active ? 2.2 : 1.2;
    rr(ctx, card.x, card.y, card.w, card.h, 8);
    ctx.fill();
    ctx.stroke();
    // Miniature of the tower in the card's left gutter.
    drawTowerShape(ctx, { type: card.type, x: card.x + 24, y: card.y + 34, level: 1, ang: -0.5, flash: 0 }, state.time);
    label(ctx, def.name, card.x + 46, card.y + 20, 14.5, afford ? '#f1f5f9' : '#64748b', 'left', 800);
    label(ctx, def.blurb, card.x + 46, card.y + 39, 11, '#94a3b8', 'left', 600);
    label(ctx, 'DMG ' + def.dmg + ' · RNG ' + def.range, card.x + 46, card.y + 63, 9.5, '#7d8aa0', 'left', 600);
    label(ctx, def.cost + 'g', card.x + card.w - 8, card.y + 63, 12.5, afford ? '#fde68a' : '#b45309', 'right', 800);
  }

  // Info box: selected tower details, or placement help.
  const info = RECTS.info;
  ctx.fillStyle = '#0a1322';
  ctx.strokeStyle = 'rgba(148,163,184,0.22)';
  ctx.lineWidth = 1;
  rr(ctx, info.x, info.y, info.w, info.h, 8);
  ctx.fill();
  ctx.stroke();
  const sel = state.selected;
  if (sel) {
    const def = TOWERS[sel.type];
    const st = towerStats(sel);
    label(ctx, def.name + '  ·  LV ' + sel.level, info.x + 12, info.y + 22, 15, def.color, 'left', 800);
    label(ctx, 'DMG ' + Math.round(st.dmg) + ' · RNG ' + (st.range / TILE).toFixed(1) + ' · RATE ' + st.rate.toFixed(1) + '/s', info.x + 12, info.y + 46, 12, '#cbd5e1', 'left', 600);
    label(ctx, 'Invested ' + sel.invested + 'g', info.x + 12, info.y + 68, 12, '#94a3b8', 'left', 600);
    const up = RECTS.upgrade;
    const sell = RECTS.sell;
    const cost = upgradeCost(sel);
    ctx.fillStyle = cost && state.gold >= cost ? '#14532d' : '#1e293b';
    rr(ctx, up.x, up.y, up.w, up.h, 7); ctx.fill();
    label(ctx, cost ? 'UPGRADE ' + cost + 'g' : 'MAX LEVEL', up.x + up.w / 2, up.y + up.h / 2, 13, cost && state.gold >= cost ? '#bbf7d0' : '#64748b', 'center', 800);
    ctx.fillStyle = '#451a1a';
    rr(ctx, sell.x, sell.y, sell.w, sell.h, 7); ctx.fill();
    label(ctx, 'SELL +' + Math.round(sel.invested * 0.7) + 'g', sell.x + sell.w / 2, sell.y + sell.h / 2, 13, '#fecaca', 'center', 800);
  } else if (ui.placing) {
    const def = TOWERS[ui.placing];
    label(ctx, 'Placing: ' + def.name, info.x + 12, info.y + 24, 15, def.color, 'left', 800);
    label(ctx, 'Click a free tile to build.', info.x + 12, info.y + 50, 12.5, '#cbd5e1', 'left', 600);
    label(ctx, 'Right-click or Esc to cancel.', info.x + 12, info.y + 72, 12.5, '#94a3b8', 'left', 600);
  } else {
    label(ctx, 'No tower selected', info.x + 12, info.y + 24, 14, '#e2e8f0', 'left', 800);
    label(ctx, 'Pick a tower above, then click a tile.', info.x + 12, info.y + 50, 12.5, '#94a3b8', 'left', 600);
    label(ctx, 'Click a built tower to upgrade or sell it.', info.x + 12, info.y + 72, 12.5, '#94a3b8', 'left', 600);
    label(ctx, 'Bosses land on waves 5, 10 and 15.', info.x + 12, info.y + 104, 12.5, '#fca5a5', 'left', 700);
    label(ctx, 'Hold the line for ' + LAST_WAVE + ' waves.', info.x + 12, info.y + 126, 12.5, '#94a3b8', 'left', 600);
  }

  const wave = RECTS.wave;
  const canWave = state.phase === 'build' && state.screen === SCREEN_PLAY;
  ctx.fillStyle = canWave ? '#7c2d12' : '#1e293b';
  rr(ctx, wave.x, wave.y, wave.w, wave.h, 9); ctx.fill();
  ctx.strokeStyle = canWave ? '#fb923c' : 'rgba(148,163,184,0.25)';
  ctx.stroke();
  label(ctx, canWave ? '▶  START WAVE ' + (state.wave + 1) : 'WAVE ' + state.wave + ' RUNNING…', wave.x + wave.w / 2, wave.y + wave.h / 2, 16, canWave ? '#ffedd5' : '#64748b', 'center', 900);

  const sp = RECTS.speed;
  const pa = RECTS.pause;
  ctx.fillStyle = '#111c30'; rr(ctx, sp.x, sp.y, sp.w, sp.h, 7); ctx.fill();
  label(ctx, 'SPEED ' + ui.speed + 'x', sp.x + sp.w / 2, sp.y + sp.h / 2, 13, '#e2e8f0', 'center', 800);
  ctx.fillStyle = '#111c30'; rr(ctx, pa.x, pa.y, pa.w, pa.h, 7); ctx.fill();
  label(ctx, ui.paused ? 'RESUME' : 'PAUSE', pa.x + pa.w / 2, pa.y + pa.h / 2, 13, '#e2e8f0', 'center', 800);

  label(ctx, 'Keys: 1-4 build · U upgrade · X sell', PANEL_X + 8, 616, 11.5, '#64748b', 'left', 600);
  label(ctx, 'Space wave · F speed · P pause · M mute', PANEL_X + 8, 638, 11.5, '#64748b', 'left', 600);
  label(ctx, ui.muted ? 'Sound: OFF (M)' : 'Sound: ON (M)', PANEL_X + 8, 668, 11.5, '#64748b', 'left', 600);
}

function veil(ctx) {
  ctx.fillStyle = 'rgba(4,8,16,0.72)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
}

function bigButton(ctx, rect, text, color) {
  ctx.fillStyle = color;
  rr(ctx, rect.x, rect.y, rect.w, rect.h, 10);
  ctx.fill();
  label(ctx, text, rect.x + rect.w / 2, rect.y + rect.h / 2, 19, '#f8fafc', 'center', 900);
}

function drawMenu(ctx, state) {
  veil(ctx);
  label(ctx, 'AEGIS LINE', VIEW_W / 2, 150, 74, '#7dd3fc', 'center', 900);
  label(ctx, 'NEON TOWER DEFENSE', VIEW_W / 2, 196, 19, '#f0abfc', 'center', 800);
  label(ctx, 'The swarm is coming down the wire. Build towers beside the road,', VIEW_W / 2, 268, 17, '#e2e8f0', 'center', 600);
  label(ctx, 'upgrade them as the waves harden, and do not let them reach the core.', VIEW_W / 2, 294, 17, '#e2e8f0', 'center', 600);
  const lines = [
    'PULSE BLASTER — fast cheap bolts      FROST SPIRE — slows the whole line',
    'RAIL CANNON — piercing heavy shot     TESLA COIL — lightning that chains',
    'Survive 15 waves. Bosses land on waves 5, 10 and 15.',
    'Click a card, click a tile to build. Click a tower to upgrade or sell.',
  ];
  lines.forEach((ln, i) => label(ctx, ln, VIEW_W / 2, 348 + i * 27, 14.5, i < 2 ? '#a5b4fc' : '#94a3b8', 'center', 600));
  bigButton(ctx, RECTS.menuStart, '▶  DEPLOY THE LINE', '#0369a1');
  label(ctx, 'Mouse + keyboard · Space starts a wave · F speed · P pause', VIEW_W / 2, 586, 13, '#64748b', 'center', 600);
}

function drawEnd(ctx, state, victory) {
  veil(ctx);
  label(ctx, victory ? 'THE LINE HOLDS' : 'CORE BREACHED', VIEW_W / 2, 190, 58, victory ? '#6ee7b7' : '#f87171', 'center', 900);
  label(ctx, victory ? 'All ' + LAST_WAVE + ' waves repelled. The grid is quiet — for now.' : 'The swarm reached the core on wave ' + state.wave + '.', VIEW_W / 2, 244, 17, '#e2e8f0', 'center', 600);
  label(ctx, 'Kills ' + state.kills + '   ·   Gold earned ' + state.earned + 'g   ·   Leaks ' + state.leaks, VIEW_W / 2, 320, 19, '#fde68a', 'center', 800);
  label(ctx, 'Waves cleared ' + (victory ? LAST_WAVE : state.wave - (state.phase === 'wave' ? 1 : 0)), VIEW_W / 2, 356, 15, '#94a3b8', 'center', 600);
  if (victory) {
    bigButton(ctx, RECTS.victoryEndless, '∞  ENDLESS MODE', '#7c2d12');
    bigButton(ctx, RECTS.victoryAgain, '↻  PLAY AGAIN', '#0369a1');
  } else {
    bigButton(ctx, RECTS.overRestart, '↻  REBUILD THE LINE', '#0369a1');
  }
}

export function draw(ctx, state, ui) {
  ctx.fillStyle = '#070b16';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.save();
  if (state.shake > 0) {
    const s = state.shake * 7;
    ctx.translate(Math.sin(state.time * 91) * s, Math.cos(state.time * 83) * s);
  }
  drawField(ctx, state);

  // Placement / selection range previews sit under the actors.
  const preview = (x, y, range, ok) => {
    ctx.fillStyle = ok ? 'rgba(74,222,128,0.13)' : 'rgba(248,113,113,0.13)';
    ctx.beginPath(); ctx.arc(x, y, range, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = ok ? 'rgba(74,222,128,0.6)' : 'rgba(248,113,113,0.6)';
    ctx.lineWidth = 1.4;
    ctx.stroke();
  };
  if (state.screen === SCREEN_PLAY && ui.placing && ui.hover) {
    const def = TOWERS[ui.placing];
    preview(ui.hover.x, ui.hover.y, def.range * TILE, ui.hoverOk);
    ctx.fillStyle = ui.hoverOk ? 'rgba(74,222,128,0.35)' : 'rgba(248,113,113,0.35)';
    ctx.fillRect(ui.hover.x - TILE / 2 + 2, ui.hover.y - TILE / 2 + 2, TILE - 4, TILE - 4);
  }
  if (state.selected) {
    const st = towerStats(state.selected);
    preview(state.selected.x, state.selected.y, st.range, true);
  }

  for (const t of state.towers) drawTowerShape(ctx, t, state.time);
  for (const e of state.enemies) drawEnemy(ctx, e, state.time);
  drawFx(ctx, state);
  ctx.restore();

  drawHud(ctx, state);
  if (state.screen !== SCREEN_MENU) drawPanel(ctx, state, ui);
  if (state.screen === SCREEN_MENU) drawMenu(ctx, state);
  if (state.screen === SCREEN_OVER) drawEnd(ctx, state, false);
  if (state.screen === SCREEN_VICTORY) drawEnd(ctx, state, true);
  if (ui.paused && state.screen === SCREEN_PLAY) {
    ctx.fillStyle = 'rgba(4,8,16,0.5)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    label(ctx, 'PAUSED', VIEW_W / 2, VIEW_H / 2, 44, '#e2e8f0', 'center', 900);
  }
}
