import type { GrooveSpec, NoteEvent } from "../types";
import { musicalTimeToBeats } from "./timing";

export type ResolvedGroove = {
  resolution: number;
  offsetsMs: number[];
};

const grooves: Record<string, ResolvedGroove> = {
  "dilla-drag": {
    resolution: 16,
    offsetsMs: [
      0, 0, 22, 0,
      0, 0, 14, 0,
      0, 0, 26, 0,
      0, 0, 18, 0
    ]
  },
  "j-rush": {
    resolution: 16,
    offsetsMs: [
      0, 0, -10, 0,
      0, 0, -6, 0,
      0, 0, -12, 0,
      0, 0, -8, 0
    ]
  },
  "boom-bap": {
    resolution: 16,
    offsetsMs: [
      0, 0, 0, 0,
      6, 0, 0, 0,
      0, 0, 0, 0,
      6, 0, 0, 0
    ]
  },
  "mpc-swing-58": {
    resolution: 16,
    offsetsMs: [
      0, 0, 38, 0,
      0, 0, 38, 0,
      0, 0, 38, 0,
      0, 0, 38, 0
    ]
  }
};

export function resolveGroove(spec: GrooveSpec | undefined): ResolvedGroove | undefined {
  if (!spec) return undefined;
  if (typeof spec === "string") {
    const found = grooves[spec];
    if (!found) {
      throw new Error(`Unknown groove "${spec}". Known: ${Object.keys(grooves).join(", ")}`);
    }
    return found;
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

export const grooveNames = Object.keys(grooves);
