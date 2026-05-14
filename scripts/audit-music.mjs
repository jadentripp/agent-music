import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import yaml from "js-yaml";
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
const auditStrict = isTruthy(process.env.AUDIT_STRICT);

function isTruthy(value) {
  return value === "1" || String(value).toLowerCase() === "true" || String(value).toLowerCase() === "yes";
}
const pitchClasses = {
  C: 0,
  "C#": 1,
  Db: 1,
  D: 2,
  "D#": 3,
  Eb: 3,
  E: 4,
  F: 5,
  "F#": 6,
  Gb: 6,
  G: 7,
  "G#": 8,
  Ab: 8,
  A: 9,
  "A#": 10,
  Bb: 10,
  B: 11
};
const classNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const majorScale = [0, 2, 4, 5, 7, 9, 11];
const minorScale = [0, 2, 3, 5, 7, 8, 10];
const defaultSamplePacks = {
  cinematic_strings: "/samples/vsco-violin-section-sustain/manifest.yaml",
  grand_piano: "/samples/salamander-grand-v8/manifest.yaml",
  solo_cello: "/samples/vsco-cello-section-sustain/manifest.yaml",
  drum_kit: "/samples/virtuosity-kit/manifest.yaml"
};
const songIds = fs
  .readdirSync(songsDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

let totalIssues = 0;
let anyFail = false;

for (const songId of songIds) {
  const songPath = path.join(songsDir, songId, "song.yaml");
  const tracksDir = path.join(songsDir, songId, "tracks");
  if (!fs.existsSync(songPath) || !fs.existsSync(tracksDir)) continue;

  const song = readYaml(songPath);
  const tracks = fs
    .readdirSync(tracksDir)
    .filter((file) => file.endsWith(".track.yaml"))
    .sort()
    .map((file) => readYaml(path.join(tracksDir, file)));

  const issues = auditSong(songId, song, tracks);
  issues.push(...(await auditArrangementFreshness(songId)));
  issues.push(...auditSamplePacks(tracks));
  if (issues.some((item) => item.level === "fail")) anyFail = true;
  totalIssues += issues.length;

  console.log(`\n${song.title ?? songId}`);
  if (issues.length === 0) {
    console.log("  ok: arrangement clears the current quality bar");
  } else {
    for (const issue of issues) {
      console.log(`  ${issue.level}: ${issue.message}`);
    }
  }
}

if (anyFail) {
  console.log(`\nMusic audit found failing issue(s) among ${totalIssues} total message(s).`);
  process.exitCode = 1;
} else if (totalIssues > 0) {
  console.log(`\nMusic audit passed with ${totalIssues} warning(s) or note(s).`);
} else {
  console.log("\nMusic audit passed.");
}

function auditSong(songId, song, tracks) {
  const issues = [];
  const measures = Number(String(song.timeSignature ?? "4/4").split("/")[0] ?? 4);
  const keyProfile = parseKey(song.key);
  const songEnd = Math.max(
    ...((song.sections ?? []).map((section) => toBeats(section.start, measures) + toBeats(section.duration, measures))),
    0
  );
  const noteEvents = tracks.flatMap((track) => notesFor(track, song).map((note) => ({ track, note })));
  const pitchedTracks = tracks.filter((track) => track.instrument !== "drum_kit" && track.instrument !== "hybrid_drums");

  const trackIds = new Set(tracks.map((t) => t.id).filter(Boolean));

  if (tracks.length < 3) {
    issues.push({
      level: auditStrict ? "fail" : "warn",
      message: "fewer than three tracks; this will usually sound like a sketch (set AUDIT_STRICT=1 to fail on this)"
    });
  }

  const order = Array.isArray(song.trackOrder) ? song.trackOrder : [];
  if (order.length > 0) {
    for (const id of order) {
      if (!trackIds.has(id)) {
        issues.push({
          level: "warn",
          message: `trackOrder references unknown track id "${id}" (no matching track file id)`
        });
      }
    }
    for (const tid of trackIds) {
      if (!order.includes(tid)) {
        issues.push({
          level: "warn",
          message: `track "${tid}" is missing from trackOrder; playback/mixer order falls back to file sort`
        });
      }
    }
  }

  if (pitchedTracks.length > 0) {
    const firstEightBars = noteEvents.filter(({ note }) => toBeats(note.time, measures) < measures * 8);
    const pitchCounts = countBy(firstEightBars.map(({ note }) => String(note.pitch ?? (note.pitches ?? []).join("-"))));
    const strongestMotif = Math.max(0, ...Object.values(pitchCounts));
    if (strongestMotif < 2) {
      issues.push({ level: "warn", message: "no repeated pitch or chord idea appears in the first eight bars" });
    }

    if (keyProfile) {
      const pitchedNotes = noteEvents.flatMap(({ note }) => pitchesFor(note).filter((pitch) => parsePitch(pitch)));
      const outsideKey = pitchedNotes.filter((pitch) => !keyProfile.classes.has(parsePitch(pitch).className));
      if (pitchedNotes.length >= 8 && outsideKey.length / pitchedNotes.length > 0.24) {
        issues.push({
          level: "warn",
          message: `${outsideKey.length}/${pitchedNotes.length} pitched notes sit outside ${song.key}; add a chord map if those are intentional tensions`
        });
      }
    }
  }

  for (const section of song.sections ?? []) {
    const start = toBeats(section.start, measures);
    const end = start + toBeats(section.duration, measures);
    const activeTracks = tracks.filter((track) => trackActiveInRange(track, start, end, measures, song));
    if (activeTracks.length < 2) {
      issues.push({ level: "warn", message: `${section.id}: fewer than two active tracks in section` });
    }
  }

  const muddyMoments = findMuddyLowClusters(noteEvents, measures);
  if (muddyMoments > 0) {
    issues.push({ level: "warn", message: `${muddyMoments} low-register cluster(s) below C3; likely mud unless deliberately orchestrated` });
  }

  const maskingMoments = findRegisterMasking(noteEvents, measures);
  if (maskingMoments > 0) {
    issues.push({ level: "warn", message: `${maskingMoments} same-register pitched overlap(s); likely masking without EQ or orchestration separation` });
  }

  const staticSectionPairs = findStaticSectionPairs(song, tracks, measures);
  for (const pair of staticSectionPairs) {
    issues.push({ level: "warn", message: `${pair}: adjacent sections have the same active track set and no nearby automation` });
  }

  const weakTransitions = findWeakTransitions(song, tracks, measures);
  for (const sectionId of weakTransitions) {
    issues.push({ level: "warn", message: `${sectionId}: weak transition; no fill, pickup, or automation cue near section start` });
  }

  for (const track of tracks) {
    const notes = notesFor(track, song);
    const velocities = notes.map((note) => note.velocity).filter((value) => typeof value === "number");
    const starts = notes.map((note) => toBeats(note.time, measures));
    const lastStart = Math.max(0, ...starts);

    if (!track.sound?.soundfont && track.sound?.source !== "fallback" && track.instrument !== "drum_kit") {
      issues.push({ level: "warn", message: `${track.id}: missing explicit soundfont, so tone is implicit` });
    }

    if (!track.humanize && !track.groove && !track.pattern?.swing && !notes.some((note) => note.offset || note.strum || note.flam)) {
      issues.push({ level: "warn", message: `${track.id}: no human timing detail` });
    }

    if (velocities.length >= 4 && spread(velocities) < 0.12) {
      issues.push({ level: "warn", message: `${track.id}: velocity range is too flat for phrasing` });
    }

    if (songEnd > 0 && lastStart < songEnd * 0.55 && track.instrument !== "glass_pad") {
      issues.push({ level: "warn", message: `${track.id}: exits early or does not develop through the arrangement` });
    }

    if ((track.reverb ?? 0) > 0.25 && !hasAutomation(track) && notes.length > 8) {
      issues.push({ level: "note", message: `${track.id}: uses space but no automation; consider gain/filter movement` });
    }

    const density = maxSectionDensity(track, notes, song, measures);
    const densityLimit = track.instrument === "drum_kit" || track.instrument === "hybrid_drums" ? 20 : 5.5;
    if (density > densityLimit) {
      issues.push({ level: "warn", message: `${track.id}: over-dense section (${density.toFixed(1)} note starts/measure)` });
    }

    const repeatedRatio = strongestRepetitionRatio(notes);
    if (notes.length >= 12 && repeatedRatio > 0.72 && !hasAutomation(track)) {
      issues.push({ level: "warn", message: `${track.id}: repetitive material dominates without automation or variation` });
    }

    if (track.instrument === "drum_kit" || track.instrument === "hybrid_drums") {
      const drumStarts = notes.map((note) => toBeats(note.time, measures));
      if (drumStarts.length >= 8 && !drumStarts.some((beat) => Math.abs(beat % measures) < 0.01)) {
        issues.push({ level: "warn", message: `${track.id}: no clear downbeat hit across the drum part` });
      }

      if (track.instrument === "drum_kit" && track.sound?.source !== "sample_pack") {
        issues.push({ level: "warn", message: `${track.id}: drum_kit should use a local sample_pack, not GM-style fallback tones` });
      }
    }
  }

  if (songId !== "dusty-loop" && !tracks.some((track) => hasAutomation(track))) {
    issues.push({ level: "warn", message: "no track automation; sections cannot breathe beyond note on/off events" });
  }

  return issues;
}

function readYaml(file) {
  return yaml.load(fs.readFileSync(file, "utf8"));
}

async function auditArrangementFreshness(songId) {
  const songDir = path.join(songsDir, songId);
  const tsPath = path.join(songDir, "arrangement.ts");
  const yamlPath = path.join(songDir, "arrangement.yaml");
  const arrangementPath = fs.existsSync(tsPath) ? tsPath : fs.existsSync(yamlPath) ? yamlPath : undefined;
  if (!arrangementPath) return [];

  try {
    const compiled = arrangementPath.endsWith(".ts")
      ? compileArrangement(await loadArrangementTs(arrangementPath))
      : compileArrangementYaml(fs.readFileSync(arrangementPath, "utf8"));
    const issues = [];
    compareGenerated(path.join(songsDir, songId, "song.yaml"), serializeSong(compiled.song), issues);
    compareGenerated(path.join(songsDir, songId, "arrangement.map.json"), serializeSourceMap(compiled.sourceMap), issues);
    for (const track of compiled.tracks) {
      compareGenerated(path.join(songsDir, songId, "tracks", `${track.id}.track.yaml`), serializeTrack(track), issues);
    }
    for (const warning of compiled.warnings) {
      issues.push({ level: "warn", message: `${path.basename(arrangementPath)}: ${warning}` });
    }
    return issues;
  } catch (error) {
    return [{ level: "fail", message: `${path.basename(arrangementPath)} failed to compile: ${message(error)}` }];
  }
}

async function loadArrangementTs(file) {
  const url = pathToFileURL(file);
  url.searchParams.set("mtime", String(fs.statSync(file).mtimeMs));
  const module = await import(url.href);
  const arrangement = module.default ?? module.arrangement;
  if (!arrangement) throw new Error(`${shortPath(file)} must export a default arrangement or named arrangement`);
  return arrangement;
}

function compareGenerated(file, expected, issues) {
  if (!fs.existsSync(file)) {
    issues.push({ level: "fail", message: `${shortPath(file)} missing generated output` });
    return;
  }
  const actual = fs.readFileSync(file, "utf8");
  if (normalizeGenerated(actual) !== normalizeGenerated(expected)) {
    issues.push({ level: "fail", message: `${shortPath(file)} is stale; run bun run arrange compile` });
  }
}

function normalizeGenerated(source) {
  return source.replace(generatedHeader, "").trimEnd();
}

function auditSamplePacks(tracks) {
  const issues = [];
  const manifests = new Set(
    tracks
      .map((track) => track.sound?.samplePack ?? defaultSamplePacks[track.instrument])
      .filter((samplePack) => typeof samplePack === "string" && samplePack.length > 0)
  );

  for (const manifestPath of manifests) {
    const absoluteManifestPath = path.join(root, "public", manifestPath.replace(/^\//, ""));
    if (!fs.existsSync(absoluteManifestPath)) {
      issues.push({ level: "fail", message: `sample pack missing: ${manifestPath}` });
      continue;
    }

    const manifest = readYaml(absoluteManifestPath);
    const baseDir = path.dirname(absoluteManifestPath);
    const lanes = new Set();
    for (const region of manifest.regions ?? []) {
      if (region.lane) lanes.add(region.lane);
      const samplePath = path.join(baseDir, region.sample ?? "");
      if (!fs.existsSync(samplePath)) {
        issues.push({ level: "fail", message: `${manifestPath}: missing sample ${region.sample}` });
        continue;
      }
      const header = fs.readFileSync(samplePath, { encoding: null, flag: "r" }).subarray(0, 12);
      const isWav = header.toString("ascii", 0, 4) === "RIFF" && header.toString("ascii", 8, 12) === "WAVE";
      const isOgg = header.toString("ascii", 0, 4) === "OggS";
      const isFlac = header.toString("ascii", 0, 4) === "fLaC";
      if (!isWav && !isOgg && !isFlac) {
        issues.push({ level: "fail", message: `${manifestPath}: ${region.sample} is not WAV, OGG, or FLAC` });
      }
    }

    if (manifest.kind === "drum_kit") {
      for (const lane of ["kick", "snare", "hat"]) {
        if (!lanes.has(lane)) {
          issues.push({ level: "warn", message: `${manifestPath}: missing core drum lane ${lane}` });
        }
      }
    }
  }

  return issues;
}

function notesFor(track, song) {
  const measures = Number(String(song.timeSignature ?? "4/4").split("/")[0] ?? 4);
  const tempo = song.tempo ?? 84;
  const notes = Array.isArray(track.notes) ? track.notes : [];
  if (!track.pattern) return notes;

  const pattern = track.pattern;
  const resolution = pattern.resolution ?? 16;
  const bars = pattern.bars ?? 1;
  const repeat = pattern.repeat ?? 1;
  const beatsPerStep = measures / resolution;
  const phraseBeats = beatsPerStep * resolution * bars;
  const startBeat = toBeats(pattern.start ?? "1:1", measures);
  const patternNotes = [];
  const secondsPerStep = (60 / Math.max(1, tempo)) * beatsPerStep;

  for (const [lane, raw] of Object.entries(pattern.lanes ?? {})) {
    const cells = tokenize(raw);
    for (let phrase = 0; phrase < repeat; phrase += 1) {
      cells.forEach((cell, index) => {
        if (/^[.\-_\s~]$/.test(cell)) return;
        patternNotes.push({
          time: startBeat + phrase * phraseBeats + index * beatsPerStep,
          duration: beatsPerStep,
          pitch: lane,
          velocity: cell === "X" || cell === "A" ? 0.95 : cell === "g" ? 0.34 : 0.78,
          offset: pattern.swing && index % 2 === 1 ? pattern.swing * secondsPerStep : undefined
        });
      });
    }
  }

  return [...patternNotes, ...notes];
}

function tokenize(raw) {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return [];
  return /\s/.test(trimmed) ? trimmed.split(/\s+/) : Array.from(trimmed);
}

function pitchesFor(note) {
  if (Array.isArray(note.pitches)) return note.pitches;
  return note.pitch === undefined ? [] : [note.pitch];
}

function trackActiveInRange(track, start, end, measures, song) {
  return notesFor(track, song).some((note) => {
    const noteStart = toBeats(note.time, measures);
    const noteEnd = noteStart + toBeats(note.duration, measures);
    return noteStart < end && noteEnd > start;
  });
}

function findMuddyLowClusters(noteEvents, measures) {
  const byStart = new Map();
  for (const { track, note } of noteEvents) {
    if (track.instrument === "drum_kit" || track.instrument === "hybrid_drums") continue;
    const start = toBeats(note.time, measures).toFixed(3);
    const lowPitches = pitchesFor(note)
      .map(parsePitch)
      .filter((pitch) => pitch && pitch.midi < 48);
    if (lowPitches.length === 0) continue;
    const current = byStart.get(start) ?? new Set();
    current.add(track.id);
    byStart.set(start, current);
  }

  return Array.from(byStart.values()).filter((trackIds) => trackIds.size >= 2).length;
}

function findRegisterMasking(noteEvents, measures) {
  const byStart = new Map();
  for (const { track, note } of noteEvents) {
    if (track.instrument === "drum_kit" || track.instrument === "hybrid_drums") continue;
    const start = toBeats(note.time, measures).toFixed(2);
    const pitches = pitchesFor(note).map(parsePitch).filter(Boolean);
    if (pitches.length === 0) continue;
    const current = byStart.get(start) ?? [];
    for (const pitch of pitches) current.push({ track, midi: pitch.midi });
    byStart.set(start, current);
  }

  let collisions = 0;
  for (const events of byStart.values()) {
    for (let i = 0; i < events.length; i += 1) {
      for (let j = i + 1; j < events.length; j += 1) {
        if (
          events[i].track.id !== events[j].track.id &&
          Math.abs(events[i].midi - events[j].midi) <= 4 &&
          !hasIntentionalSeparation(events[i].track, events[j].track)
        ) {
          collisions += 1;
          i = events.length;
          break;
        }
      }
    }
  }
  return collisions;
}

function hasIntentionalSeparation(left, right) {
  const panGap = Math.abs((left.pan ?? 0) - (right.pan ?? 0));
  const hasToneShaping = left.eq || right.eq || left.highpass || right.highpass || left.lowpass || right.lowpass;
  return Boolean(hasToneShaping && panGap >= 0.16);
}

function findStaticSectionPairs(song, tracks, measures) {
  const sections = song.sections ?? [];
  const pairs = [];
  for (let i = 1; i < sections.length; i += 1) {
    const left = sections[i - 1];
    const right = sections[i];
    const leftTracks = activeTrackIds(left, song, tracks, measures).join("|");
    const rightTracks = activeTrackIds(right, song, tracks, measures).join("|");
    if (leftTracks !== rightTracks) continue;
    const boundaryBeat = toBeats(right.start, measures);
    if (tracks.some((track) => hasAutomationNear(track, boundaryBeat, measures))) continue;
    pairs.push(`${left.id}->${right.id}`);
  }
  return pairs;
}

function activeTrackIds(section, song, tracks, measures) {
  const start = toBeats(section.start, measures);
  const end = start + toBeats(section.duration, measures);
  return tracks
    .filter((track) => trackActiveInRange(track, start, end, measures, song))
    .map((track) => track.id)
    .sort();
}

function findWeakTransitions(song, tracks, measures) {
  return (song.sections ?? [])
    .slice(1)
    .filter((section) => {
      const boundary = toBeats(section.start, measures);
      const hasCue = tracks.some((track) => {
        if (hasAutomationNear(track, boundary, measures)) return true;
        return notesFor(track, song).some((note) => {
          const beat = toBeats(note.time, measures);
          return beat >= boundary - 0.75 && beat <= boundary + 0.25;
        });
      });
      return !hasCue;
    })
    .map((section) => section.id);
}

function hasAutomationNear(track, boundaryBeat, measures) {
  return Object.values(track.automation ?? {}).some((points) =>
    (points ?? []).some((point) => Math.abs(toBeats(point.time, measures) - boundaryBeat) <= 0.25)
  );
}

function maxSectionDensity(track, notes, song, measures) {
  let max = 0;
  for (const section of song.sections ?? []) {
    const start = toBeats(section.start, measures);
    const duration = Math.max(1, toBeats(section.duration, measures));
    const end = start + duration;
    const count = notes.filter((note) => {
      const beat = toBeats(note.time, measures);
      return beat >= start && beat < end;
    }).length;
    max = Math.max(max, count / Math.max(1, duration / measures));
  }
  return max;
}

function strongestRepetitionRatio(notes) {
  if (notes.length === 0) return 0;
  const keys = notes.map((note) => String(note.pitch ?? (note.pitches ?? []).join("-")));
  const counts = countBy(keys);
  return Math.max(...Object.values(counts)) / notes.length;
}

function parseKey(key) {
  const match = String(key ?? "").match(/^([A-G](?:#|b)?)\s+(major|minor)$/i);
  if (!match) return undefined;
  const tonic = pitchClasses[match[1]];
  if (tonic === undefined) return undefined;
  const intervals = match[2].toLowerCase() === "major" ? majorScale : minorScale;
  return {
    tonic,
    classes: new Set(intervals.map((interval) => classNames[(tonic + interval) % 12]))
  };
}

function parsePitch(value) {
  if (typeof value === "number") return undefined;
  const match = String(value).match(/^([A-G](?:#|b)?)(-?\d)$/);
  if (!match) return undefined;
  const classValue = pitchClasses[match[1]];
  if (classValue === undefined) return undefined;
  const octave = Number(match[2]);
  return {
    className: classNames[classValue],
    midi: (octave + 1) * 12 + classValue
  };
}

function hasAutomation(track) {
  const a = track.automation;
  return Boolean(a?.gain?.length || a?.filter?.length || a?.reverb?.length || a?.pan?.length);
}

function countBy(items) {
  return items.reduce((counts, item) => {
    counts[item] = (counts[item] ?? 0) + 1;
    return counts;
  }, {});
}

function spread(values) {
  return Math.max(...values) - Math.min(...values);
}

function toBeats(value, measures) {
  if (typeof value === "number") return value;
  if (typeof value !== "string") return 0;
  if (/^\d+:\d+(:\d+)?$/.test(value)) {
    const [measureText, beatText, tickText] = value.split(":");
    return (Number(measureText) - 1) * measures + (Number(beatText) - 1) + (tickText ? Number(tickText) / 960 : 0);
  }
  const match = value.match(/^(\d+(?:\.\d+)?)(m|n|t)$/);
  if (!match) return 0;
  const amount = Number(match[1]);
  const unit = match[2];
  if (unit === "m") return amount * measures;
  if (unit === "t") return amount / 3;
  return (4 / amount) * measures / 4;
}

function shortPath(file) {
  return path.relative(root, file);
}

function message(error) {
  return error instanceof Error ? error.message.replace(/\n/g, "; ") : String(error);
}
