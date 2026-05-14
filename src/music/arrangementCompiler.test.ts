import { describe, expect, test } from "bun:test";
import yaml from "js-yaml";
import { compileArrangement, compileArrangementYaml, serializeSong, serializeSourceMap, serializeTrack } from "./arrangementCompiler";
import { automationPoints, bass, chords, defineArrangement, drums, groove, harmony, lead, motif, section } from "./dsl";
import { parseTrackYaml } from "./songSchema";

const source = `
title: Compiler Smoke
tempo: 92
key: F minor
timeSignature: 4/4
master: { gain: 0.8, limiter: true, vinyl: 0.12 }
sections:
  - { id: intro, name: Intro, start: 1:1, duration: 4m, scene: aurora, intensity: 0.6 }
  - { id: verse, name: Verse, start: 5:1, duration: 8m, scene: nebula, intensity: 1.0 }
harmony:
  - { time: 1:1, duration: 2m, chord: Fm7 }
  - { time: 3:1, duration: 2m, chord: Dbmaj7 }
  - { time: 5:1, duration: 2m, chord: Abmaj7 }
  - { time: 7:1, duration: 2m, chord: C7 }
motifs:
  hook:
    notes:
      - { degree: 1, duration: 8n, velocity: 0.5 }
      - { degree: 3, duration: 8n, velocity: 0.46 }
      - { degree: 5, duration: 4n, velocity: 0.54 }
grooves:
  pocket:
    resolution: 16
    offsets: [0, 0, 18, 0, 0, 0, 12, 0, 0, 0, 22, 0, 0, 0, 14, 0]
parts:
  - id: drums
    role: drums
    groove: pocket
    pattern:
      resolution: 16
      bars: 1
      repeat: 12
      start: 1:1
      lanes:
        kick:  "x . . . . . x . . . . . x . . ."
        snare: ". . . . X . . . . . . . x . . ."
        hat:   "x . x . x . x . x . x . x . x ."
    mix: { gain: 0.9, highpass: 45 }
  - id: bass
    role: bass
    bassStyle: walking
    mix: { gain: 0.7, duck: kick, duckAmount: 0.5 }
    performance: { velocity: 0.62, octave: -1, humanize: 0.01 }
  - id: keys
    role: harmony
    instrument: electric_piano
    voicing: { range: C3-C6, maxVoices: 4, spread: true }
    mix:
      gain: 0.55
      eq: { lowGain: -2, midGain: 1.4, midFrequency: 1200, highGain: 1 }
      compressor: { threshold: -24, ratio: 2.4, makeupGain: 1.12 }
  - id: lead
    role: lead
    motif: hook
    sections: [verse]
    performance: { velocity: 0.5 }
`;

describe("arrangement compiler", () => {
  test("expands arrangement roles into playable track yaml", () => {
    const compiled = compileArrangementYaml(source);
    expect(compiled.song.trackOrder).toEqual(["drums", "bass", "keys", "lead"]);

    const drums = compiled.tracks.find((track) => track.id === "drums");
    const bass = compiled.tracks.find((track) => track.id === "bass");
    const keys = compiled.tracks.find((track) => track.id === "keys");
    const lead = compiled.tracks.find((track) => track.id === "lead");

    expect(drums?.groove?.offsets.length).toBe(16);
    expect(drums?.role).toBe("drums");
    expect(keys?.role).toBe("harmony");
    expect(drums?.notes.some((note) => note.pitch === "open_hat")).toBe(true);
    expect(bass?.notes.length).toBeGreaterThan(6);
    expect(keys?.notes[0]?.pitches?.length).toBeGreaterThanOrEqual(3);
    expect(keys?.eq?.midGain).toBe(1.4);
    expect(keys?.compressor?.makeupGain).toBe(1.12);
    expect(lead?.notes.every((note) => String(note.time).startsWith("5:") || String(note.time).startsWith("6:"))).toBe(true);
    expect(compiled.sourceMap.tracks.keys.notes[0]?.generator).toBe("harmony");
    expect(compiled.sourceMap.tracks.drums.pattern?.generator).toBe("pattern");
    expect(parseTrackYaml(serializeTrack(keys!)).role).toBe("harmony");
  });

  test("serializes deterministically", () => {
    const left = compileArrangementYaml(source);
    const right = compileArrangementYaml(source);
    const leftDump = [serializeSong(left.song), serializeSourceMap(left.sourceMap), ...left.tracks.map(serializeTrack)].join("\n---\n");
    const rightDump = [serializeSong(right.song), serializeSourceMap(right.sourceMap), ...right.tracks.map(serializeTrack)].join("\n---\n");
    expect(leftDump).toBe(rightDump);
  });

  test("accepts professional track mix schema", () => {
    const track = {
      id: "mix",
      name: "Mix",
      role: "lead",
      instrument: "electric_piano",
      eq: { lowGain: -3, lowFrequency: 140, midGain: 1.5, midFrequency: 950, midQ: 1.2, highGain: 2 },
      compressor: { threshold: -22, knee: 12, ratio: 2.8, attack: 0.005, release: 0.18, makeupGain: 1.08 },
      notes: [{ time: "1:1", duration: "4n", pitch: "C4", velocity: 0.7 }]
    };
    expect(parseTrackYaml(yaml.dump(track)).compressor?.ratio).toBe(2.8);
    expect(parseTrackYaml(yaml.dump(track)).role).toBe("lead");
  });

  test("compiles the TypeScript DSL builders", () => {
    const arrangement = defineArrangement({
      title: "DSL Smoke",
      tempo: 88,
      key: "F minor",
      timeSignature: "4/4",
      sections: [section("a", "A", "1:1", "4m", "aurora", 0.7)],
      harmony: chords([
        ["1:1", "2m", "Fm7"],
        ["3:1", "2m", "Dbmaj7"]
      ]),
      motifs: {
        hook: motif().degree(1, "8n").degree(3, "8n", { step: 1 }).transpose(1).invert(3).sequence(2, 2, 1).thin(2)
      },
      grooves: {
        pocket: groove({ resolution: 16, offsets: [0, 0, 12, 0, 0, 0, 16, 0] })
      },
      parts: [
        drums("drums").groove("pocket").pattern({
          resolution: 16,
          bars: 1,
          repeat: 4,
          lanes: {
            kick: "x . . . . . . . . . x . . . . .",
            snare: ". . . . x . . . . . . . x . . ."
          }
        }),
        bass("bass").intent("Pulse under the kick.").bassStyle("pulse").mix({ compressor: { threshold: -22, ratio: 2 } }).lockToKick(0.5),
        harmony("keys")
          .intent("Sparse mid-register harmony.")
          .voicing({ range: "C3-C6", maxVoices: 4 })
          .drop2()
          .avoidLowThirds("D3", "C6")
          .velocityRamp(0.36, 0.54),
        lead("glint", "Glint")
          .intent("Tiny payoff phrase above the keys.")
          .soundfont("lead_2_sawtooth", { attack: 0.01, release: 0.4 })
          .gain(0.28)
          .pan(0.18)
          .delay(0.12, 0.32, 0.2)
          .filter({ highpass: 320, lowpass: 4200 })
          .duck("kick", 0.2)
          .humanize(0.01)
          .automate("gain", automationPoints(["3:1", 0], ["3:3", 1]))
          .phrase("3:3", [
            [0, "8n", "C5", { velocity: 0.42 }],
            [0.5, "8n", "C#5", { velocity: 0.38 }],
            [1, "4n", "D#5", { velocity: 0.48, gain: 1.05 }]
          ])
      ]
    });

    const compiled = compileArrangement(arrangement);
    expect(compiled.song.trackOrder).toEqual(["drums", "bass", "keys", "glint"]);
    expect(compiled.tracks.find((track) => track.id === "keys")?.notes.length).toBe(2);
    expect(compiled.tracks.find((track) => track.id === "bass")?.duckAmount).toBe(0.5);
    expect(compiled.tracks.find((track) => track.id === "glint")?.notes.map((item) => item.time)).toEqual(["3:3", "3:3:480", "3:4"]);
    expect(compiled.sourceMap.tracks.keys.intent).toContain("Sparse");
  });
});
