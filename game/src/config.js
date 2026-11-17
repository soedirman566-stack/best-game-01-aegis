// Aegis Line — static tuning: field geometry, the road the enemy walks, towers, enemies, waves.
// Everything the simulation and the renderer share lives here so the numbers stay in one place.

export const VIEW_W = 1280;
export const VIEW_H = 720;
export const STEP = 1 / 60;

// Battlefield grid: 20 x 14 tiles of 44 px, top bar is the HUD, right side is the command panel.
export const TILE = 44;
export const COLS = 20;
export const ROWS = 14;
export const OX = 24;
export const OY = 78;
export const FIELD_W = COLS * TILE;
export const FIELD_H = ROWS * TILE;
export const PANEL_X = OX + FIELD_W + 16;

// The road, as tile-centre waypoints. It enters off the left edge and leaves at the core on the right.
export const ROAD_TILES = [
  [-1, 2], [15, 2], [15, 5], [4, 5], [4, 9], [16, 9], [16, 12], [19, 12],
];

export function tileCentre(col, row) {
  return { x: OX + (col + 0.5) * TILE, y: OY + (row + 0.5) * TILE };
}

// Tower catalogue. dmg/rate are per level via the multiplier tables below; the special fields
// (slow, chains) belong to one tower each and grow on their own small tables.
export const TOWERS = {
  pulse: {
    name: 'Pulse Blaster', cost: 50, range: 2.7, dmg: 7, rate: 5, projSpeed: 560,
    color: '#22d3ee', dark: '#0e7490', blurb: 'Fast cheap bolts',
  },
  frost: {
    name: 'Frost Spire', cost: 75, range: 2.5, dmg: 3, rate: 2, projSpeed: 460,
    color: '#a5f3fc', dark: '#0369a1', blurb: 'Slows the line',
    slowPct: [0.45, 0.55, 0.65], slowDur: [1.3, 1.7, 2.1],
  },
  rail: {
    name: 'Rail Cannon', cost: 150, range: 4.4, dmg: 62, rate: 0.5, projSpeed: 0,
    color: '#fb923c', dark: '#c2410c', blurb: 'Piercing heavy shot',
  },
  tesla: {
    name: 'Tesla Coil', cost: 120, range: 2.9, dmg: 11, rate: 1.05, projSpeed: 0,
    color: '#c084fc', dark: '#7e22ce', blurb: 'Chain lightning',
    chains: [3, 4, 6], chainRange: 2.3, chainFalloff: 0.72,
  },
};
export const TOWER_ORDER = ['pulse', 'frost', 'rail', 'tesla'];
export const DMG_MUL = [1, 1.7, 2.9];
export const RANGE_MUL = [1, 1.12, 1.25];
export const RATE_MUL = [1, 1.18, 1.4];
export const UPGRADE_COST = [0, 0.9, 1.6]; // x base cost, by target level (index 1 = to L2, 2 = to L3)
export const SELL_REFUND = 0.7;

// Enemy catalogue. hp is the wave-1 value; waves scale it with hpMul().
export const ENEMIES = {
  runner: { hp: 16, speed: 63, reward: 4, dmg: 1, radius: 11, color: '#f87171' },
  grunt: { hp: 34, speed: 38, reward: 5, dmg: 1, radius: 13, color: '#fbbf24' },
  swarm: { hp: 8, speed: 79, reward: 2, dmg: 1, radius: 8, color: '#f472b6' },
  shielded: { hp: 30, shield: 26, speed: 34, reward: 9, dmg: 2, radius: 13, color: '#94a3b8' },
  tank: { hp: 195, speed: 20, reward: 14, dmg: 2, radius: 17, color: '#a78bfa' },
  boss: { hp: 1400, speed: 17, reward: 250, dmg: 10, radius: 24, color: '#ef4444' },
};

export function hpMul(wave) {
  const w = wave - 1;
  return 1 + w * 0.26 + w * w * 0.012;
}

// One entry per wave: spawn groups in order, each {t: type, n: count, gap: seconds between spawns}.
export const WAVE_SPECS = [
  null,
  [{ t: 'grunt', n: 8, gap: 1.2 }],
  [{ t: 'grunt', n: 10, gap: 1.0 }, { t: 'runner', n: 5, gap: 0.7 }],
  [{ t: 'runner', n: 10, gap: 0.55 }, { t: 'grunt', n: 8, gap: 0.9 }],
  [{ t: 'swarm', n: 14, gap: 0.32 }, { t: 'grunt', n: 8, gap: 0.9 }],
  [{ t: 'boss', n: 1, gap: 1 }, { t: 'grunt', n: 6, gap: 1.4 }],
  [{ t: 'shielded', n: 6, gap: 1.1 }, { t: 'grunt', n: 10, gap: 0.8 }],
  [{ t: 'runner', n: 14, gap: 0.45 }, { t: 'shielded', n: 5, gap: 1.0 }],
  [{ t: 'tank', n: 4, gap: 2.2 }, { t: 'swarm', n: 16, gap: 0.3 }],
  [{ t: 'shielded', n: 9, gap: 0.9 }, { t: 'runner', n: 10, gap: 0.5 }],
  [{ t: 'boss', n: 1, gap: 1 }, { t: 'tank', n: 3, gap: 2.6 }, { t: 'grunt', n: 8, gap: 1.0 }],
  [{ t: 'swarm', n: 24, gap: 0.24 }, { t: 'shielded', n: 6, gap: 1.0 }],
  [{ t: 'tank', n: 6, gap: 1.9 }, { t: 'runner', n: 12, gap: 0.45 }],
  [{ t: 'shielded', n: 12, gap: 0.75 }, { t: 'tank', n: 4, gap: 2.2 }],
  [{ t: 'runner', n: 18, gap: 0.4 }, { t: 'swarm', n: 20, gap: 0.26 }, { t: 'grunt', n: 10, gap: 0.8 }],
  [{ t: 'boss', n: 1, gap: 1 }, { t: 'tank', n: 4, gap: 2.4 }, { t: 'shielded', n: 8, gap: 0.9 }],
];
export const LAST_WAVE = 15;

export function waveSpec(wave) {
  if (wave <= LAST_WAVE) return WAVE_SPECS[wave];
  // Endless: recycle the hard late specs, fatter each time around.
  const base = WAVE_SPECS[11 + (wave % 4)];
  const grow = 1 + (wave - LAST_WAVE) * 0.18;
  const spec = base.map((g) => ({ t: g.t, n: Math.round(g.n * grow), gap: g.gap }));
  if (wave % 5 === 0) spec.unshift({ t: 'boss', n: 1, gap: 1 });
  return spec;
}

export const START_GOLD = 220;
export const START_LIVES = 20;
export function waveBonus(wave) {
  return 25 + wave * 2;
}
