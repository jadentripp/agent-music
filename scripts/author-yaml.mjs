import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import { parseSongMetaYaml, parseTrackYaml } from "../src/music/songSchema.ts";

const root = process.cwd();
const songsDir = path.join(root, "songs");
const [command, ...args] = process.argv.slice(2);

const instruments = {
  grand_piano: {
    name: "Grand Piano",
    sound: { source: "sample_pack", samplePack: "/samples/salamander-grand-v8/manifest.yaml" },
    mix: { gain: 0.56, pan: -0.12, reverb: 0.42, humanize: 0.014 },
    notes: [{ time: "1:1", duration: "2n", pitches: ["C3", "G3", "E4"], velocity: 0.5, strum: 0.018 }]
  },
  cinematic_strings: {
    name: "Cinematic Strings",
    sound: { source: "sample_pack", samplePack: "/samples/vsco-violin-section-sustain/manifest.yaml" },
    mix: { gain: 0.48, pan: 0.18, reverb: 0.62, humanize: 0.018 },
    notes: [{ time: "1:1", duration: "2m", pitch: "C4", velocity: 0.46, articulation: "sustain" }]
  },
  solo_cello: {
    name: "Solo Cello",
    sound: { source: "sample_pack", samplePack: "/samples/vsco-cello-section-sustain/manifest.yaml" },
    mix: { gain: 0.5, pan: -0.18, reverb: 0.5, humanize: 0.016 },
    notes: [{ time: "1:1", duration: "2n", pitch: "C3", velocity: 0.52, articulation: "legato" }]
  },
  drum_kit: {
    name: "Virtuosity Kit",
    sound: { source: "sample_pack", samplePack: "/samples/virtuosity-kit/manifest.yaml" },
    mix: { gain: 0.86, pan: 0, reverb: 0.12, humanize: 0.008, highpass: 45 },
    kit: {
      kick: { gain: 1 },
      snare: { gain: 0.92 },
      hat: { gain: 0.62 },
      open_hat: { gain: 0.5 },
      rim: { gain: 0.5 },
      perc: { gain: 0.46 }
    },
    pattern: {
      resolution: 16,
      bars: 2,
      repeat: 4,
      start: "1:1",
      swing: 0.1,
      velocity: { default: 0.7, ghost: 0.25, accent: 0.94 },
      lanes: {
        kick: "X . . . . . . . . . x . . . . . x . . . . . . . X . . . . . . .",
        snare: ". . . . X . . g . . . . x . . . . . . . X . . . . . g . . . . .",
        hat: "x . g . x . g . x . g . x . g . x . g . x . g . x . g . x . g ."
      }
    }
  },
  upright_bass: {
    name: "Upright Bass",
    sound: { soundfont: "acoustic_bass" },
    mix: { gain: 0.62, pan: -0.08, reverb: 0.16, humanize: 0.012 },
    notes: [{ time: "1:1", duration: "4n", pitch: "C2", velocity: 0.72 }]
  },
  hybrid_drums: {
    name: "Hybrid Toms",
    sound: { soundfont: "taiko_drum" },
    mix: { gain: 0.62, pan: 0, reverb: 0.28, humanize: 0.01 },
    notes: [{ time: "1:1", duration: "8n", pitch: "C2", velocity: 0.82 }]
  },
  glass_pad: {
    name: "Glass Pad",
    sound: { soundfont: "pad_2_warm", attack: 0.52, release: 2.4 },
    mix: { gain: 0.44, pan: 0.12, reverb: 0.72, humanize: 0.018 },
    notes: [{ time: "1:1", duration: "2m", pitches: ["C3", "G3", "D4"], velocity: 0.42 }]
  },
  analog_lead: {
    name: "Analog Lead",
    sound: { soundfont: "lead_2_sawtooth" },
    mix: { gain: 0.42, pan: 0.14, reverb: 0.24, delay: 0.18, humanize: 0.01 },
    notes: [{ time: "1:1", duration: "8n", pitch: "C4", velocity: 0.66 }]
  },
  electric_piano: {
    name: "Electric Piano",
    sound: { soundfont: "electric_piano_1", attack: 0.008, release: 0.9 },
    mix: { gain: 0.54, pan: 0.1, reverb: 0.38, humanize: 0.016 },
    notes: [{ time: "1:1", duration: "2n", pitches: ["C3", "G3", "E4"], velocity: 0.5, strum: 0.012 }]
  }
};

if (!command || command === "help" || command === "--help") help();
else if (command === "instruments") listInstruments();
else if (command === "new-track") newTrack(args);
else if (command === "check") check(args[0]);
else fail(`Unknown command: ${command}`);

function listInstruments() {
  const rows = Object.entries(instruments).map(([id, spec]) => [
    id,
    spec.name,
    spec.sound.samplePack ?? spec.sound.soundfont,
    spec.pattern ? "pattern" : "notes"
  ]);
  print([
    toon("instruments", ["id", "name", "sound", "starter"], rows),
    "help[2]:",
    "  Run `bun run yaml new-track <song-id> <track-id> <instrument>`",
    "  Run `bun run yaml check <song-id>`"
  ]);
}

function newTrack([songId, trackId, instrument, ...rest]) {
  if (!songId || !trackId || !instrument) {
    fail("Usage: bun run yaml new-track <song-id> <track-id> <instrument> [--force]");
  }
  const spec = instruments[instrument];
  if (!spec) fail(`Unsupported instrument: ${instrument}`);

  const songPath = path.join(songsDir, songId, "song.yaml");
  const trackPath = path.join(songsDir, songId, "tracks", `${trackId}.track.yaml`);
  if (!fs.existsSync(songPath)) fail(`Song not found: ${songId}`);
  if (fs.existsSync(trackPath) && !rest.includes("--force")) {
    fail(`Track already exists: ${shortPath(trackPath)}; pass --force to replace it`);
  }

  const track = orderedTrack(trackId, spec, instrument);
  parseTrackYaml(yaml.dump(track));
  fs.mkdirSync(path.dirname(trackPath), { recursive: true });
  fs.writeFileSync(trackPath, yaml.dump(track, { lineWidth: 120, noRefs: true }), "utf8");
  ensureTrackOrder(songPath, trackId);

  print([
    "created:",
    `  track: ${shortPath(trackPath)}`,
    `  instrument: ${instrument}`,
    `  sound: ${spec.sound.samplePack ?? spec.sound.soundfont}`,
    "help[2]:",
    `  Edit \`${shortPath(trackPath)}\``,
    `  Run \`bun run yaml check ${songId}\``
  ]);
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
    "  Run `bun run yaml instruments`",
    "  Run `bun run check` for musical audit plus build"
  ]);
  process.exitCode = issues.length === 0 ? 0 : 1;
}

function orderedTrack(id, spec, instrument) {
  const track = {
    id,
    name: spec.name,
    instrument,
    sound: spec.sound,
    ...spec.mix
  };
  if (spec.kit) track.kit = spec.kit;
  if (spec.pattern) {
    track.pattern = spec.pattern;
    track.notes = [];
  } else {
    track.notes = spec.notes;
  }
  return track;
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
    "description: Schema-aware helpers for writing valid song and track YAML",
    "commands[4]{name,description}:",
    "  instruments,List legal instruments and starter sounds",
    "  new-track <song-id> <track-id> <instrument>,Create a valid track YAML skeleton and update trackOrder",
    "  check [song-id],Validate song and track YAML with file-local errors",
    "  help,Show this reference",
    "examples[3]:",
    "  bun run yaml instruments",
    "  bun run yaml new-track dusty-loop organ glass_pad",
    "  bun run yaml check dusty-loop"
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
