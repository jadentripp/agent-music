import type { GrooveSpec, NoteEvent } from "../types";
import { musicalTimeToBeats } from "./timing";

export type ResolvedGroove = {
  resolution: number;
  offsetsMs: number[];
};

export function resolveGroove(spec: GrooveSpec | undefined): ResolvedGroove | undefined {
  if (!spec) return undefined;
  if (!Array.isArray(spec.offsets) || spec.offsets.length === 0) {
    throw new Error("groove.offsets must be a non-empty array of millisecond offsets per step");
  }
  return {
    resolution: spec.resolution ?? 16,
    offsetsMs: spec.offsets
  };
}

export function applyGroove(notes: NoteEvent[], groove: ResolvedGroove, timeSignature: string): NoteEvent[] {
  const songLike = { timeSignature } as Parameters<typeof musicalTimeToBeats>[1];
  const beatsPerMeasure = Number(timeSignature.split("/")[0] ?? 4);
  const beatsPerStep = beatsPerMeasure / groove.resolution;
  return notes.map((note) => {
    const beat = musicalTimeToBeats(note.time, songLike);
    const step = Math.round(beat / beatsPerStep);
    const slot = ((step % groove.offsetsMs.length) + groove.offsetsMs.length) % groove.offsetsMs.length;
    const grooveSeconds = (groove.offsetsMs[slot] ?? 0) / 1000;
    if (grooveSeconds === 0) return note;
    return {
      ...note,
      offset: clampOffset((note.offset ?? 0) + grooveSeconds)
    };
  });
}

function clampOffset(value: number): number {
  if (value > 0.25) return 0.25;
  if (value < -0.25) return -0.25;
  return value;
}
