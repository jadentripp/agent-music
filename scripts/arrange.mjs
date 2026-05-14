import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  compileArrangement,
  compileArrangementYaml,
  generatedHeader,
  serializeSourceMap,
  serializeSong,
  serializeTrack
} from "../src/music/arrangementCompiler.ts";

const root = process.cwd();
const songsDir = path.join(root, "songs");
const [command, songId] = process.argv.slice(2);

if (!command || command === "help" || command === "--help") help();
else if (command === "compile") await compile(songId);
else if (command === "check") await check(songId);
else if (command === "preview") await preview(songId);
else fail(`Unknown command: ${command}`);

async function compile(id) {
  const { arrangementPath, compiled } = await loadCompiled(id);
  const songDir = path.dirname(arrangementPath);
  const tracksDir = path.join(songDir, "tracks");
  fs.mkdirSync(tracksDir, { recursive: true });

  fs.writeFileSync(path.join(songDir, "song.yaml"), serializeSong(compiled.song), "utf8");
  fs.writeFileSync(path.join(songDir, "arrangement.map.json"), serializeSourceMap(compiled.sourceMap), "utf8");
  for (const track of compiled.tracks) {
    fs.writeFileSync(path.join(tracksDir, `${track.id}.track.yaml`), serializeTrack(track), "utf8");
  }

  print([
    "status: ok",
    `song: ${id}`,
    `arrangement: ${shortPath(arrangementPath)}`,
    `generated_tracks: ${compiled.tracks.length}`,
    compiled.warnings.length ? toon("warnings", ["message"], compiled.warnings.map((message) => [message])) : "warnings[0]: none",
    "next[2]:",
    `  bun run arrange check ${id}`,
    "  bun run audit:music"
  ]);
}

async function check(id) {
  const ids = id ? [id] : arrangementSongIds();
  const issues = [];
  let checkedTracks = 0;

  for (const songId of ids) {
    const { arrangementPath, compiled } = await loadCompiled(songId);
    const songDir = path.dirname(arrangementPath);
    const expectedSong = serializeSong(compiled.song);
    compareGenerated(path.join(songDir, "song.yaml"), expectedSong, issues);
    compareGenerated(path.join(songDir, "arrangement.map.json"), serializeSourceMap(compiled.sourceMap), issues);

    const tracksDir = path.join(songDir, "tracks");
    for (const track of compiled.tracks) {
      checkedTracks += 1;
      compareGenerated(path.join(tracksDir, `${track.id}.track.yaml`), serializeTrack(track), issues);
    }

    for (const warning of compiled.warnings) {
      issues.push([shortPath(arrangementPath), `warning: ${warning}`]);
    }
  }

  print([
    `status: ${issues.length === 0 ? "ok" : "error"}`,
    `arrangements_checked: ${ids.length}`,
    `tracks_checked: ${checkedTracks}`,
    issues.length ? toon("issues", ["file", "error"], issues) : "issues[0]: none",
    "help[2]:",
    "  Run `bun run arrange compile <song-id>` to refresh generated YAML",
    "  Run `bun run check` for musical audit plus build"
  ]);
  process.exitCode = issues.length === 0 ? 0 : 1;
}

async function preview(id) {
  if (!id) fail("Usage: bun run arrange preview <song-id> [--section <section-id>] [--solo <track-id>]");
  const args = process.argv.slice(4);
  const sectionId = optionValue(args, "--section");
  const soloTrack = optionValue(args, "--solo");
  const songDir = path.join(songsDir, id);
  const songPath = path.join(songDir, "song.yaml");
  const tracksDir = path.join(songDir, "tracks");
  if (!fs.existsSync(songPath) || !fs.existsSync(tracksDir)) fail(`Missing compiled song output for ${id}; run bun run arrange compile ${id}`);

  const url = new URL("http://localhost:5173/");
  url.searchParams.set("song", id);
  if (sectionId) url.searchParams.set("section", sectionId);
  if (soloTrack) url.searchParams.set("solo", soloTrack);

  print([
    "status: ok",
    `song: ${id}`,
    sectionId ? `section: ${sectionId}` : undefined,
    soloTrack ? `solo: ${soloTrack}` : undefined,
    `url: ${url.href}`,
    "next[1]:",
    "  Open the URL, press Play, and revise the arrangement source if the part does not serve its intent"
  ]);
}

async function loadCompiled(id) {
  if (!id) fail("Usage: bun run arrange <compile|check> <song-id>");
  const songDir = path.join(songsDir, id);
  const tsPath = path.join(songDir, "arrangement.ts");
  const yamlPath = path.join(songDir, "arrangement.yaml");

  if (fs.existsSync(tsPath)) {
    const compiled = compileArrangement(await loadArrangementTs(tsPath));
    return { arrangementPath: tsPath, compiled };
  }

  if (fs.existsSync(yamlPath)) {
    const compiled = compileArrangementYaml(fs.readFileSync(yamlPath, "utf8"));
    return { arrangementPath: yamlPath, compiled };
  }

  fail(`Missing arrangement source: ${shortPath(tsPath)} or ${shortPath(yamlPath)}`);
}

function arrangementSongIds() {
  if (!fs.existsSync(songsDir)) return [];
  return fs
    .readdirSync(songsDir, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isDirectory() &&
        (fs.existsSync(path.join(songsDir, entry.name, "arrangement.ts")) ||
          fs.existsSync(path.join(songsDir, entry.name, "arrangement.yaml")))
    )
    .map((entry) => entry.name)
    .sort();
}

async function loadArrangementTs(file) {
  const url = pathToFileURL(file);
  url.searchParams.set("mtime", String(fs.statSync(file).mtimeMs));
  const module = await import(url.href);
  const arrangement = module.default ?? module.arrangement;
  if (!arrangement) fail(`${shortPath(file)} must export a default arrangement or named arrangement`);
  return arrangement;
}

function compareGenerated(file, expected, issues) {
  if (!fs.existsSync(file)) {
    issues.push([shortPath(file), "missing generated file"]);
    return;
  }
  const actual = fs.readFileSync(file, "utf8");
  if (normalizeGenerated(actual) !== normalizeGenerated(expected)) {
    issues.push([shortPath(file), "stale generated file; rerun arrange compile"]);
  }
}

function normalizeGenerated(source) {
  return source.replace(generatedHeader, "").trimEnd();
}

function optionValue(args, name) {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  return args[index + 1];
}

function help() {
  print([
    "description: Compile high-level arrangement.ts or arrangement.yaml into playable song/track YAML",
    "commands[4]{name,description}:",
    "  compile <song-id>,Generate song.yaml and tracks/*.track.yaml",
    "  check <song-id>,Verify generated YAML and arrangement.map.json are fresh",
    "  preview <song-id>,Print a browser preview URL with optional --section and --solo",
    "  help,Show this reference",
    "examples[3]:",
    "  bun run arrange compile midnight-groove",
    "  bun run arrange check midnight-groove",
    "  bun run arrange preview midnight-groove --section verse2 --solo bass"
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

function print(lines) {
  console.log(lines.filter(Boolean).join("\n"));
}

function fail(error) {
  print([`status: error`, `error: ${error}`, "exit_code: 1", "help[1]:", "  Run `bun run arrange help`"]);
  process.exit(1);
}
