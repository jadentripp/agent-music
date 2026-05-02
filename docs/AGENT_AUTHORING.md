# Agent Authoring

The song format should be simple enough that a coding agent can write it without ceremony, but expressive enough to make polished multi-instrument music.

## Preferred File Layout

A song should be a folder:

```text
songs/my-song/
  song.yaml
  tracks/
    bass.track.yaml
    piano.track.yaml
    strings.track.yaml
```

Use `song.yaml` for metadata, sections, visual scenes, master settings, and `trackOrder`. Put each instrument in its own `tracks/*.track.yaml` file.

## Core Rule

Write one instrument at a time.

Do not ask an agent to produce a whole finished arrangement in one response. The reliable workflow is:

1. Create the song scaffold: title, tempo, key, sections, visual scenes, and `trackOrder`.
2. Add one complete `tracks/<instrument>.track.yaml` file.
3. Build and listen.
4. Revise that track if needed.
5. Add the next instrument only after the current part has a clear role.

## Why

Multi-track music fails when every part is generated at once. The agent stops hearing the arrangement and starts filling space. One-instrument passes force attention on role, register, rhythm, motif, dynamics, and mix.

## Ergonomic YAML Shape

Scaffold:

```yaml
title: My Song
tempo: 96
key: A minor
timeSignature: 4/4
master:
  gain: 0.82
  limiter: true
sections:
  - { id: intro, name: Intro, start: 1:1, duration: 4m, scene: aurora, intensity: 0.7 }
trackOrder:
  - bass
```

Track file:

```yaml
id: bass
name: Acoustic Bass
instrument: upright_bass
sound:
  soundfont: acoustic_bass
gain: 0.5
pan: 0
humanize: 0.018
notes:
  - { time: 1:1, duration: 2n, pitch: A1, velocity: 0.56, articulation: pluck }
```

Use plain names and compact note objects:

```yaml
- { time: 1:1, duration: 2n, pitch: D3, velocity: 0.62 }
- { time: 1:3, duration: 2n, pitches: [D3, A3, F4], velocity: 0.48, strum: 0.018 }
```

Use expanded YAML only for important expressive events:

```yaml
- time: 9:1
  duration: 1m
  pitches: [G2, D3, B3, A4]
  velocity: 0.72
  articulation: sustain
  offset: 0.012
  strum: 0.022
```

## Per-Track Question

Before adding a track, the agent should decide:

- What role does this instrument serve?
- What register is open?
- What rhythm or motif does it own?
- Where does it enter and leave?
- How does it avoid covering the other instruments?

If those answers are unclear, the agent should not write notes yet.
