import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import { parseSongMetaYaml, parseTrackYaml } from "../src/music/songSchema.ts";

const root = process.cwd();
const songsDir = path.join(root, "songs");
const [command, ...args] = process.argv.slice(2);

/** Matches `instrumentSchema` in songSchema — no baked-in sounds or starter figures. */
const INSTRUMENT_IDS = [
  "grand_piano",
  "cinematic_strings",
  "upright_bass",
  "hybrid_drums",
  "drum_kit",
  "glass_pad",
  "solo_cello",
  "analog_lead",
  "electric_piano"
];

if (!command || command === "help" || command === "--help") help();
else if (command === "instruments") listInstruments();
else if (command === "new-track") newTrack(args);
else if (command === "check") check(args[0]);
else fail(`Unknown command: ${command}`);

function listInstruments() {
  print([
    toon("instruments", ["id"], INSTRUMENT_IDS.map((id) => [id])),
    "help[2]:",
    "  For complex songs, prefer `bun run arrange compile <song-id>` from arrangement.ts",
    "  Run `bun run yaml new-track <song-id> <track-id> <instrument>`",
    "  Add sound:, pattern:, notes:, mix fields yourself; no starters are generated"
  ]);
}

function newTrack([songId, trackId, instrument, ...rest]) {
  if (!songId || !trackId || !instrument) {
    fail("Usage: bun run yaml new-track <song-id> <track-id> <instrument> [--force]");
  }
  if (!INSTRUMENT_IDS.includes(instrument)) {
    fail(`Unsupported instrument: ${instrument}. Run \`bun run yaml instruments\`.`);
  }

  const songPath = path.join(songsDir, songId, "song.yaml");
  const trackPath = path.join(songsDir, songId, "tracks", `${trackId}.track.yaml`);
  if (!fs.existsSync(songPath)) fail(`Song not found: ${songId}`);
  if (fs.existsSync(trackPath) && !rest.includes("--force")) {
    fail(`Track already exists: ${shortPath(trackPath)}; pass --force to replace it`);
  }

  const track = minimalTrack(trackId, instrument);
  parseTrackYaml(yaml.dump(track));
  fs.mkdirSync(path.dirname(trackPath), { recursive: true });
  fs.writeFileSync(trackPath, yaml.dump(track, { lineWidth: 120, noRefs: true }), "utf8");
  ensureTrackOrder(songPath, trackId);

  print([
    "created:",
    `  track: ${shortPath(trackPath)}`,
    `  instrument: ${instrument}`,
    "help[2]:",
    `  Edit \`${shortPath(trackPath)}\` — set sound, notes or pattern, mix`,
    `  Run \`bun run yaml check ${songId}\``
  ]);
}

function minimalTrack(id, instrument) {
  const title = id
    .split(/[-_]+/)
    .filter(Boolean)
    .map((p) => p[0].toUpperCase() + p.slice(1))
    .join(" ");
  return {
    id,
    name: title || id,
    instrument,
    notes: [{ time: "1:1", duration: "4n", pitch: "C4", velocity: 0.72 }]
  };
}

function check(songId) {
  const songIds = songId ? [songId] : fs.readdirSync(songsDir).filter((entry) => fs.existsSync(path.join(songsDir, entry, "song.yaml")));
  const issues = [];
  let checkedTracks = 0;

  for (const id of songIds) {
    const songPath = path.join(songsDir, id, "song.yaml");
    try {
      parseSongMetaYaml(fs.readFileSync(songPath, "utf8"));
    } catch (error) {
      issues.push([shortPath(songPath), message(error)]);
    }

    const tracksDir = path.join(songsDir, id, "tracks");
    if (!fs.existsSync(tracksDir)) continue;
    for (const file of fs.readdirSync(tracksDir).filter((name) => name.endsWith(".track.yaml"))) {
      const trackPath = path.join(tracksDir, file);
      checkedTracks += 1;
      try {
        parseTrackYaml(fs.readFileSync(trackPath, "utf8"));
      } catch (error) {
        issues.push([shortPath(trackPath), message(error)]);
      }
    }
  }

  print([
    `status: ${issues.length === 0 ? "ok" : "error"}`,
    `songs_checked: ${songIds.length}`,
    `tracks_checked: ${checkedTracks}`,
    issues.length ? toon("issues", ["file", "error"], issues) : "issues[0]: none",
    "help[2]:",
    "  Run `bun run arrange check <song-id>` for compiled arrangements",
    "  Run `bun run yaml instruments`",
    "  Run `bun run check` for musical audit plus build"
  ]);
  process.exitCode = issues.length === 0 ? 0 : 1;
}

function ensureTrackOrder(songPath, trackId) {
  const song = yaml.load(fs.readFileSync(songPath, "utf8"));
  const order = Array.isArray(song.trackOrder) ? song.trackOrder : [];
  if (order.includes(trackId)) return;
  song.trackOrder = [...order, trackId];
  parseSongMetaYaml(yaml.dump(song));
  fs.writeFileSync(songPath, yaml.dump(song, { lineWidth: 120, noRefs: true }), "utf8");
}

function help() {
  print([
    "description: Schema-aware helpers for song/track YAML (no instrument presets)",
    "commands[4]{name,description}:",
    "  instruments,List legal instrument ids",
    "  new-track <song-id> <track-id> <instrument>,Minimal valid track (one placeholder note)",
    "  check [song-id],Validate song and track YAML",
    "  help,Show this reference",
    "examples[3]:",
    "  bun run yaml instruments",
    "  bun run yaml new-track my-song bass-line upright_bass",
    "  bun run yaml check my-song"
  ]);
}

function toon(name, fields, rows) {
  if (rows.length === 0) return `${name}[0]: none`;
  return [`${name}[${rows.length}]{${fields.join(",")}}:`, ...rows.map((row) => `  ${row.map(formatCell).join(",")}`)].join("\n");
}

function formatCell(value) {
  const string = value === undefined || value === null ? "" : String(value);
  return /[,\n]/.test(string) ? JSON.stringify(string) : string;
}

function shortPath(file) {
  return path.relative(root, file);
}

function message(error) {
  return error instanceof Error ? error.message.replace(/\n/g, "; ") : String(error);
}

function print(lines) {
  console.log(lines.filter(Boolean).join("\n"));
}

function fail(error) {
  print([`status: error`, `error: ${error}`, "exit_code: 1", "help[1]:", "  Run `bun run yaml help`"]);
  process.exit(1);
}
