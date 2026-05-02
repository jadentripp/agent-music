import type { Section, Song } from "../types";

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

export function beatsPerMeasure(song: Song): number {
  return Number(song.timeSignature.split("/")[0] ?? 4);
}

export function secondsPerBeat(song: Song, tempoMultiplier = 1): number {
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
  return musicalTimeToBeats(value, song) * secondsPerBeat(song, tempoMultiplier);
}

export function songDuration(song: Song): number {
  const sectionEnd = Math.max(
    ...song.sections.map(
      (section) => musicalTimeToBeats(section.start, song) + musicalTimeToBeats(section.duration, song)
    )
  );
  const noteEnd = Math.max(
    ...song.tracks.flatMap((track) =>
      track.notes.map((note) => musicalTimeToBeats(note.time, song) + musicalTimeToBeats(note.duration, song))
    )
  );
  return Math.max(sectionEnd, noteEnd) * secondsPerBeat(song);
}

export function findSectionAt(song: Song, seconds: number): Section {
  const beat = seconds / secondsPerBeat(song);
  return (
    song.sections.find((section) => {
      const start = musicalTimeToBeats(section.start, song);
      const end = start + musicalTimeToBeats(section.duration, song);
      return beat >= start && beat < end;
    }) ?? song.sections[0]
  );
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
