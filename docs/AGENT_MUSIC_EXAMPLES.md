# Agent Music Examples

Use these as compact source patterns for `songs/<id>/arrangement.ts`. They are intentionally small: copy one idea, adapt the intent, then run `bun run arrange compile <song-id>` and `bun run agent:music check <song-id>`.

## Lo-Fi Pocket

```ts
const hook = motif()
  .degree(1, "8n", { velocity: 0.42 })
  .degree(3, "8n", { step: 1, velocity: 0.38 })
  .degree(5, "4n", { step: 2, velocity: 0.5 });

parts: [
  drums("drums", "Dusty Kit")
    .intent("Late hats, dry snare, and fills only at section boundaries.")
    .groove("late-hat-pocket")
    .fillIntoSections(),
  bass("bass", "Upright Bass")
    .intent("Simple roots with a pickup into the next chord.")
    .approachNextChord()
    .lockToKick(0.42),
  harmony("rhodes", "Tape Rhodes")
    .intent("Sparse mid-register voicings, never fighting the bass.")
    .drop2()
    .avoidLowThirds("E3", "C6"),
  counterline("cello", "Cello Answer")
    .intent("Short call-and-response hook at section starts.")
    .motif("hook")
]
```

## Cinematic Build

```ts
motifs: {
  rise: motif().degree(1, "8n").degree(2, "8n", { step: 1 }).degree(4, "4n", { step: 2 }).sequence(3, 3, 1)
},
parts: [
  pad("strings", "String Bed")
    .intent("Long, slow-attack harmony that opens as the arrangement grows.")
    .sections(["intro", "build", "release"])
    .voicing({ range: "C4-G6", maxVoices: 5, spread: true })
    .mix({ reverb: 0.58, highpass: 180 }),
  counterline("rise", "Rising Line")
    .intent("Repeating sequence that signals the build without filling every beat.")
    .motif("rise")
    .sections(["build", "release"])
]
```

## Late Hook With Phrase Helper

```ts
lead("lead", "Neon Hook")
  .intent("Late-arriving payoff hook above the pad, then a softer outro echo.")
  .sections(["verse2", "outro"])
  .soundfont("lead_2_sawtooth", { attack: 0.018, release: 0.7 })
  .gain(0.26)
  .pan(0.16)
  .reverb(0.38)
  .delay(0.16, 0.34, 0.28)
  .filter({ highpass: 360, lowpass: 3900 })
  .duck("kick", 0.18)
  .automate("gain", [
    ["21:1", 0],
    ["21:3", 0.85],
    ["25:1", 1]
  ])
  .phrase("21:3", [
    [0, "8n", "C5", { velocity: 0.42, articulation: "legato" }],
    [0.5, "8n", "C#5", { velocity: 0.38, articulation: "legato" }],
    [1, "4n", "D#5", { velocity: 0.48, articulation: "sustain", gain: 1.05 }]
  ]);
```

## House Groove

```ts
parts: [
  drums("drums", "Four On The Floor")
    .intent("Steady kick, open hat lift, and short snare fill into every new section.")
    .pattern({ resolution: 16, bars: 1, repeat: 32, lanes: { kick: "x . . . x . . . x . . . x . . .", hat: ". . x . . . x . . . x . . . x ." } })
    .fillIntoSections(),
  bass("sub", "Sub Bass")
    .intent("Tight offbeat pulse that leaves the kick transient clean.")
    .bassStyle("pulse")
    .lockToKick(0.55)
    .mix({ highpass: 32, lowpass: 900, compressor: { threshold: -24, ratio: 3 } })
]
```

## Ambient Cue

```ts
const cell = motif().degree(1, "2n").degree(5, "2n", { step: 2 }).invert(3);

parts: [
  pad("air", "Warm Air")
    .intent("Breathing upper harmony with more reverb in the ending.")
    .voicing({ range: "C4-A6", maxVoices: 4, spread: true })
    .mix({ reverb: 0.7, highpass: 240, automation: { reverb: [{ time: "1:1", value: 0.45 }, { time: "17:1", value: 0.82 }] } }),
  lead("glints", "Glass Glints")
    .intent("Sparse transformed motif as ear candy, not a main melody.")
    .motif("cell")
    .sections(["turnaround", "outro"])
]
```

## Agent Revision Loop

```bash
bun run arrange compile midnight-groove
bun run agent:music check midnight-groove
bun run arrange preview midnight-groove --section verse2 --solo bass
bun run agent:music suggest midnight-groove --issue masking
```
