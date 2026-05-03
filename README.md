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

Songs should live as folders:

```text
songs/ambient-orbit/
  song.yaml
  tracks/
    bass.track.yaml
    piano.track.yaml
    strings.track.yaml
```

`song.yaml` defines:

- `tempo`, `key`, `timeSignature`, and `master`
- `sections` with `start`, `duration`, `scene`, and `intensity`
- optional `trackOrder`

Each `tracks/*.track.yaml` file defines one instrument with mix values, effects,
humanization, and notes.

Agent workflow rule: write one instrument at a time. First create the song
scaffold with sections and `trackOrder`, then add one complete track file per
pass. This keeps the agent focused on how each instrument functions in the
arrangement.

The supported v1 instruments are:

- `grand_piano`
- `cinematic_strings`
- `upright_bass`
- `hybrid_drums`
- `drum_kit` — multi-sample kit; `pitch` is a lane name (`kick`, `snare`, `hat`, `open_hat`, `clap`, `rim`, `perc`, `tom`, `ride`, `crash`); per-track `kit:` block overrides per-lane soundfont/pitch/gain
- `glass_pad`
- `solo_cello`
- `analog_lead`
- `electric_piano` — Rhodes-style chord bed; use with `soundfont: electric_piano_1` (Rhodes) or `electric_piano_2` (Wurli)

The engine uses real browser-loaded SoundFont samples by default. Add a `sound`
block on each track to pick the exact sampled instrument and envelope:

```yaml
sound:
  soundfont: acoustic_grand_piano
  attack: 0.01
  decay: 0.24
  sustain: 0.52
  release: 1.2
```

Notes can use either `pitch` or `pitches`. Use `pitches` plus `strum` for
voiced chords:

```yaml
- { time: 5:1, duration: 2n, pitches: [D3, A3, F4], velocity: 0.48, strum: 0.018 }
```

## Minimal Track Template

```yaml
id: piano
name: Felt Piano
instrument: grand_piano
sound:
  soundfont: acoustic_grand_piano
  attack: 0.01
  decay: 0.24
  sustain: 0.52
  release: 1.2
gain: 0.58
pan: -0.12
reverb: 0.55
humanize: 0.018
notes:
  - { time: 1:1, duration: 2n, pitches: [D3, A3, F4], velocity: 0.48, strum: 0.018 }
```

## Drum Patterns

Drum tracks can author a step grid instead of writing each hit by hand:

```yaml
instrument: drum_kit
groove: dilla-drag        # named per-step micro-timing
pattern:
  resolution: 16          # steps per bar
  bars: 2                 # phrase length
  repeat: 8               # how many times to repeat the phrase
  start: 1:1
  swing: 0.18             # MPC swing on off-16ths
  velocity: { default: 0.78, ghost: 0.34, accent: 0.95 }
  lanes:
    kick:  "x . . . . . . . . . x . . . . . x . . . . . . . x . . . . . . ."
    snare: ". . . . X . . g . . . . x . . . . . . . X . . . . . g . . . . ."
    hat:   "X . x . x . g . X . x . x . x . X . x . x . g . X . x . x . x ."
```

Lane tokens: `x` normal, `X` accent, `g` ghost, `f` flam, `.` silence. The
loader expands the pattern into `NoteEvent[]` and merges any explicit `notes:`
entries on the same track.

Bundled grooves: `dilla-drag`, `j-rush`, `boom-bap`, `mpc-swing-58`. Or supply
a custom `{ resolution, offsets: [ms, ...] }`.

## Lo-fi & Sidechain

Track-level effects:

- `saturation: 0–1` — soft-clip waveshaper (tape edge).
- `lowpass: Hz` — track lowpass filter.
- `highpass: Hz` — track highpass filter.
- `duck: <lane>` — sidechain duck this track from a drum-kit lane (usually `kick`).
- `duckAmount: 0–1` — duck depth (default 0.6, ~3 dB).

Master:

- `master.vinyl: 0–1` — master vinyl/dust noise bus.

## Checks

```bash
bun run check
```
