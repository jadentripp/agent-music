# Agent-Written Music Studio

A browser music studio for repo-backed songs. Agents write modular song folders,
the app validates those files, schedules playback with Web Audio, and drives a
full-screen Three.js visualization stage from analyser data.

## Run

```bash
npm install
npm run dev
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
- `glass_pad`
- `solo_cello`
- `analog_lead`

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

## Checks

```bash
npm run build
```
