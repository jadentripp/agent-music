import type { DrumPattern, NoteEvent } from "../types";

const accentChars = new Set(["X", "A"]);
const ghostChars = new Set(["g"]);
const flamChars = new Set(["f"]);
const hitChars = new Set(["x", "o", "*"]);
const restChars = new Set([".", "-", "_", "~"]);

/**
 * @param bpm Song tempo at pattern start (base `song.tempo`; use `SongMeta.tempo` in loader).
 * Off-step swing delay = `swing * (one step duration in seconds)` so feel scales with BPM.
 */
export function expandPattern(
  pattern: DrumPattern,
  beatsPerMeasure: number,
  patternStartBeat: number,
  bpm: number
): NoteEvent[] {
  const resolution = pattern.resolution ?? 16;
  const bars = pattern.bars ?? 1;
  const repeat = pattern.repeat ?? 1;
  const stepsTotal = resolution * bars;
  const beatsPerStep = beatsPerMeasure / resolution;
  const beatsPerPhrase = beatsPerStep * stepsTotal;
  const swing = pattern.swing ?? 0;
  const secondsPerBeat = 60 / Math.max(1, bpm);
  const secondsPerStep = secondsPerBeat * beatsPerStep;

  const defaultVel = pattern.velocity?.default ?? 0.78;
  const accentVel = pattern.velocity?.accent ?? Math.min(1, defaultVel + 0.22);
  const ghostVel = pattern.velocity?.ghost ?? Math.max(0.1, defaultVel * 0.42);

  const events: NoteEvent[] = [];

  for (const [lane, raw] of Object.entries(pattern.lanes)) {
    const cells = tokenize(raw);
    if (cells.length === 0) continue;
    if (cells.length !== stepsTotal) {
      throw new Error(
        `pattern.lanes.${lane}: expected ${stepsTotal} steps for ${bars} bar(s) at resolution ${resolution}, got ${cells.length}`
      );
    }

    cells.forEach((cell, index) => {
      if (restChars.has(cell)) return;

      let velocity = defaultVel;
      let ghost = false;
      let flam: number | undefined;

      if (accentChars.has(cell)) {
        velocity = accentVel;
      } else if (ghostChars.has(cell)) {
        velocity = ghostVel;
        ghost = true;
      } else if (flamChars.has(cell)) {
        velocity = defaultVel;
        flam = 0.025;
      } else if (!hitChars.has(cell)) {
        throw new Error(`pattern.lanes.${lane}: unknown step "${cell}" at position ${index + 1}`);
      }

      const offIsOdd = index % 2 === 1;
      const swingOffsetSeconds = offIsOdd && swing > 0 ? swing * secondsPerStep : 0;

      for (let phrase = 0; phrase < repeat; phrase += 1) {
        const stepStartBeat = patternStartBeat + phrase * beatsPerPhrase + index * beatsPerStep;
        events.push({
          time: stepStartBeat,
          duration: beatsPerStep,
          pitch: lane,
          velocity,
          offset: swingOffsetSeconds,
          ghost: ghost || undefined,
          flam
        });
      }
    });
  }

  return events;
}

function tokenize(raw: string): string[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  if (/\s/.test(trimmed)) {
    return trimmed.split(/\s+/);
  }
  return Array.from(trimmed);
}
