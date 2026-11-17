// Aegis Line — hand-in program for the make.fun best-game-01 bounty.
//
// The game itself is the static site under game/ (open game/index.html in a
// browser and it plays; nothing to compile, nothing fetched). This program is
// the courier: it delivers a pristine copy of game/ and screenshots/ into the
// output directory, asks the vendored make.fun library to summarise the
// delivery as dossier.json for the judge, and finally leaves a small
// build-info.json receipt of its own — what was shipped, how big each file
// is, and when the shipment was packed.
//
// Run it the way the grader does, with the output directory named by the
// MAKEFUN_OUTPUT_DIR environment variable (falling back to /output):
//   MAKEFUN_OUTPUT_DIR=out node main.ts

import * as fs from 'node:fs';
import * as path from 'node:path';
import { buildDossier } from './vendor/makefun-game.ts';

const GAME_TITLE = 'Aegis Line — Neon Tower Defense';

// The platform's published limits for an entry like this one. The dossier
// builder enforces them while it summarises, so an entry that would be
// refused is refused here first, loudly, instead of at the gate.
const DOSSIER_LIMITS = {
  text_max_bytes: 163_840,
  screenshots: { max: 4, max_bytes: 262_144 },
  game_max_files: 993,
  game_max_bytes: 50_331_648,
  game_path_max_bytes: 1_000,
};

// One file on its way to the output directory: where it lives here, the path
// it will carry there, and its size in bytes.
interface Parcel {
  from: string;
  label: string;
  bytes: number;
}

// Recursively collect every regular file under `dir`, labelling each with
// its path relative to the repository root (e.g. "game/src/world.js").
function gatherParcels(dir: string, labelPrefix: string): Parcel[] {
  const parcels: Parcel[] = [];
  const pending: Array<{ abs: string; label: string }> = [{ abs: dir, label: labelPrefix }];
  while (pending.length > 0) {
    const current = pending.pop()!;
    for (const entry of fs.readdirSync(current.abs, { withFileTypes: true })) {
      const childAbs = path.join(current.abs, entry.name);
      const childLabel = `${current.label}/${entry.name}`;
      if (entry.isDirectory()) {
        pending.push({ abs: childAbs, label: childLabel });
      } else if (entry.isFile()) {
        parcels.push({ from: childAbs, label: childLabel, bytes: fs.statSync(childAbs).size });
      }
    }
  }
  // Stable order, so the receipt reads the same on every run.
  return parcels.sort((a, b) => a.label.localeCompare(b.label));
}

// Ship each parcel to the same relative path under the output directory,
// creating folders as needed. Returns the parcels actually delivered.
function deliver(parcels: Parcel[], outputDir: string): Parcel[] {
  const delivered: Parcel[] = [];
  for (const parcel of parcels) {
    const target = path.join(outputDir, parcel.label);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(parcel.from, target);
    delivered.push(parcel);
  }
  return delivered;
}

// "53,823 B" / "1.25 KiB" — for log lines a human might actually read.
function describeBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  return `${(n / 1024).toFixed(2)} KiB`;
}

function main(): void {
  const repoRoot = path.dirname(new URL(import.meta.url).pathname);
  const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
  fs.mkdirSync(outputDir, { recursive: true });

  // Pack the two payloads: the playable game and its screenshots.
  const gameParcels = gatherParcels(path.join(repoRoot, 'game'), 'game');
  const shotsDir = path.join(repoRoot, 'screenshots');
  const shotParcels = fs.existsSync(shotsDir) ? gatherParcels(shotsDir, 'screenshots') : [];

  const shipped = [
    ...deliver(gameParcels, outputDir),
    ...deliver(shotParcels, outputDir),
  ];
  const sourceBytes = gameParcels.reduce((sum, p) => sum + p.bytes, 0);
  console.log(
    `[aegis] shipped ${shipped.length} files to ${outputDir} ` +
      `(game source ${describeBytes(sourceBytes)}, ${shotParcels.length} screenshots)`,
  );

  // The judge's summary, produced by the vendored library from the shipped
  // copy — never from the working tree, so the dossier describes exactly
  // what was delivered.
  const dossier = buildDossier(outputDir, DOSSIER_LIMITS);
  fs.writeFileSync(path.join(outputDir, 'dossier.json'), dossier);
  console.log(`[aegis] dossier.json written (${describeBytes(dossier.byteLength)})`);

  // Our own receipt beside it: title, packing time, the manifest of shipped
  // files with their sizes, the game's total source size, and the names of
  // the screenshots on board.
  const receipt = {
    game: GAME_TITLE,
    builtAt: new Date().toISOString(),
    copiedFiles: shipped.map((p) => ({ path: p.label, bytes: p.bytes })),
    totalSourceBytes: sourceBytes,
    screenshots: shotParcels.map((p) => path.basename(p.from)),
  };
  fs.writeFileSync(path.join(outputDir, 'build-info.json'), `${JSON.stringify(receipt, null, 2)}\n`);
  console.log('[aegis] build-info.json written');
}

main();
