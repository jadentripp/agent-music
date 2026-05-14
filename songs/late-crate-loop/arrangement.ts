import {
  chordNote,
  chords,
  customPart,
  defineArrangement,
  drums,
  earCandy,
  groove,
  phrase,
  section
} from "../../src/music/dsl.ts";

const lane = (steps: string[]) => steps.join(" ");

const behindTheNeedle = groove({
  resolution: 16,
  offsets: [0, 28, 50, 8, -4, 24, 56, 12, 0, 30, 48, 10, -8, 34, 62, 16]
});

const crookedDrums = {
  kick: lane([
    "x",
    ".",
    ".",
    "g",
    ".",
    ".",
    "x",
    ".",
    ".",
    ".",
    ".",
    "x",
    ".",
    ".",
    ".",
    ".",
    ".",
    ".",
    "x",
    ".",
    ".",
    "g",
    ".",
    ".",
    "x",
    ".",
    ".",
    ".",
    ".",
    "x",
    ".",
    "."
  ]),
  snare: lane([
    ".",
    ".",
    ".",
    ".",
    "X",
    ".",
    ".",
    ".",
    ".",
    "g",
    ".",
    ".",
    "x",
    ".",
    ".",
    ".",
    ".",
    ".",
    ".",
    ".",
    "X",
    ".",
    ".",
    "g",
    ".",
    ".",
    ".",
    ".",
    "x",
    ".",
    ".",
    "."
  ]),
  clap: lane([
    ".",
    ".",
    ".",
    ".",
    "x",
    ".",
    ".",
    ".",
    ".",
    ".",
    ".",
    ".",
    ".",
    ".",
    ".",
    ".",
    ".",
    ".",
    ".",
    ".",
    "x",
    ".",
    ".",
    ".",
    ".",
    ".",
    ".",
    ".",
    ".",
    ".",
    ".",
    "."
  ]),
  hat: lane([
    ".",
    "g",
    "x",
    ".",
    ".",
    ".",
    "g",
    ".",
    "x",
    ".",
    "X",
    ".",
    ".",
    "g",
    "x",
    ".",
    "x",
    ".",
    ".",
    ".",
    "x",
    "g",
    ".",
    ".",
    "X",
    ".",
    ".",
    "g",
    ".",
    ".",
    "x",
    "."
  ]),
  open_hat: lane([
    ".",
    ".",
    ".",
    ".",
    ".",
    ".",
    ".",
    ".",
    ".",
    ".",
    ".",
    ".",
    ".",
    ".",
    "x",
    ".",
    ".",
    ".",
    ".",
    ".",
    ".",
    ".",
    ".",
    ".",
    ".",
    ".",
    ".",
    ".",
    ".",
    ".",
    "x",
    "."
  ]),
  rim: lane([
    ".",
    ".",
    ".",
    ".",
    ".",
    ".",
    ".",
    "g",
    ".",
    ".",
    ".",
    ".",
    ".",
    ".",
    ".",
    ".",
    ".",
    ".",
    ".",
    "g",
    ".",
    ".",
    ".",
    ".",
    ".",
    ".",
    "g",
    ".",
    ".",
    ".",
    ".",
    "."
  ]),
  perc: lane([
    ".",
    ".",
    "g",
    ".",
    ".",
    ".",
    ".",
    ".",
    ".",
    ".",
    ".",
    "g",
    ".",
    ".",
    ".",
    ".",
    ".",
    ".",
    ".",
    ".",
    ".",
    ".",
    ".",
    ".",
    ".",
    ".",
    ".",
    ".",
    "g",
    ".",
    ".",
    "."
  ])
};

const crateChanges = chords([
  ["1:1", "1m", "Dm9"],
  ["2:1", "1m", "Gm9"],
  ["3:1", "1m", "C9"],
  ["4:1", "1m", "Fmaj9"],
  ["5:1", "1m", "Bbmaj9"],
  ["6:1", "1m", "A7"],
  ["7:1", "1m", "Dm9"],
  ["8:1", "1m", "E7"],
  ["9:1", "1m", "Dm9"],
  ["10:1", "1m", "Gm9"],
  ["11:1", "1m", "C9"],
  ["12:1", "1m", "Fmaj9"],
  ["13:1", "1m", "Bbmaj9"],
  ["14:1", "1m", "A7"],
  ["15:1", "1m", "Dm9"],
  ["16:1", "1m", "A7"],
  ["17:1", "1m", "Dm9"],
  ["18:1", "1m", "Gm9"],
  ["19:1", "1m", "C9"],
  ["20:1", "1m", "Fmaj9"],
  ["21:1", "1m", "Bbmaj9"],
  ["22:1", "1m", "A7"],
  ["23:1", "1m", "Dm9"],
  ["24:1", "1m", "E7"],
  ["25:1", "1m", "Dm9"],
  ["26:1", "1m", "Gm9"],
  ["27:1", "1m", "C9"],
  ["28:1", "1m", "Fmaj9"],
  ["29:1", "1m", "Bbmaj9"],
  ["30:1", "1m", "A7"],
  ["31:1", "1m", "Dm9"],
  ["32:1", "1m", "A7"],
  ["33:1", "4m", "Dm9"]
]);

const chopCell = (measure: number, gain = 1, lift = false) => [
  chordNote(`${measure}:1`, "8n", ["D3", "F3", "C4", "E4", "A4"], { velocity: 0.5 * gain, strum: 0.018 }),
  chordNote(`${measure}:2:480`, "16n", ["F3", "A3", "E4", "G4"], { velocity: 0.34 * gain, strum: 0.012, offset: 0.018 }),
  chordNote(`${measure + 1}:1:240`, "8n", ["G3", "Bb3", "F4", "A4"], { velocity: 0.44 * gain, strum: 0.016, gain: 0.88 }),
  chordNote(`${measure + 1}:3:480`, "16n", ["Bb3", "D4", "F4"], { velocity: 0.3 * gain, strum: 0.01, offset: 0.022 }),
  chordNote(`${measure + 2}:1`, "8n", ["C3", "E3", "Bb3", "D4", "G4"], { velocity: 0.47 * gain, strum: 0.014 }),
  chordNote(`${measure + 2}:4:480`, "16n", lift ? ["E4", "G4", "C5"] : ["E3", "G3", "D4"], {
    velocity: 0.32 * gain,
    strum: 0.012,
    offset: 0.02
  }),
  chordNote(`${measure + 3}:2`, "8n", ["F3", "A3", "E4", "G4", "C5"], { velocity: 0.4 * gain, strum: 0.02, gain: 0.82 }),
  chordNote(`${measure + 3}:4:720`, "16n", lift ? ["A4", "C5", "E5"] : ["A3", "C4", "E4"], {
    velocity: 0.28 * gain,
    strum: 0.014,
    offset: 0.026
  })
];

const pianoChops = [
  ...chopCell(1, 0.62),
  ...chopCell(5, 0.95, true),
  ...chopCell(9, 0.88),
  ...chopCell(13, 0.52, true),
  ...chopCell(17, 1.0, true),
  ...chopCell(21, 0.94),
  ...chopCell(25, 0.82, true),
  ...chopCell(29, 0.48),
  chordNote("32:4:480", "2n", ["D3", "F3", "C4", "E4", "A4"], { velocity: 0.22, strum: 0.08, gain: 0.66 })
];

const subCell = (measure: number, gain = 1) => [
  ...phrase(`${measure}:1`, [
    [0, "4n", "D1", { velocity: 0.72 * gain, articulation: "pluck" }],
    [1.75, "8n", "A1", { velocity: 0.4 * gain, articulation: "pluck", offset: 0.016 }],
    [2.5, "8n", "C2", { velocity: 0.36 * gain, articulation: "pluck", offset: 0.02 }]
  ]),
  ...phrase(`${measure + 1}:1`, [
    [0, "4n", "G1", { velocity: 0.66 * gain, articulation: "pluck" }],
    [2.75, "8n", "Bb1", { velocity: 0.34 * gain, articulation: "pluck", offset: 0.018 }]
  ]),
  ...phrase(`${measure + 2}:1`, [
    [0, "4n", "C2", { velocity: 0.64 * gain, articulation: "pluck" }],
    [3, "8n", "E2", { velocity: 0.3 * gain, articulation: "pluck", offset: 0.012 }]
  ]),
  ...phrase(`${measure + 3}:1`, [
    [0, "4n", "F1", { velocity: 0.56 * gain, articulation: "pluck" }],
    [3.5, "8n", "E1", { velocity: 0.34 * gain, articulation: "pluck", offset: 0.014 }]
  ])
];

const subLine = [
  ...subCell(1, 0.72),
  ...subCell(5, 1.0),
  ...subCell(9, 0.88),
  ...subCell(17, 1.04),
  ...subCell(21, 0.96),
  ...subCell(25, 0.82),
  ...subCell(29, 0.52),
  ...phrase("33:1", [[0, "2m", "D1", { velocity: 0.34, articulation: "sustain", gain: 0.62 }]])
];

const violinStabs = [
  chordNote("4:4:480", "2n", ["A3", "D4", "E4"], { velocity: 0.24, strum: 0.04, gain: 0.72 }),
  chordNote("8:4:480", "2n", ["G#3", "D4", "F4"], { velocity: 0.3, strum: 0.044, gain: 0.8 }),
  chordNote("12:4:480", "2n", ["A3", "C4", "E4"], { velocity: 0.22, strum: 0.042, gain: 0.68 }),
  chordNote("16:4:480", "2n", ["A3", "C#4", "G4"], { velocity: 0.32, strum: 0.05, gain: 0.86 }),
  chordNote("20:4:480", "2n", ["A3", "D4", "E4"], { velocity: 0.34, strum: 0.04, gain: 0.9 }),
  chordNote("24:4:480", "2n", ["G#3", "B3", "E4"], { velocity: 0.3, strum: 0.044, gain: 0.78 }),
  chordNote("28:4:480", "2n", ["A3", "C4", "F4"], { velocity: 0.26, strum: 0.042, gain: 0.74 }),
  chordNote("32:3", "2m", ["D4", "F4", "A4"], { velocity: 0.2, strum: 0.08, gain: 0.62 })
];

const glassHook = [
  ...phrase("6:2:480", [
    [0, "16n", "A5", { velocity: 0.24, articulation: "staccato" }],
    [0.5, "16n", "C6", { velocity: 0.16, articulation: "staccato", offset: 0.016 }],
    [1.25, "8n", "D6", { velocity: 0.28, articulation: "sustain", gain: 0.82 }]
  ]),
  ...phrase("10:2:480", [
    [0, "16n", "A5", { velocity: 0.2, articulation: "staccato" }],
    [0.5, "16n", "C6", { velocity: 0.15, articulation: "staccato", offset: 0.016 }],
    [1.25, "8n", "E6", { velocity: 0.24, articulation: "sustain", gain: 0.76 }]
  ]),
  ...phrase("18:2:480", [
    [0, "16n", "A5", { velocity: 0.28, articulation: "staccato" }],
    [0.5, "16n", "C6", { velocity: 0.18, articulation: "staccato", offset: 0.016 }],
    [1.25, "8n", "D6", { velocity: 0.3, articulation: "sustain", gain: 0.86 }]
  ]),
  ...phrase("22:2:480", [
    [0, "16n", "Bb5", { velocity: 0.22, articulation: "staccato" }],
    [0.5, "16n", "A5", { velocity: 0.16, articulation: "staccato", offset: 0.016 }],
    [1.25, "8n", "E6", { velocity: 0.26, articulation: "sustain", gain: 0.78 }]
  ]),
  ...phrase("30:2:480", [
    [0, "16n", "A5", { velocity: 0.14, articulation: "staccato" }],
    [0.75, "2n", "D6", { velocity: 0.18, articulation: "sustain", gain: 0.6 }]
  ])
];

export default defineArrangement({
  title: "Late Crate Switch",
  artist: "Agent-Written Music Studio",
  tempo: 91,
  tempoMap: [
    { time: "1:1", bpm: 91 },
    { time: "9:1", bpm: 90.4 },
    { time: "17:1", bpm: 91.6 },
    { time: "29:1", bpm: 90.2 }
  ],
  key: "D minor",
  timeSignature: "4/4",
  master: {
    gain: 0.8,
    limiter: true,
    vinyl: 0.28,
    reverbIrSeconds: 1.8,
    reverbIrDecay: 3.4,
    reverbReturnGain: 0.24
  },
  sections: [
    section("intro", "Piano Dust", "1:1", "4m", "aurora", 0.54),
    section("flip", "The Flip", "5:1", "8m", "nebula", 1.06),
    section("strip", "No Rhodes", "13:1", "4m", "tunnel", 0.76),
    section("strings", "Strings In", "17:1", "8m", "nebula", 1.24),
    section("tag", "Stutter Tag", "25:1", "4m", "aurora", 0.94),
    section("outro", "Runout", "29:1", "8m", "cathedral", 0.48)
  ],
  harmony: crateChanges,
  grooves: {
    "behind-the-needle": behindTheNeedle
  },
  parts: [
    drums("drums", "Dusty Cassette Kit")
      .intent("Dryer local dusty-kit drums with clap layer, rim ghosts, and a crooked hat drag.")
      .groove("behind-the-needle")
      .sound({ source: "sample_pack", samplePack: "/samples/dusty-kit/manifest.yaml" })
      .kit({
        kick: { gain: 1.18 },
        snare: { gain: 0.9 },
        clap: { gain: 0.62 },
        hat: { gain: 0.52 },
        open_hat: { gain: 0.44 },
        rim: { gain: 0.46 },
        perc: { gain: 0.4 },
        crash: { gain: 0.34 }
      })
      .pattern({
        resolution: 16,
        bars: 2,
        repeat: 18,
        start: "1:1",
        swing: 0.18,
        velocity: { default: 0.72, ghost: 0.24, accent: 0.94 },
        lanes: crookedDrums
      })
      .hit("1:1", "crash", { duration: "2n", velocity: 0.18, gain: 0.5 })
      .hit("12:4:480", "rim", { duration: "8n", velocity: 0.32, flam: 0.012 })
      .hit("16:4:720", "open_hat", { duration: "8n", velocity: 0.34 })
      .hit("24:4:480", "snare", { duration: "8n", velocity: 0.44, flam: 0.016 })
      .hit("28:4:720", "rim", { duration: "8n", velocity: 0.26 })
      .mix({
        gain: 0.94,
        saturation: 0.38,
        lowpass: 7200,
        highpass: 42,
        eq: { lowGain: 1.7, lowFrequency: 76, midGain: -1.4, midFrequency: 520, highGain: -1.5, highFrequency: 7400 },
        compressor: { threshold: -18, ratio: 3.8, attack: 0.003, release: 0.14, makeupGain: 1.06 }
      })
      .fillIntoSections()
      .humanize(0.014),

    customPart("sub", "custom", "Rubber Mini Sub")
      .instrument("analog_lead")
      .intent("Fallback synth sub replaces the upright bass; short rubber notes answer the kick.")
      .sound({ source: "fallback", attack: 0.004, decay: 0.12, sustain: 0.24, release: 0.14 })
      .notes(subLine)
      .mix({
        gain: 0.54,
        pan: 0,
        highpass: 32,
        lowpass: 520,
        duck: "kick",
        duckAmount: 0.56,
        saturation: 0.24,
        eq: { lowGain: 2.4, lowFrequency: 64, midGain: -2, midFrequency: 320, highGain: -8, highFrequency: 1800 },
        compressor: { threshold: -24, ratio: 3.2, attack: 0.01, release: 0.18, makeupGain: 1.04 },
        automation: {
          gain: [
            { time: "1:1", value: 0.64 },
            { time: "5:1", value: 0.96 },
            { time: "13:1", value: 0.52 },
            { time: "17:1", value: 1.04 },
            { time: "29:1", value: 0.58 }
          ]
        }
      })
      .humanize(0.018),

    customPart("piano", "lead", "Chopped Grand")
      .instrument("grand_piano")
      .intent("Sample-backed grand piano chops act like the sampled record instead of a smooth Rhodes bed.")
      .sound({
        source: "sample_pack",
        samplePack: "/samples/salamander-grand-v8/manifest.yaml",
        soundfont: "acoustic_grand_piano",
        attack: 0.004,
        decay: 0.18,
        sustain: 0.42,
        release: 0.55
      })
      .notes(pianoChops)
      .mix({
        gain: 0.52,
        pan: -0.18,
        reverb: 0.24,
        delay: 0.05,
        delayTime: 0.27,
        delayFeedback: 0.14,
        saturation: 0.22,
        highpass: 120,
        lowpass: 3600,
        duck: "kick",
        duckAmount: 0.36,
        eq: { lowGain: -2.8, lowFrequency: 180, midGain: 1.3, midFrequency: 920, highGain: -1.1, highFrequency: 5200 },
        compressor: { threshold: -23, ratio: 2.4, attack: 0.005, release: 0.18, makeupGain: 1.04 },
        automation: {
          gain: [
            { time: "1:1", value: 0.76 },
            { time: "5:1", value: 1 },
            { time: "13:1", value: 0.58 },
            { time: "17:1", value: 1.08 },
            { time: "25:1", value: 0.9 },
            { time: "29:1", value: 0.48 }
          ],
          filter: [
            { time: "1:1", value: 2900 },
            { time: "5:1", value: 3900 },
            { time: "13:1", value: 1800 },
            { time: "17:1", value: 4300 },
            { time: "29:1", value: 1700 }
          ]
        }
      })
      .humanize(0.022),

    customPart("strings", "counterline", "Tape Violin Stabs")
      .instrument("cinematic_strings")
      .intent("Local VSCO violin section enters as dusty orchestral stabs, not a cello melody.")
      .sound({
        source: "sample_pack",
        samplePack: "/samples/vsco-violin-section-sustain/manifest.yaml",
        soundfont: "string_ensemble_1",
        attack: 0.04,
        decay: 0.28,
        sustain: 0.66,
        release: 1.6
      })
      .notes(violinStabs)
      .mix({
        gain: 0.34,
        pan: 0.42,
        reverb: 0.42,
        highpass: 240,
        lowpass: 4200,
        duck: "kick,snare",
        duckAmount: 0.22,
        eq: { lowGain: -5, lowFrequency: 260, midGain: 1.2, midFrequency: 1120, highGain: -1.8, highFrequency: 6200 },
        automation: {
          gain: [
            { time: "1:1", value: 0.28 },
            { time: "5:1", value: 0.5 },
            { time: "13:1", value: 0.62 },
            { time: "17:1", value: 1 },
            { time: "25:1", value: 0.74 },
            { time: "29:1", value: 0.46 }
          ]
        }
      })
      .humanize(0.02)
      .velocityRamp(0.2, 0.38),

    customPart("bells", "lead", "Bent Glass Hook")
      .instrument("glass_pad")
      .intent("A tiny glass hook replaces the old synth smear and only appears as a sampled-glint response.")
      .sound({ source: "fallback", attack: 0.006, decay: 0.22, sustain: 0.22, release: 0.72 })
      .notes(glassHook)
      .mix({
        gain: 0.16,
        pan: 0.28,
        reverb: 0.48,
        delay: 0.18,
        delayTime: 0.41,
        delayFeedback: 0.28,
        highpass: 780,
        lowpass: 5200,
        duck: "snare",
        duckAmount: 0.16,
        automation: {
          gain: [
            { time: "1:1", value: 0 },
            { time: "5:1", value: 0.8 },
            { time: "13:1", value: 0.36 },
            { time: "17:1", value: 1 },
            { time: "25:1", value: 0.68 },
            { time: "29:1", value: 0.4 }
          ],
          pan: [
            { time: "5:1", value: 0.28 },
            { time: "17:1", value: -0.32 },
            { time: "29:1", value: 0.18 }
          ]
        }
      })
      .humanize(0.018),

    earCandy("dust", "Needle Flecks")
      .intent("Transition flecks only; no constant pad wash.")
      .sections(["flip", "strip", "strings", "tag", "outro"])
      .sound({ source: "fallback", attack: 0.01, decay: 0.2, sustain: 0.14, release: 0.5 })
      .gain(0.11)
      .pan(-0.36)
      .reverb(0.5)
      .delay(0.12, 0.33, 0.22)
      .filter({ highpass: 1200, lowpass: 6400 })
      .duck("snare", 0.14)
      .automate("pan", [
        ["5:1", -0.36],
        ["13:1", 0.38],
        ["17:1", -0.42],
        ["25:1", 0.32],
        ["29:1", -0.2]
      ])
      .humanize(0.018)
      .phrase("4:4:720", [[0, "8n", "D6", { velocity: 0.12, articulation: "staccato", gain: 0.72 }]])
      .phrase("12:4:480", [
        [0, "8n", "F6", { velocity: 0.14, articulation: "staccato" }],
        [0.5, "8n", "A6", { velocity: 0.1, articulation: "staccato" }]
      ])
      .phrase("16:4:720", [[0, "8n", "C6", { velocity: 0.12, articulation: "staccato", gain: 0.7 }]])
      .phrase("24:4:480", [
        [0, "8n", "E6", { velocity: 0.13, articulation: "staccato" }],
        [0.5, "8n", "G6", { velocity: 0.1, articulation: "staccato" }]
      ])
      .phrase("28:4:720", [[0, "4n", "D6", { velocity: 0.1, articulation: "sustain", gain: 0.58 }]])
  ]
});
