import {
  bass,
  chords,
  counterline,
  defineArrangement,
  drums,
  earCandy,
  groove,
  harmony,
  lead,
  motif,
  section
} from "../../src/music/dsl.ts";

const lateHatPocket = groove({
  resolution: 16,
  offsets: [0, 0, 22, 0, 0, 0, 14, 0, 0, 0, 26, 0, 0, 0, 18, 0]
});

const chordCycle = chords([
  ["1:1", "2m", "Fm7"],
  ["3:1", "2m", "Fm7"],
  ["5:1", "2m", "Abmaj7"],
  ["7:1", "2m", "Dbmaj7"],
  ["9:1", "2m", "Abmaj7"],
  ["11:1", "1m", "Dbmaj7"],
  ["12:1", "1m", "C7"],
  ["13:1", "1m", "Dbmaj7"],
  ["14:1", "1m", "C7"],
  ["15:1", "1m", "Fm7"],
  ["16:1", "1m", "Bb13"],
  ["17:1", "1m", "Dbmaj7"],
  ["18:1", "1m", "C7"],
  ["19:1", "1m", "Fm7"],
  ["20:1", "1m", "C7"],
  ["21:1", "2m", "Abmaj7"],
  ["23:1", "2m", "Dbmaj7"],
  ["25:1", "2m", "Abmaj7"],
  ["27:1", "2m", "Dbmaj7"],
  ["29:1", "1m", "Abmaj7"],
  ["30:1", "1m", "Eb7"],
  ["31:1", "1m", "Dbmaj7"],
  ["32:1", "1m", "C7"],
  ["33:1", "4m", "Fm7"]
]);

const celloAnswer = motif()
  .degree(1, "2n", { velocity: 0.44, articulation: "sustain" })
  .degree(2, "4n", { step: 2, velocity: 0.38, articulation: "legato" })
  .degree(3, "2n", { step: 3, velocity: 0.48, articulation: "sustain" })
  .degree(5, "4n", { step: 5, velocity: 0.42, articulation: "legato" });

export default defineArrangement({
  title: "Midnight Groove",
  tempo: 88,
  key: "F minor",
  timeSignature: "4/4",
  master: {
    gain: 0.78,
    limiter: true,
    vinyl: 0.2,
    reverbIrSeconds: 2.6,
    reverbIrDecay: 2.8,
    reverbReturnGain: 0.36
  },
  sections: [
    section("intro", "Tape Intro", "1:1", "4m", "aurora", 0.6),
    section("verse1", "Verse 1", "5:1", "8m", "nebula", 1.0),
    section("breakdown", "Solar Shift", "13:1", "8m", "aurora", 0.8),
    section("verse2", "Verse 2", "21:1", "8m", "nebula", 1.2),
    section("outro", "Sunset Outro", "29:1", "8m", "cathedral", 0.5)
  ],
  harmony: chordCycle,
  motifs: {
    "cello-answer": celloAnswer.sequence(2, 6, 1)
  },
  grooves: {
    "late-hat-pocket": lateHatPocket
  },
  parts: [
    drums("drums", "Dusty Kit")
      .intent("Dusty backbeat with late hats, soft ghost notes, and short fills into each new section.")
      .groove("late-hat-pocket")
      .sound({
        source: "sample_pack",
        samplePack: "/samples/virtuosity-kit/manifest.yaml"
      })
      .kit({
        kick: { soundfont: "taiko_drum", pitch: "A1", gain: 1.05 },
        snare: { soundfont: "synth_drum", pitch: "D3", gain: 0.9 },
        hat: { soundfont: "woodblock", pitch: "C5", gain: 0.5 },
        open_hat: { soundfont: "woodblock", pitch: "G5", gain: 0.45 },
        perc: { soundfont: "synth_drum", pitch: "A4", gain: 0.55 }
      })
      .pattern({
        resolution: 16,
        bars: 2,
        repeat: 18,
        start: "1:1",
        swing: 0.18,
        velocity: { default: 0.78, ghost: 0.34, accent: 0.95 },
        lanes: {
          kick: "x . . . . . . . . . x . . . . . x . . . . . . . x . . . . . . .",
          snare: ". . . . X . . g . . . . x . . . . . . . X . . . . . g . . . . .",
          hat: "X . x . x . g . X . x . x . x . X . x . x . g . X . x . x . x .",
          perc: ". . . . . . . . . . . . . g . . . . . . . . . g . . . . . . . ."
        }
      })
      .hit("1:1", "crash", { duration: "4n", velocity: 0.34, gain: 0.65 })
      .hit("2:4:480", "rim", { duration: "8n", velocity: 0.42, flam: 0.012 })
      .hit("3:4:720", "open_hat", { duration: "8n", velocity: 0.46 })
      .hit("4:3:480", "tom", { duration: "8n", velocity: 0.44 })
      .mix({
        gain: 0.9,
        saturation: 0.3,
        lowpass: 7600,
        highpass: 50,
        eq: { lowGain: 1.2, lowFrequency: 85, highGain: -1.4, highFrequency: 8500 },
        compressor: { threshold: -18, ratio: 3.2, attack: 0.004, release: 0.12, makeupGain: 1.04 }
      })
      .fillIntoSections()
      .performance({ humanize: 0.012 }),

    bass("bass", "Upright Bass")
      .intent("Warm walking root movement that anchors the low end while ducking around the kick.")
      .approachNextChord()
      .sound({ soundfont: "acoustic_bass", attack: 0.006, decay: 0.18, sustain: 0.7, release: 0.32 })
      .mix({
        gain: 0.62,
        pan: -0.04,
        highpass: 42,
        lowpass: 1500,
        duck: "kick",
        duckAmount: 0.44,
        compressor: { threshold: -24, ratio: 2.6, attack: 0.012, release: 0.2, makeupGain: 1.08 }
      })
      .lockToKick(0.44)
      .performance({ velocity: 0.62, humanize: 0.014, octave: -1 }),

    harmony("rhodes", "Tape Rhodes")
      .intent("Wide sparse chord bed that states the harmony without crowding bass or cello.")
      .sound({ soundfont: "electric_piano_1", attack: 0.012, decay: 0.32, sustain: 0.6, release: 1.1 })
      .voicing({ range: "E3-C6", maxVoices: 4, spread: true })
      .drop2()
      .avoidLowThirds("E3", "C6")
      .mix({
        gain: 0.52,
        pan: -0.24,
        saturation: 0.2,
        lowpass: 5400,
        highpass: 120,
        reverb: 0.34,
        delay: 0.08,
        duck: "kick",
        duckAmount: 0.38,
        eq: { lowGain: -2.5, lowFrequency: 180, midGain: 1.2, midFrequency: 1150, highGain: 0.8 },
        compressor: { threshold: -25, ratio: 2.2, attack: 0.006, release: 0.22, makeupGain: 1.05 },
        automation: {
          gain: [
            { time: "1:1", value: 0.75 },
            { time: "5:1", value: 0.9 },
            { time: "13:1", value: 1.0 },
            { time: "29:1", value: 0.72 }
          ]
        }
      })
      .performance({ velocity: 0.48, velocityRamp: [0.38, 0.58], strum: 0.014, humanize: 0.018 }),

    earCandy("texture", "Glass Signals")
      .intent("Sparse prismatic pings and transition halos instead of a constant wavy pad.")
      .sections(["intro"])
      .soundfont("pad_2_warm", { attack: 0.08, decay: 0.42, sustain: 0.36, release: 1.6 })
      .gain(0.21)
      .pan(0.34)
      .reverb(0.68)
      .delay(0.22, 0.46, 0.34)
      .filter({ highpass: 520, lowpass: 5200 })
      .duck("kick,snare", 0.2)
      .eq({ lowGain: -8, lowFrequency: 320, midGain: -0.8, midFrequency: 1300, highGain: 1.4, highFrequency: 7200 })
      .automate("pan", [
        ["1:1", 0.28],
        ["5:1", 0.42],
        ["13:1", -0.22],
        ["21:1", 0.34],
        ["29:1", -0.36]
      ])
      .automate("reverb", [
        ["1:1", 0.74],
        ["5:1", 0.58],
        ["13:1", 0.7],
        ["21:1", 0.62],
        ["29:1", 0.82]
      ])
      .humanize(0.014)
      .velocityRamp(0.22, 0.43)
      .phrase("1:1", [
        [0, "2n", ["F5", "G#5", "C6"], { velocity: 0.16, articulation: "sustain", strum: 0.07, gain: 0.9 }],
        [2.5, "8n", "C6", { velocity: 0.18, articulation: "legato", offset: 0.012 }],
        [3, "8n", "D#6", { velocity: 0.15, articulation: "legato" }],
        [6, "2n", ["C5", "D#5", "A#5"], { velocity: 0.13, articulation: "sustain", strum: 0.05 }],
        [11.5, "8n", "F6", { velocity: 0.22, articulation: "staccato", gain: 1.12 }]
      ])
      .phrase("12:4:480", [
        [0, "8n", "C6", { velocity: 0.2, articulation: "staccato" }],
        [0.25, "8n", "G#5", { velocity: 0.15, articulation: "staccato" }],
        [0.5, "8n", "D#6", { velocity: 0.18, articulation: "staccato", gain: 1.06 }]
      ])
      .phrase("20:4:480", [
        [0, "8n", "D#6", { velocity: 0.2, articulation: "staccato" }],
        [0.25, "8n", "F6", { velocity: 0.18, articulation: "staccato" }],
        [0.5, "4n", ["C6", "D#6", "G#6"], { velocity: 0.16, articulation: "sustain", strum: 0.035 }]
      ])
      .phrase("28:4:480", [
        [0, "8n", "A#5", { velocity: 0.18, articulation: "staccato" }],
        [0.25, "8n", "C6", { velocity: 0.16, articulation: "staccato" }],
        [0.5, "2n", ["F5", "C6", "F6"], { velocity: 0.14, articulation: "sustain", strum: 0.08, gain: 0.86 }]
      ]),

    counterline("cello", "Cello Answer")
      .intent("Call-and-response melodic answer that develops the hook at section starts.")
      .motif("cello-answer")
      .motifPlacement("sections")
      .sections(["verse1", "breakdown", "verse2", "outro"])
      .sound({ soundfont: "cello", attack: 0.12, decay: 0.3, sustain: 0.82, release: 1.2 })
      .mix({
        gain: 0.38,
        pan: 0.48,
        reverb: 0.45,
        highpass: 110,
        lowpass: 4200,
        eq: { lowGain: -1.5, lowFrequency: 180, midGain: 1.6, midFrequency: 750, highGain: -0.5 },
        automation: {
          gain: [
            { time: "5:1", value: 0.78 },
            { time: "13:1", value: 0.9 },
            { time: "21:1", value: 1.0 },
            { time: "29:1", value: 0.64 }
          ]
        }
      })
      .performance({ velocity: 0.46, velocityRamp: [0.36, 0.54], humanize: 0.02 }),

    lead("lead", "Neon Hook")
      .intent("A recognizable intro signal that returns as the verse two payoff, then fades into a high outro echo.")
      .sections(["intro", "verse2", "outro"])
      .soundfont("lead_2_sawtooth", { attack: 0.018, decay: 0.2, sustain: 0.56, release: 0.7 })
      .gain(0.26)
      .pan(0.16)
      .reverb(0.38)
      .delay(0.16, 0.34, 0.28)
      .filter({ highpass: 360, lowpass: 3900 })
      .duck("kick", 0.18)
      .saturate(0.12)
      .eq({ lowGain: -5, lowFrequency: 420, midGain: 1.4, midFrequency: 1500, highGain: -1.2, highFrequency: 7800 })
      .automate("gain", [
        ["1:1", 0.0],
        ["1:3", 0.72],
        ["3:1", 0.58],
        ["5:1", 0.16],
        ["9:1", 0.04],
        ["13:1", 0.0],
        ["21:1", 0.0],
        ["21:3", 0.85],
        ["25:1", 1.0],
        ["29:1", 0.52],
        ["33:1", 0.34]
      ])
      .automate("reverb", [
        ["1:1", 0.46],
        ["21:1", 0.34],
        ["29:1", 0.58]
      ])
      .humanize(0.011)
      .phrase("1:3", [
        [0, "8n", "C5", { velocity: 0.35, articulation: "legato", offset: 0.008 }],
        [0.5, "8n", "C#5", { velocity: 0.3, articulation: "legato", offset: 0.012 }],
        [1, "4n", "D#5", { velocity: 0.4, articulation: "sustain", gain: 0.94 }],
        [3, "8n", "C5", { velocity: 0.31, articulation: "legato" }],
        [3.5, "8n", "G#4", { velocity: 0.28, articulation: "legato" }],
        [4, "4n", "A#4", { velocity: 0.34, articulation: "sustain" }],
        [8, "8n", "C5", { velocity: 0.32, articulation: "legato" }],
        [8.5, "8n", "D#5", { velocity: 0.38, articulation: "legato", gain: 0.98 }],
        [10, "2n", "F5", { velocity: 0.42, articulation: "sustain", gain: 1.04 }]
      ])
      .phrase("21:3", [
        [0, "8n", "C5", { velocity: 0.42, articulation: "legato", offset: 0.006 }],
        [0.5, "8n", "C#5", { velocity: 0.38, articulation: "legato", offset: 0.01 }],
        [1, "4n", "D#5", { velocity: 0.48, articulation: "sustain", gain: 1.05 }],
        [3, "8n", "C5", { velocity: 0.39, articulation: "legato", offset: 0.012 }],
        [3.5, "8n", "G#4", { velocity: 0.34, articulation: "legato" }],
        [4, "4n", "A#4", { velocity: 0.4, articulation: "sustain" }],
        [8, "8n", "C5", { velocity: 0.43, articulation: "legato", offset: 0.008 }],
        [8.5, "8n", "D#5", { velocity: 0.49, articulation: "legato", gain: 1.08 }],
        [10, "2n", "F5", { velocity: 0.52, articulation: "sustain", gain: 1.12 }],
        [12, "4n", "D#5", { velocity: 0.42, articulation: "legato" }],
        [13, "4n", "C5", { velocity: 0.36, articulation: "sustain" }],
        [16, "8n", "G#5", { velocity: 0.46, articulation: "legato", offset: 0.008 }],
        [16.5, "8n", "F5", { velocity: 0.44, articulation: "legato" }],
        [18, "4n", "D#5", { velocity: 0.4, articulation: "sustain" }],
        [20, "8n", "C5", { velocity: 0.38, articulation: "legato", offset: 0.012 }],
        [21, "8n", "A#4", { velocity: 0.34, articulation: "legato" }]
      ])
      .phrase("29:3", [
        [0, "8n", "C6", { velocity: 0.26, articulation: "legato" }],
        [0.5, "8n", "C#6", { velocity: 0.24, articulation: "legato", offset: 0.01 }],
        [2, "4n", "F6", { velocity: 0.28, articulation: "sustain" }],
        [8, "8n", "A#5", { velocity: 0.23, articulation: "legato", offset: 0.012 }],
        [9, "2n", "C6", { velocity: 0.25, articulation: "sustain", gain: 0.82 }]
      ])
      .note("33:1", "1m", "F6", { velocity: 0.18, articulation: "sustain", gain: 0.62 })
  ]
});
