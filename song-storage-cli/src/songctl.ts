#!/usr/bin/env bun
import { Database } from "bun:sqlite";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { load as loadYaml } from "js-yaml";

type SongRow = {
  id: string;
  title: string;
  visibility: string;
  current_version_id: string | null;
  created_at: string;
  updated_at: string;
};

type VersionRow = {
  id: string;
  song_id: string;
  parent_version_id: string | null;
  message: string | null;
  created_by: string | null;
  created_at: string;
};

type FileRow = {
  path: string;
  content: string;
  content_hash: string;
};

const defaultDbPath = path.resolve(process.env.SONG_DB ?? ".data/songs.sqlite");

function now() {
  return new Date().toISOString();
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function hash(content: string) {
  return createHash("sha256").update(content).digest("hex");
}

function shortId(id: string) {
  return id.slice(0, 8);
}

function formatDate(isoDate: string) {
  return isoDate.slice(0, 16).replace("T", " ");
}

function songTemplate(title: string) {
  return `title: ${JSON.stringify(title)}
tempo: 84
key: D minor
timeSignature: 4/4
master:
  gain: 0.82
  limiter: true
sections:
  - id: main
    name: Main
    start: 1:1
    duration: 4m
    scene: aurora
trackOrder:
  - piano
`;
}

function pianoTrackTemplate() {
  return `id: piano
name: Piano
instrument: grand_piano
notes:
  - { time: "1:1", duration: "4n", pitch: "C4", velocity: 0.72 }
`;
}

async function openDb() {
  await mkdir(path.dirname(defaultDbPath), { recursive: true });
  const db = new Database(defaultDbPath);
  db.run("PRAGMA foreign_keys = ON");
  return db;
}

function migrate(db: Database) {
  db.run(`
    CREATE TABLE IF NOT EXISTS songs (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      visibility TEXT NOT NULL DEFAULT 'private',
      current_version_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS song_versions (
      id TEXT PRIMARY KEY,
      song_id TEXT NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
      parent_version_id TEXT REFERENCES song_versions(id),
      message TEXT,
      created_by TEXT,
      created_at TEXT NOT NULL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS song_files (
      version_id TEXT NOT NULL REFERENCES song_versions(id) ON DELETE CASCADE,
      path TEXT NOT NULL,
      content TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      PRIMARY KEY (version_id, path)
    )
  `);

  db.run("CREATE INDEX IF NOT EXISTS idx_song_versions_song_created ON song_versions(song_id, created_at DESC)");
  db.run("CREATE INDEX IF NOT EXISTS idx_song_files_hash ON song_files(content_hash)");
}

async function readSongFolder(folder: string) {
  const root = path.resolve(folder);
  const files: FileRow[] = [];

  async function walk(dir: string) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.name === ".DS_Store" || entry.name.startsWith(".")) continue;

      const absolute = path.join(dir, entry.name);
      const relative = path.relative(root, absolute).split(path.sep).join("/");

      if (entry.isDirectory()) {
        await walk(absolute);
        continue;
      }

      if (!entry.isFile()) continue;
      const content = await readFile(absolute, "utf8");
      files.push({ path: relative, content, content_hash: hash(content) });
    }
  }

  await walk(root);
  files.sort((a, b) => a.path.localeCompare(b.path));
  return files;
}

async function validateSongFolder(folder: string) {
  const root = path.resolve(folder);
  const errors: string[] = [];
  const files = await readSongFolder(root);
  const byPath = new Map(files.map((file) => [file.path, file]));
  const songFile = byPath.get("song.yaml") ?? byPath.get("song.yml");

  if (!songFile) {
    errors.push("Missing song.yaml");
  } else {
    try {
      const song = loadYaml(songFile.content) as Record<string, unknown> | null;
      if (!song || typeof song !== "object" || Array.isArray(song)) {
        errors.push("song.yaml must contain a YAML object");
      } else {
        for (const field of ["title", "tempo", "key", "timeSignature", "master", "sections", "trackOrder"]) {
          if (!(field in song)) errors.push(`song.yaml is missing required field: ${field}`);
        }
        if ("trackOrder" in song && !Array.isArray(song.trackOrder)) {
          errors.push("song.yaml trackOrder must be an array");
        }
        if ("sections" in song && !Array.isArray(song.sections)) {
          errors.push("song.yaml sections must be an array");
        }
      }
    } catch (error) {
      errors.push(`song.yaml is not valid YAML: ${(error as Error).message}`);
    }
  }

  const trackFiles = files.filter((file) => file.path.startsWith("tracks/") && file.path.endsWith(".track.yaml"));
  if (trackFiles.length === 0) errors.push("Missing at least one tracks/*.track.yaml file");

  for (const file of trackFiles) {
    try {
      const track = loadYaml(file.content) as Record<string, unknown> | null;
      if (!track || typeof track !== "object" || Array.isArray(track)) {
        errors.push(`${file.path} must contain a YAML object`);
        continue;
      }
      for (const field of ["id", "name", "instrument", "notes"]) {
        if (!(field in track)) errors.push(`${file.path} is missing required field: ${field}`);
      }
      if ("notes" in track && !Array.isArray(track.notes)) {
        errors.push(`${file.path} notes must be an array`);
      }
    } catch (error) {
      errors.push(`${file.path} is not valid YAML: ${(error as Error).message}`);
    }
  }

  return { files, errors };
}

function readSongTitle(files: FileRow[]) {
  const songFile = files.find((file) => file.path === "song.yaml" || file.path === "song.yml");
  if (!songFile) return null;

  const song = loadYaml(songFile.content) as Record<string, unknown> | null;
  if (!song || typeof song !== "object" || Array.isArray(song)) return null;
  return typeof song.title === "string" && song.title.trim() ? song.title.trim() : null;
}

function getSong(db: Database, songId: string) {
  return db.query("SELECT * FROM songs WHERE id = ?").get(songId) as SongRow | null;
}

function getVersion(db: Database, songId: string, versionId?: string) {
  if (versionId) {
    return db.query("SELECT * FROM song_versions WHERE song_id = ? AND id = ?").get(songId, versionId) as VersionRow | null;
  }

  const song = getSong(db, songId);
  if (!song?.current_version_id) return null;
  return db.query("SELECT * FROM song_versions WHERE id = ?").get(song.current_version_id) as VersionRow | null;
}

function createVersion(db: Database, songId: string, files: FileRow[], options: { message?: string; createdBy?: string }) {
  const song = getSong(db, songId);
  if (!song) throw new Error(`Song not found: ${songId}`);

  const versionId = randomUUID();
  const timestamp = now();

  const insert = db.transaction(() => {
    db.run(
      "INSERT INTO song_versions (id, song_id, parent_version_id, message, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      [versionId, songId, song.current_version_id, options.message ?? null, options.createdBy ?? "songctl", timestamp],
    );

    const insertFile = db.prepare("INSERT INTO song_files (version_id, path, content, content_hash) VALUES (?, ?, ?, ?)");
    for (const file of files) {
      insertFile.run(versionId, file.path, file.content, file.content_hash);
    }

    db.run("UPDATE songs SET current_version_id = ?, updated_at = ? WHERE id = ?", [versionId, timestamp, songId]);
  });

  insert();
  return versionId;
}

async function saveSong(args: string[]) {
  const folder = args[0];
  const requestedSongId = readFlag(args, "--song") ?? readFlag(args, "--id");
  const requestedTitle = readFlag(args, "--title");
  const visibility = readFlag(args, "--visibility") ?? "private";
  const message = readFlag(args, "--message") ?? "Save song";

  if (!folder) die("Usage: songctl save <folder> [--song <song-id>] [--title <title>]");

  const { files, errors } = await validateSongFolder(folder);
  if (errors.length > 0) dieValidation(errors);

  const title = requestedTitle ?? readSongTitle(files);
  const songId = requestedSongId ?? (title ? slugify(title) : undefined);
  if (!songId) die("Could not infer song id. Pass --song <song-id>.");

  const db = await openDb();
  migrate(db);

  let song = getSong(db, songId);
  if (!song) {
    const timestamp = now();
    db.run(
      "INSERT INTO songs (id, title, visibility, current_version_id, created_at, updated_at) VALUES (?, ?, ?, NULL, ?, ?)",
      [songId, title ?? songId, visibility, timestamp, timestamp],
    );
    song = getSong(db, songId);
  }

  const versionId = createVersion(db, songId, files, { message });
  console.log(`Saved ${songId}`);
  console.log(`Version ${versionId}`);
}

async function newSong(args: string[]) {
  const title = args.find((arg) => !arg.startsWith("--"));
  const requestedSongId = readFlag(args, "--song") ?? readFlag(args, "--id");
  const target = readFlag(args, "--folder");
  const visibility = readFlag(args, "--visibility") ?? "private";

  if (!title) die('Usage: songctl new "Song Title" [--song <song-id>] [--folder <folder>]');

  const songId = requestedSongId ?? slugify(title);
  if (!songId) die("Could not infer song id. Pass --song <song-id>.");

  const folder = path.resolve(target ?? path.join("songs", songId));

  try {
    const existing = await stat(folder);
    if (existing) die(`Folder already exists: ${folder}`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  const db = await openDb();
  migrate(db);
  if (getSong(db, songId)) die(`Song already exists: ${songId}`);

  await mkdir(path.join(folder, "tracks"), { recursive: true });
  await writeFile(path.join(folder, "song.yaml"), songTemplate(title), "utf8");
  await writeFile(path.join(folder, "tracks", "piano.track.yaml"), pianoTrackTemplate(), "utf8");

  await saveSong([folder, "--song", songId, "--title", title, "--visibility", visibility, "--message", "Create song"]);
  console.log(folder);
}

async function createSong(args: string[]) {
  const title = readFlag(args, "--title");
  const from = readFlag(args, "--from");
  const requestedId = readFlag(args, "--id");
  const visibility = readFlag(args, "--visibility") ?? "private";
  const message = readFlag(args, "--message") ?? "Initial version";

  if (!title || !from) die("Usage: songctl create --title <title> --from <folder> [--id <song-id>]");

  const { files, errors } = await validateSongFolder(from);
  if (errors.length > 0) dieValidation(errors);

  const db = await openDb();
  migrate(db);

  const songId = requestedId ?? slugify(title);
  const timestamp = now();

  if (getSong(db, songId)) die(`Song already exists: ${songId}`);

  db.run(
    "INSERT INTO songs (id, title, visibility, current_version_id, created_at, updated_at) VALUES (?, ?, ?, NULL, ?, ?)",
    [songId, title, visibility, timestamp, timestamp],
  );

  const versionId = createVersion(db, songId, files, { message });
  console.log(`Created song ${songId}`);
  console.log(`Version ${versionId}`);
}

async function importSong(args: string[]) {
  const folder = args[0];
  const songId = readFlag(args, "--song");
  const message = readFlag(args, "--message") ?? "Update song files";
  if (!folder || !songId) die("Usage: songctl import <folder> --song <song-id> [--message <message>]");

  const { files, errors } = await validateSongFolder(folder);
  if (errors.length > 0) dieValidation(errors);

  const db = await openDb();
  migrate(db);

  const versionId = createVersion(db, songId, files, { message });
  console.log(`Imported ${files.length} files into ${songId}`);
  console.log(`Version ${versionId}`);
}

async function exportSong(args: string[]) {
  const songId = args[0];
  const target = args[1];
  const versionId = readFlag(args, "--version");
  const force = args.includes("--force");
  if (!songId || !target) die("Usage: songctl export <song-id> <target-folder> [--version <version-id>] [--force]");

  const db = await openDb();
  migrate(db);

  const version = getVersion(db, songId, versionId);
  if (!version) die(`Version not found for song ${songId}${versionId ? `: ${versionId}` : ""}`);

  const rows = db.query("SELECT path, content, content_hash FROM song_files WHERE version_id = ? ORDER BY path").all(version.id) as FileRow[];
  const output = path.resolve(target);

  if (force) {
    await rm(output, { recursive: true, force: true });
  } else {
    try {
      const existing = await stat(output);
      if (existing) die(`Target already exists. Use --force to replace: ${output}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }

  for (const file of rows) {
    const destination = path.join(output, file.path);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, file.content, "utf8");
  }

  console.log(`Exported ${rows.length} files from ${songId}`);
  console.log(`Version ${version.id}`);
  console.log(output);
}

async function openSong(args: string[]) {
  const songId = args[0];
  const target = args[1] ?? path.join("work", songId ?? "");
  if (!songId) die("Usage: songctl open <song-id> [target-folder] [--version <version-id>] [--force]");

  const nextArgs = [songId, target, ...args.slice(2)];
  if (!nextArgs.includes("--force")) nextArgs.push("--force");
  await exportSong(nextArgs);
}

async function validateCommand(args: string[]) {
  const folder = args[0];
  if (!folder) die("Usage: songctl validate <folder>");

  const { files, errors } = await validateSongFolder(folder);
  if (errors.length > 0) dieValidation(errors);
  console.log(`Valid song folder: ${path.resolve(folder)}`);
  console.log(`${files.length} files`);
}

async function logSong(args: string[]) {
  const songId = args[0];
  const full = args.includes("--full");
  if (!songId) die("Usage: songctl history <song-id> [--full]");

  const db = await openDb();
  migrate(db);

  const song = getSong(db, songId);
  if (!song) die(`Song not found: ${songId}`);

  const versions = db
    .query("SELECT * FROM song_versions WHERE song_id = ? ORDER BY created_at DESC")
    .all(songId) as VersionRow[];

  console.log(`${song.title} (${song.id})`);
  console.log(`${song.visibility}  ${versions.length === 1 ? "1 version" : `${versions.length} versions`}`);
  for (const version of versions) {
    const marker = version.id === song.current_version_id ? "*" : " ";
    const id = full ? version.id : shortId(version.id);
    console.log(`${marker} ${id}  ${formatDate(version.created_at)}  ${version.message ?? ""}`);
  }
}

async function listSongs() {
  const db = await openDb();
  migrate(db);

  const songs = db
    .query(
      `
        SELECT
          songs.id,
          songs.title,
          songs.visibility,
          songs.current_version_id,
          songs.created_at,
          songs.updated_at,
          COUNT(song_versions.id) AS version_count
        FROM songs
        LEFT JOIN song_versions ON song_versions.song_id = songs.id
        GROUP BY songs.id
        ORDER BY songs.updated_at DESC
      `,
    )
    .all() as Array<SongRow & { version_count: number }>;

  if (songs.length === 0) {
    console.log("No songs yet.");
    return;
  }

  for (const song of songs) {
    const versionLabel = song.version_count === 1 ? "1 version" : `${song.version_count} versions`;
    console.log(`${song.id}  ${song.visibility}  ${versionLabel}  ${song.updated_at}  ${song.title}`);
  }
}

async function diffSong(args: string[]) {
  const songId = args[0];
  const leftVersion = args[1];
  const rightVersion = args[2];
  if (!songId || !leftVersion || !rightVersion) die("Usage: songctl diff <song-id> <from-version-id> <to-version-id>");

  const db = await openDb();
  migrate(db);

  const left = getVersion(db, songId, leftVersion);
  const right = getVersion(db, songId, rightVersion);
  if (!left) die(`Version not found: ${leftVersion}`);
  if (!right) die(`Version not found: ${rightVersion}`);

  const leftFiles = readVersionFiles(db, left.id);
  const rightFiles = readVersionFiles(db, right.id);
  const allPaths = Array.from(new Set([...leftFiles.keys(), ...rightFiles.keys()])).sort();

  for (const filePath of allPaths) {
    const before = leftFiles.get(filePath);
    const after = rightFiles.get(filePath);
    if (!before) {
      console.log(`A ${filePath}`);
    } else if (!after) {
      console.log(`D ${filePath}`);
    } else if (before.content_hash !== after.content_hash) {
      console.log(`M ${filePath}`);
    }
  }
}

function readVersionFiles(db: Database, versionId: string) {
  const rows = db.query("SELECT path, content, content_hash FROM song_files WHERE version_id = ?").all(versionId) as FileRow[];
  return new Map(rows.map((row) => [row.path, row]));
}

function readFlag(args: string[], name: string) {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  return args[index + 1];
}

function die(message: string): never {
  console.error(message);
  process.exit(1);
}

function dieValidation(errors: string[]): never {
  console.error("Invalid song folder:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

function help() {
  console.log(`songctl

Usage:
  songctl new "Song Title"
  songctl list
  songctl save <folder> [--song <song-id>] [--message <message>]
  songctl open <song-id> [target-folder]
  songctl history <song-id>

Less common:
  songctl validate <folder>
  songctl changes <song-id> <from-version-id> <to-version-id>

Database:
  ${defaultDbPath}
`);
}

async function main() {
  const [command, ...args] = process.argv.slice(2);

  if (!command || command === "--help" || command === "-h") {
    help();
    return;
  }

  if (command === "init") {
    const db = await openDb();
    migrate(db);
    console.log(`Initialized ${defaultDbPath}`);
    return;
  }

  if (command === "save") return saveSong(args);
  if (command === "new") return newSong(args);
  if (command === "list") return listSongs();
  if (command === "open") return openSong(args);
  if (command === "history") return logSong(args);
  if (command === "changes") return diffSong(args);
  if (command === "create") return createSong(args);
  if (command === "import") return importSong(args);
  if (command === "export") return exportSong(args);
  if (command === "validate") return validateCommand(args);
  if (command === "log") return logSong(args);
  if (command === "diff") return diffSong(args);

  die(`Unknown command: ${command}`);
}

main().catch((error) => die((error as Error).stack ?? String(error)));
