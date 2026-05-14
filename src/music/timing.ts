import type { Section, Song, TempoMapPoint } from "../types";

const pitchOffsets: Record<string, number> = {
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

type TempoPoint = { beat: number; bpm: number };

export function beatsPerMeasure(song: Song): number {
  return Number(song.timeSignature.split("/")[0] ?? 4);
}

export function secondsPerBeat(song: Song, tempoMultiplier = 1): number {
  return 60 / (song.tempo * tempoMultiplier);
}

function sortedTempoMapPoints(song: Song): TempoMapPoint[] {
  return [...(song.tempoMap ?? [])].sort(
    (a, b) => musicalTimeToBeats(a.time, song) - musicalTimeToBeats(b.time, song)
  );
}

/** Internal anchor list: piecewise-constant BPM segments from each point until the next. */
export function buildTempoPoints(song: Song, tempoMultiplier: number): TempoPoint[] {
  const base = song.tempo * tempoMultiplier;
  const points: TempoPoint[] = [{ beat: 0, bpm: base }];
  for (const p of sortedTempoMapPoints(song)) {
    const b = musicalTimeToBeats(p.time, song);
    const bpm = p.bpm * tempoMultiplier;
    if (b <= 0) {
      points[0] = { beat: 0, bpm };
      continue;
    }
    const last = points[points.length - 1];
    if (Math.abs(last.beat - b) < 1e-9) {
      last.bpm = bpm;
    } else {
      points.push({ beat: b, bpm });
    }
  }
  return points;
}

/** Playback time in seconds at absolute beat position `targetBeat` (0 = start). */
export function beatsToSongSeconds(song: Song, targetBeat: number, tempoMultiplier = 1): number {
  if (targetBeat <= 0) return 0;
  const points = buildTempoPoints(song, tempoMultiplier);
  let seconds = 0;
  for (let i = 0; i < points.length; i++) {
    const start = points[i].beat;
    const end = i + 1 < points.length ? points[i + 1].beat : Number.POSITIVE_INFINITY;
    const bpm = points[i].bpm;
    if (targetBeat <= start) break;
    const segEnd = Math.min(targetBeat, end);
    seconds += (segEnd - start) * (60 / bpm);
    if (targetBeat <= end) break;
  }
  return seconds;
}

/** Inverse of `beatsToSongSeconds`: playback seconds → absolute beat. */
export function songSecondsToBeats(song: Song, targetSeconds: number, tempoMultiplier = 1): number {
  if (targetSeconds <= 0) return 0;
  const points = buildTempoPoints(song, tempoMultiplier);
  let t = 0;
  for (let i = 0; i < points.length; i++) {
    const start = points[i].beat;
    const end = i + 1 < points.length ? points[i + 1].beat : Number.POSITIVE_INFINITY;
    const bpm = points[i].bpm;
    const segDurSec = (end - start) * (60 / bpm);
    if (targetSeconds <= t + segDurSec || end === Number.POSITIVE_INFINITY) {
      return start + (targetSeconds - t) * (bpm / 60);
    }
    t += segDurSec;
  }
  const last = points[points.length - 1];
  return last.beat + (targetSeconds - t) * (last.bpm / 60);
}

export function secondsPerBeatAt(song: Song, beat: number, tempoMultiplier = 1): number {
  const points = buildTempoPoints(song, tempoMultiplier);
  for (let i = points.length - 1; i >= 0; i--) {
    if (beat + 1e-9 >= points[i].beat) {
      return 60 / points[i].bpm;
    }
  }
  return 60 / (song.tempo * tempoMultiplier);
}

export function musicalTimeToBeats(value: string | number, song: Song): number {
  if (typeof value === "number") return value;

  const measures = beatsPerMeasure(song);
  if (/^\d+:\d+(:\d+)?$/.test(value)) {
    const [measureText, beatText, tickText] = value.split(":");
    const measure = Number(measureText) - 1;
    const beat = Number(beatText) - 1;
    const tick = tickText ? Number(tickText) / 960 : 0;
    return measure * measures + beat + tick;
  }

  const durationMatch = value.match(/^(\d+(?:\.\d+)?)(m|n|t)$/);
  if (!durationMatch) {
    throw new Error(`Unsupported time value: ${value}`);
  }

  const amount = Number(durationMatch[1]);
  const unit = durationMatch[2];
  if (unit === "m") return amount * measures;
  if (unit === "t") return amount / 3;
  return (4 / amount) * beatsPerMeasure(song) / 4;
}

export function musicalTimeToSeconds(value: string | number, song: Song, tempoMultiplier = 1): number {
  const beats = musicalTimeToBeats(value, song);
  if (!song.tempoMap?.length) {
    return beats * (60 / (song.tempo * tempoMultiplier));
  }
  return beatsToSongSeconds(song, beats, tempoMultiplier);
}

/** Duration in playback seconds for a note starting at `time` with length `duration` (both musical values). */
export function noteDurationSeconds(
  time: string | number,
  duration: string | number,
  song: Song,
  tempoMultiplier = 1
): number {
  const startBeat = musicalTimeToBeats(time, song);
  const lenBeats = musicalTimeToBeats(duration, song);
  const endBeat = startBeat + lenBeats;
  return beatsToSongSeconds(song, endBeat, tempoMultiplier) - beatsToSongSeconds(song, startBeat, tempoMultiplier);
}

export function songDuration(song: Song, tempoMultiplier = 1): number {
  const sectionEnd = Math.max(
    ...song.sections.map(
      (section) => musicalTimeToBeats(section.start, song) + musicalTimeToBeats(section.duration, song)
    )
  );
  const noteEnds = song.tracks.flatMap((track) =>
    track.notes.map((note) => musicalTimeToBeats(note.time, song) + musicalTimeToBeats(note.duration, song))
  );
  const noteEnd = noteEnds.length > 0 ? Math.max(...noteEnds) : 0;
  const endBeat = Math.max(sectionEnd, noteEnd, 0);
  return beatsToSongSeconds(song, endBeat, tempoMultiplier);
}

export function findSectionAt(song: Song, seconds: number, tempoMultiplier = 1): Section {
  const beat = songSecondsToBeats(song, seconds, tempoMultiplier);
  const boundaryEpsilon = 0.00001;
  return (
    song.sections.find((section) => {
      const start = musicalTimeToBeats(section.start, song);
      const end = start + musicalTimeToBeats(section.duration, song);
      return beat >= start - boundaryEpsilon && beat < end - boundaryEpsilon;
    }) ?? song.sections[0]
  );
}

/** Eighth-note swing delay on off-beats (uses local BPM from tempo map when present). */
export function swingOffset(time: string | number, song: Song, swing = 0, tempoMultiplier = 1): number {
  if (!swing || typeof time !== "string" || !/^\d+:\d+(:\d+)?$/.test(time)) return 0;
  const beat = musicalTimeToBeats(time, song);
  const spb = secondsPerBeatAt(song, beat, tempoMultiplier);
  return Math.round(beat * 2) % 2 === 1 ? swing * spb : 0;
}

export function noteToFrequency(pitch: string | number): number {
  if (typeof pitch === "number") return pitch;

  const match = pitch.match(/^([A-G](?:#|b)?)(-?\d)$/);
  if (!match) {
    throw new Error(`Unsupported pitch: ${pitch}`);
  }

  const [, note, octaveText] = match;
  const octave = Number(octaveText);
  const midi = (octave + 1) * 12 + pitchOffsets[note];
  return 440 * Math.pow(2, (midi - 69) / 12);
}
