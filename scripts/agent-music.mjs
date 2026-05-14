import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import yaml from "js-yaml";

const root = process.cwd();
const songsDir = path.join(root, "songs");
const [command, songId, ...args] = process.argv.slice(2);

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

if (!command || command === "help" || command === "--help") help();
else if (command === "check") await check(songId);
else if (command === "analyze") await analyze(songId);
else if (command === "suggest") await suggest(songId, args);
else fail(`Unknown command: ${command}`);

async function check(id) {
  if (!id) fail("Usage: bun run agent:music check <song-id>");
  const arrange = runBun(["scripts/arrange.mjs", "check", id]);
  const audit = runBun(["scripts/audit-music.mjs"]);
  const report = loadReport(id);
  const diagnostics = diagnose(report);
  const failing = arrange.status !== 0 || audit.status !== 0 || diagnostics.some((item) => item.level === "fail");

  print([
    `status: ${failing ? "error" : "ok"}`,
    `song: ${id}`,
    block("arrange_check", arrange.output),
    block("music_audit", audit.output),
    featureTable(report),
    diagnosticTable(diagnostics),
    "next[4]:",
    arrange.status === 0 ? `  bun run arrange preview ${id} --section ${report.song.sections?.[1]?.id ?? report.song.sections?.[0]?.id ?? "intro"}` : `  bun run arrange compile ${id}`,
    `  bun run agent:music suggest ${id}`,
    `  Open the preview URL, solo one role, and revise arrangement.ts intent or transforms`,
    `  Re-run bun run agent:music check ${id}`
  ]);
  process.exitCode = failing ? 1 : 0;
}

async function analyze(id) {
  if (!id) fail("Usage: bun run agent:music analyze <song-id>");
  const report = loadReport(id);
  print([`status: ok`, `song: ${id}`, featureTable(report), sectionTable(report), trackTable(report)]);
}

async function suggest(id, suggestArgs) {
  if (!id) fail("Usage: bun run agent:music suggest <song-id> [--issue masking|density|transition|velocity|mix|intent]");
  const issue = optionValue(suggestArgs, "--issue") ?? suggestArgs[0];
  const report = loadReport(id);
  const diagnostics = diagnose(report).filter((item) => !issue || item.category === issue);
  print([
    `status: ${diagnostics.length ? "ok" : "empty"}`,
    `song: ${id}`,
    issue ? `issue: ${issue}` : undefined,
    diagnosticTable(diagnostics),
    diagnostics.length
      ? "apply[1]:\n  Patch arrangement.ts at the named part, then run bun run arrange compile and bun run agent:music check"
      : "apply[1]:\n  No matching suggestion found for that issue"
  ]);
}

function loadReport(id) {
  const songDir = path.join(songsDir, id);
  const songPath = path.join(songDir, "song.yaml");
  const tracksDir = path.join(songDir, "tracks");
  const mapPath = path.join(songDir, "arrangement.map.json");
  if (!fs.existsSync(songPath)) fail(`Missing ${shortPath(songPath)}; run bun run arrange compile ${id}`);
  if (!fs.existsSync(tracksDir)) fail(`Missing ${shortPath(tracksDir)}; run bun run arrange compile ${id}`);

  const song = readYaml(songPath);
  const tracks = fs
    .readdirSync(tracksDir)
    .filter((file) => file.endsWith(".track.yaml"))
    .sort()
    .map((file) => readYaml(path.join(tracksDir, file)));
  const sourceMap = fs.existsSync(mapPath) ? JSON.parse(fs.readFileSync(mapPath, "utf8")) : undefined;
  const measures = Number(String(song.timeSignature ?? "4/4").split("/")[0] ?? 4);
  const entries = tracks.flatMap((track) => noteEntries(track, song, sourceMap));
  const sections = summarizeSections(song, tracks, entries, measures);
  const trackSummaries = tracks.map((track) => summarizeTrack(track, song, entries, measures, sourceMap));
  const overlaps = findMasking(entries, measures);
  const transitions = findTransitions(song, entries, tracks, measures);
  const width = tracks.length ? average(tracks.map((track) => Math.abs(track.pan ?? 0))) : 0;
  const peakStarts = peakStartDensity(entries, measures);
  const lowEndEvents = entries.filter((entry) => pitchesFor(entry.note).some((pitch) => (parsePitch(pitch)?.midi ?? 999) < 48)).length;

  return { id, song, tracks, sourceMap, measures, entries, sections, trackSummaries, overlaps, transitions, width, peakStarts, lowEndEvents };
}

function diagnose(report) {
  const diagnostics = [];

  if (!report.sourceMap) {
    diagnostics.push({
      level: "warn",
      category: "source_map",
      source: "arrangement.map.json",
      message: "Missing arrangement source map, so diagnostics cannot point back to generated parts.",
      suggestion: `bun run arrange compile ${report.id}`
    });
  }

  for (const summary of report.trackSummaries) {
    if (!summary.intent) {
      diagnostics.push({
        level: "warn",
        category: "intent",
        source: sourceLabel(summary),
        message: "Part has no intent text for agents to preserve while revising.",
        suggestion: `.intent("Describe the part role, register, energy, and what it should avoid.")`
      });
    }

    if (summary.velocityCount >= 4 && summary.velocitySpread < 0.12) {
      diagnostics.push({
        level: "warn",
        category: "velocity",
        source: sourceLabel(summary),
        message: `Velocity spread is only ${summary.velocitySpread.toFixed(2)}, which will feel flat.`,
        suggestion: `.performance({ velocityRamp: [${Math.max(0.2, summary.velocityAverage - 0.12).toFixed(2)}, ${Math.min(0.9, summary.velocityAverage + 0.12).toFixed(2)}] })`
      });
    }

    if (summary.maxDensity > summary.densityLimit) {
      diagnostics.push({
        level: "warn",
        category: "density",
        source: sourceLabel(summary),
        message: `Peak density is ${summary.maxDensity.toFixed(1)} starts/measure; the part may be crowding the arrangement.`,
        suggestion: summary.role === "lead" || summary.role === "counterline" ? `Use motif().thin(2) or limit .sections([...])` : `Shorten active sections or remove every other event in the busy section`
      });
    }

    if ((summary.lowMidi ?? 999) < 48 && summary.role !== "bass" && summary.role !== "drums") {
      diagnostics.push({
        level: "warn",
        category: "masking",
        source: sourceLabel(summary),
        message: "Non-bass part reaches below C3, which can mask bass and kick.",
        suggestion: `.avoidLowThirds("C3", "C6").mix({ highpass: ${summary.role === "harmony" ? 140 : 220} })`
      });
    }

    if (summary.role !== "drums" && summary.noteCount > 0 && !summary.hasMixMovement && (summary.reverb ?? 0) > 0.25) {
      diagnostics.push({
        level: "note",
        category: "mix",
        source: sourceLabel(summary),
        message: "Wet part has no gain/filter/reverb/pan automation, so section energy may feel static.",
        suggestion: `.mix({ automation: { gain: [{ time: "1:1", value: 0.75 }, { time: "9:1", value: 1.0 }] } })`
      });
    }
  }

  for (const overlap of report.overlaps.slice(0, 6)) {
    diagnostics.push({
      level: "warn",
      category: "masking",
      source: `${sourceLabel(overlap.left)} + ${sourceLabel(overlap.right)}`,
      message: `Same-register overlap near ${overlap.time} within ${overlap.distance} semitones.`,
      suggestion: `Move one part with .avoidLowThirds(), narrower .sections([...]), pan separation, or complementary EQ`
    });
  }

  for (const transition of report.transitions.filter((item) => !item.hasCue)) {
    diagnostics.push({
      level: "warn",
      category: "transition",
      source: `section:${transition.section}`,
      message: "Section boundary has no nearby fill, pickup, or automation cue.",
      suggestion: `Add .fillIntoSections() on drums or an earCandy(...) part scoped before ${transition.section}`
    });
  }

  if (report.width < 0.12 && report.tracks.length >= 3) {
    diagnostics.push({
      level: "note",
      category: "mix",
      source: "mix",
      message: `Average pan width is ${report.width.toFixed(2)}; everything is close to center.`,
      suggestion: `Pan harmony/texture/counterline apart while keeping bass, kick, snare centered`
    });
  }

  return diagnostics;
}

function summarizeTrack(track, song, entries, measures, sourceMap) {
  const trackEntries = entries.filter((entry) => entry.track.id === track.id);
  const noteEntriesOnly = trackEntries.filter((entry) => !entry.fromPattern);
  const velocities = trackEntries.map((entry) => entry.note.velocity).filter((value) => typeof value === "number");
  const parsedPitches = trackEntries.flatMap((entry) => pitchesFor(entry.note).map(parsePitch).filter(Boolean));
  const source = sourceMap?.tracks?.[track.id];
  const maxDensity = maxSectionDensity(trackEntries, song, measures);
  const role = source?.role ?? inferRole(track);

  return {
    id: track.id,
    role,
    intent: source?.intent,
    noteCount: trackEntries.length,
    generatedNoteCount: noteEntriesOnly.length,
    maxDensity,
    densityLimit: role === "drums" ? 22 : role === "bass" ? 7 : 5.5,
    velocityCount: velocities.length,
    velocitySpread: velocities.length ? spread(velocities) : 0,
    velocityAverage: velocities.length ? average(velocities) : 0.5,
    lowMidi: parsedPitches.length ? Math.min(...parsedPitches.map((pitch) => pitch.midi)) : undefined,
    highMidi: parsedPitches.length ? Math.max(...parsedPitches.map((pitch) => pitch.midi)) : undefined,
    pan: track.pan ?? 0,
    reverb: track.reverb ?? 0,
    hasMixMovement: hasAutomation(track),
    source
  };
}

function summarizeSections(song, tracks, entries, measures) {
  return (song.sections ?? []).map((section) => {
    const start = toBeats(section.start, measures);
    const end = start + toBeats(section.duration, measures);
    const active = tracks.filter((track) =>
      entries.some((entry) => entry.track.id === track.id && entryStart(entry, measures) >= start && entryStart(entry, measures) < end)
    );
    const density = active.length
      ? entries.filter((entry) => entryStart(entry, measures) >= start && entryStart(entry, measures) < end).length / Math.max(1, (end - start) / measures)
      : 0;
    return {
      id: section.id,
      name: section.name,
      activeTracks: active.map((track) => track.id),
      density
    };
  });
}

function findMasking(entries, measures) {
  const pitched = entries.flatMap((entry) =>
    pitchesFor(entry.note)
      .map(parsePitch)
      .filter(Boolean)
      .map((pitch) => ({ ...entry, pitch }))
  );
  const overlaps = [];
  for (let i = 0; i < pitched.length; i += 1) {
    for (let j = i + 1; j < pitched.length; j += 1) {
      const left = pitched[i];
      const right = pitched[j];
      if (left.track.id === right.track.id) continue;
      if (Math.abs(entryStart(left, measures) - entryStart(right, measures)) > 0.05) continue;
      const distance = Math.abs(left.pitch.midi - right.pitch.midi);
      if (distance > 4) continue;
      if (hasIntentionalSeparation(left.track, right.track)) continue;
      overlaps.push({
        time: String(left.note.time),
        distance,
        left: sourceSummary(left),
        right: sourceSummary(right)
      });
    }
  }
  return overlaps;
}

function findTransitions(song, entries, tracks, measures) {
  return (song.sections ?? []).slice(1).map((section) => {
    const boundary = toBeats(section.start, measures);
    const hasCue =
      tracks.some((track) => hasAutomationNear(track, boundary, measures)) ||
      entries.some((entry) => {
        const beat = entryStart(entry, measures);
        return beat >= boundary - 0.75 && beat <= boundary + 0.25;
      });
    return { section: section.id, hasCue };
  });
}

function noteEntries(track, song, sourceMap) {
  const measures = Number(String(song.timeSignature ?? "4/4").split("/")[0] ?? 4);
  const entries = [];
  const sourceTrack = sourceMap?.tracks?.[track.id];
  if (track.pattern) {
    const pattern = track.pattern;
    const resolution = pattern.resolution ?? 16;
    const bars = pattern.bars ?? 1;
    const repeat = pattern.repeat ?? 1;
    const beatsPerStep = measures / resolution;
    const phraseBeats = beatsPerStep * resolution * bars;
    const startBeat = toBeats(pattern.start ?? "1:1", measures);
    for (const [lane, raw] of Object.entries(pattern.lanes ?? {})) {
      const cells = tokenize(raw);
      for (let phrase = 0; phrase < repeat; phrase += 1) {
        cells.forEach((cell, index) => {
          if (/^[.\-_\s~]$/.test(cell)) return;
          entries.push({
            track,
            fromPattern: true,
            source: sourceTrack?.pattern,
            note: {
              time: startBeat + phrase * phraseBeats + index * beatsPerStep,
              duration: beatsPerStep,
              pitch: lane,
              velocity: cell === "X" || cell === "A" ? 0.95 : cell === "g" ? 0.34 : 0.78
            }
          });
        });
      }
    }
  }

  for (const [index, note] of (track.notes ?? []).entries()) {
    entries.push({
      track,
      fromPattern: false,
      source: sourceTrack?.notes?.[index],
      note
    });
  }
  return entries;
}

function featureTable(report) {
  const metrics = [
    ["tracks", report.tracks.length],
    ["sections", report.song.sections?.length ?? 0],
    ["events", report.entries.length],
    ["peak_start_density", report.peakStarts.toFixed(1)],
    ["low_end_events", report.lowEndEvents],
    ["masking_overlaps", report.overlaps.length],
    ["average_pan_width", report.width.toFixed(2)],
    ["weak_transitions", report.transitions.filter((item) => !item.hasCue).length]
  ];
  return toon("score_features", ["metric", "value"], metrics);
}

function sectionTable(report) {
  return toon(
    "sections",
    ["id", "active_tracks", "density"],
    report.sections.map((section) => [section.id, section.activeTracks.join("|") || "none", section.density.toFixed(1)])
  );
}

function trackTable(report) {
  return toon(
    "tracks",
    ["id", "role", "notes", "density", "velocity_spread", "range", "intent"],
    report.trackSummaries.map((track) => [
      track.id,
      track.role,
      track.noteCount,
      track.maxDensity.toFixed(1),
      track.velocitySpread.toFixed(2),
      track.lowMidi === undefined ? "" : `${midiToPitch(track.lowMidi)}-${midiToPitch(track.highMidi)}`,
      track.intent ? "yes" : "missing"
    ])
  );
}

function diagnosticTable(diagnostics) {
  return diagnostics.length
    ? toon(
        "diagnostics",
        ["level", "category", "source", "message", "suggestion"],
        diagnostics.map((item) => [item.level, item.category, item.source, item.message, item.suggestion])
      )
    : "diagnostics[0]: none";
}

function sourceSummary(entry) {
  const source = entry.source;
  return {
    id: entry.track.id,
    role: source?.role ?? inferRole(entry.track),
    intent: source?.intent,
    source
  };
}

function sourceLabel(summary) {
  const source = summary.source;
  if (!source) return `track:${summary.id}`;
  const bits = [`part:${source.part ?? summary.id}`, `role:${source.role ?? summary.role}`];
  if (source.generator) bits.push(`generator:${source.generator}`);
  if (source.section) bits.push(`section:${source.section}`);
  return bits.join(" ");
}

function inferRole(track) {
  if (track.instrument === "drum_kit" || track.instrument === "hybrid_drums") return "drums";
  if (track.instrument === "upright_bass") return "bass";
  if (track.instrument === "glass_pad") return "pad";
  if (track.instrument === "solo_cello" || track.instrument === "analog_lead") return "lead";
  return "custom";
}

function maxSectionDensity(entries, song, measures) {
  let max = 0;
  for (const section of song.sections ?? []) {
    const start = toBeats(section.start, measures);
    const duration = Math.max(1, toBeats(section.duration, measures));
    const end = start + duration;
    const count = entries.filter((entry) => {
      const beat = entryStart(entry, measures);
      return beat >= start && beat < end;
    }).length;
    max = Math.max(max, count / Math.max(1, duration / measures));
  }
  return max;
}

function peakStartDensity(entries, measures) {
  const buckets = new Map();
  for (const entry of entries) {
    const bucket = Math.floor(entryStart(entry, measures) * 4) / 4;
    buckets.set(bucket, (buckets.get(bucket) ?? 0) + 1);
  }
  return Math.max(0, ...buckets.values());
}

function hasIntentionalSeparation(left, right) {
  const panGap = Math.abs((left.pan ?? 0) - (right.pan ?? 0));
  const toneShaping = left.eq || right.eq || left.highpass || right.highpass || left.lowpass || right.lowpass;
  return Boolean(toneShaping && panGap >= 0.16);
}

function hasAutomationNear(track, boundaryBeat, measures) {
  return Object.values(track.automation ?? {}).some((points) =>
    (points ?? []).some((point) => Math.abs(toBeats(point.time, measures) - boundaryBeat) <= 0.25)
  );
}

function hasAutomation(track) {
  const a = track.automation;
  return Boolean(a?.gain?.length || a?.filter?.length || a?.reverb?.length || a?.pan?.length);
}

function pitchesFor(note) {
  if (Array.isArray(note.pitches)) return note.pitches;
  return note.pitch === undefined ? [] : [note.pitch];
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

function midiToPitch(midi) {
  const pc = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;
  return `${classNames[pc]}${octave}`;
}

function entryStart(entry, measures) {
  return toBeats(entry.note.time, measures);
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

function tokenize(raw) {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return [];
  return /\s/.test(trimmed) ? trimmed.split(/\s+/) : Array.from(trimmed);
}

function spread(values) {
  return Math.max(...values) - Math.min(...values);
}

function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function readYaml(file) {
  return yaml.load(fs.readFileSync(file, "utf8"));
}

function optionValue(values, name) {
  const index = values.indexOf(name);
  return index === -1 ? undefined : values[index + 1];
}

function runBun(args) {
  const result = spawnSync("bun", args, { cwd: root, encoding: "utf8" });
  return {
    status: result.status ?? 1,
    output: [result.stdout, result.stderr].filter(Boolean).join("\n").trim()
  };
}

function block(name, content) {
  const lines = String(content || "").split("\n").filter(Boolean);
  if (!lines.length) return `${name}[0]: none`;
  return [`${name}[${lines.length}]:`, ...lines.map((line) => `  ${line}`)].join("\n");
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

function help() {
  print([
    "description: Agent compose loop for professional arrangement diagnostics and patch suggestions",
    "commands[4]{name,description}:",
    "  check <song-id>,Run arrange freshness plus score analysis and next actions",
    "  analyze <song-id>,Print section/track/music feature analysis",
    "  suggest <song-id>,Print patch-oriented arrangement suggestions",
    "  help,Show this reference",
    "examples[4]:",
    "  bun run agent:music check midnight-groove",
    "  bun run agent:music analyze midnight-groove",
    "  bun run agent:music suggest midnight-groove",
    "  bun run agent:music suggest midnight-groove --issue masking"
  ]);
}

function fail(error) {
  print([`status: error`, `error: ${error}`, "exit_code: 1", "help[1]:", "  Run `bun run agent:music help`"]);
  process.exit(1);
}
