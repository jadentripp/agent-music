# Agent-Written Music Studio

A browser music studio for repo-backed songs. Agents write modular song folders,
the app validates those files, schedules playback with Web Audio, and drives a
full-screen Three.js visualization stage from analyser data.

## Run

```bash
bun install
bun run dev
```

Open `http://localhost:5173`.

## Song Files

Songs live as folders: `songs/<id>/song.yaml` and `songs/<id>/tracks/*.track.yaml`.

For complex agent-authored music, prefer a high-level TypeScript source file:

```text
songs/<id>/arrangement.ts
```

`arrangement.ts` uses the typed DSL in `src/music/dsl.ts` to describe the musical form: `sections`, chord `harmony`, named `motifs`, explicit `grooves`, and role-based `parts` such as `drums`, `bass`, `harmony`, `lead`, `counterline`, `pad`, or `ear_candy`. Compile it into playable YAML with:

```bash
bun run arrange compile <song-id>
bun run arrange check <song-id>
bun run agent:music check <song-id>
```

Generated files start with a header and should be refreshed by editing `arrangement.ts`, not by hand-editing generated tracks. The compiler also writes `arrangement.map.json`, which links generated notes back to part roles, intents, motifs, harmony points, fills, and patterns for agent diagnostics. `arrangement.yaml` is still supported as a simpler fallback source; when both files exist, `arrangement.ts` wins.

The DSL includes agent-friendly transforms and intent helpers:

- Notes: `note()`, `hit()`, `chordNote()`, and `phrase(start, steps)` for compact explicit hooks.
- Motifs: `.transpose()`, `.invert()`, `.sequence()` / `.repeat()`, `.thin()`, `.take()`.
- Parts: `.intent()`, `.soundfont()`, `.samplePack()`, `.gain()`, `.pan()`, `.reverb()`, `.delay()`, `.filter()`, `.duck()`, `.automate()`, `.humanize()`.
- Arrangement roles: `.lockToKick()`, `.approachNextChord()`, `.drop2()`, `.avoidLowThirds()`, `.fillIntoSections()`.
- Examples live in `docs/AGENT_MUSIC_EXAMPLES.md`.

`song.yaml`: `tempo`, optional `tempoMap`, `key`, `timeSignature`, `master`, `sections`, optional `trackOrder` (when present, `trackOrder` controls mixer/playback order—add or reorder entries whenever you add tracks so it stays in sync with each file’s `id`).

**Master bus — shared reverb** (optional numbers, not names):

- `reverbIrSeconds` — convolver IR length (default 2.8)
- `reverbIrDecay` — decay shaping inside IR (default 2.6)
- `reverbReturnGain` — wet return level (default 0.42)

Tracks: `instrument`, optional `sound`, mix fields, `humanize`, `pattern` and/or `notes`.

**Groove** is always explicit: `groove: { resolution: 16, offsets: [ ... ] }` where `offsets` are per-step milliseconds (same length cycle as your grid). No named groove presets.

Instruments include `grand_piano`, `cinematic_strings`, `upright_bass`, `hybrid_drums`, `drum_kit` (lane names as `pitch`: `kick`, `snare`, `hat`, …), `glass_pad`, `solo_cello`, `analog_lead`, `electric_piano`.

Add a `sound` block per track when you need a specific soundfont, envelope, or `sample_pack` path.

## Drum patterns

`pattern`: `resolution`, `bars`, `repeat`, `start`, `swing`, `velocity`, `lanes` (strings of `x`, `X`, `g`, `f`, `.`). Expanded at load time and merged with hand-written `notes`.

## Mix and master

Stem levels and effects live on each **`tracks/*.track.yaml`** (`gain`, `pan`, `reverb`, `delay`, filters, `eq`, `compressor`, `saturation`, `duck`, `automation`). The stereo bus is only **`song.yaml` → `master`** (`gain`, optional `limiter`, `vinyl`, shared **`reverbIr*`** / **`reverbReturnGain`**). Prefer the **Mix and master** section in `skills/agent-music-composer/SKILL.md` for signal-flow detail and a sensible pass order.

## Lo-fi and sidechain

- `saturation`, `lowpass`, `highpass`, `delay` (+ time/feedback)
- `eq` — simple low/mid/high track shaping in dB
- `compressor` — optional per-track dynamics before ducking
- `duck` — e.g. `kick` or `kick,snare` for sidechain sources
- `master.vinyl`

## Helpers

`bun run arrange compile <song>` — compile `arrangement.ts` or fallback `arrangement.yaml` into generated song/track YAML.  
`bun run arrange check <song>` — verify generated YAML and `arrangement.map.json` are fresh.  
`bun run arrange preview <song> --section <section> --solo <track>` — print a browser URL that loads a focused preview.  
`bun run agent:music check <song>` — run the agent compose loop: freshness, score features, diagnostics, and next actions.  
`bun run agent:music analyze <song>` — print section/track density, velocity, range, masking, and mix-width features.  
`bun run agent:music suggest <song> [--issue masking|density|transition|velocity|mix|intent]` — print patch-oriented DSL suggestions.  
`bun run yaml instruments` — legal instrument ids.  
`bun run yaml new-track <song> <track-id> <instrument>` — minimal valid track (one placeholder note only).

## Checks

```bash
bun test
bun run arrange compile midnight-groove
bun run arrange check midnight-groove
bun run agent:music check midnight-groove
bun run check
```
