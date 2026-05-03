---
name: agent-music-composer
description: Use when writing or improving Agent-Written Music Studio modular song folders, especially when the goal is realistic, expressive, professional-sounding browser playback with one track per file, sample-backed instruments, section structure, harmony, humanized performance, and audio-reactive visual cues.
---

# Agent Music Composer

## Goal

Write modular song folders that sound like intentional music, not generated note lists. Optimize for playable arrangements using the studio's real sample-backed instruments.

## Workflow

Write one instrument at a time. Do not compose a full multi-track song in one pass.

1. Start with a musical brief: genre, emotional arc, reference energy, duration, key, tempo, and target instruments.
2. Create the song scaffold only: `songs/<song-id>/song.yaml` with metadata, sections, visual scenes, and `trackOrder`.
3. Add or revise exactly one `songs/<song-id>/tracks/<track-id>.track.yaml` file per pass. After each pass, validate and listen before adding the next instrument.
4. Recommended order: drums/percussion or pulse, bass, harmonic bed, lead/melody, countermelody, texture/ear candy.
5. For each new track, read the existing tracks first and decide its role. It must leave space for the other parts.
6. Humanize the one track you are writing: velocity shape, small offsets, articulations, strums, and track-level humanize.
7. Mix that track against the existing arrangement: gain, pan, envelope, reverb intent, and register.
8. Validate with `bun run check`; then listen in the browser and revise the music, not just the syntax.

The pass is not done until the current instrument has a clear musical role and does not fight the existing parts.

## Studio Format Rules

Use repo-backed song folders.

Preferred layout:

```text
songs/my-song/
  song.yaml
  tracks/
    bass.track.yaml
    piano.track.yaml
    strings.track.yaml
```

Required `song.yaml` fields:

```yaml
title: Example
tempo: 84
key: D minor
timeSignature: 4/4
master:
  gain: 0.82
  limiter: true
sections: []
trackOrder: []
```

Minimal `tracks/piano.track.yaml` template:

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

Preferred sampled instruments:

- `grand_piano` with `soundfont: acoustic_grand_piano`
- `cinematic_strings` with `soundfont: string_ensemble_1`
- `solo_cello` with `soundfont: cello`
- `upright_bass` with `soundfont: acoustic_bass`
- `glass_pad` with `soundfont: pad_2_warm`
- `analog_lead` with `soundfont: lead_2_sawtooth`
- `hybrid_drums` with `soundfont: taiko_drum`

Track sound block:

```yaml
sound:
  soundfont: acoustic_grand_piano
  attack: 0.01
  decay: 0.24
  sustain: 0.52
  release: 1.2
```

Expressive note fields:

```yaml
- time: 5:1
  duration: 2n
  pitches: [D3, A3, F4]
  velocity: 0.48
  articulation: sustain
  offset: 0.012
  strum: 0.018
  gain: 1.1
```

Use `pitch` for single notes and `pitches` for chords. Use `strum` only with `pitches`.

**Note `gain`:** optional multiplier **after** `velocity` (default `1`, range about 0–2). Use for phrase shaping and accents without rewriting every velocity.

## Delay, reverb send, and pan automation

**Delay (track-level)**

- `delay`: wet amount 0–1 (same meaning as before).
- `delayTime`: echo time in **seconds** (default `0.24` when delay is active). Allowed up to ~2s; engine uses a safe `maxDelayTime` on the delay line.
- `delayFeedback`: 0–**0.85** — output fed back into the delay input. Keep below 1 to avoid runaway feedback.

If `delay` and `delayFeedback` are both 0, no delay line is created for that note (dry only).

**Automation** (`automation` on the track)

```yaml
automation:
  gain: []
  filter: []   # lowpass Hz, needs static lowpass or automation only
  reverb: []   # values 0–1, same scale as track.reverb; drives send level over time
  pan: []      # values -1 (left) to 1 (right); overrides static pan between points
```

Prefer a few points at section boundaries.

**Routing (author mental model)**

- `automation.gain` and the mixer affect the **dry** channel fader (`output` after FX). The **reverb send** is tapped **after** ducking but **before** that fader: turning down `automation.gain` does **not** turn down how much signal hits the shared reverb bus. Ride `automation.reverb` (or `track.reverb`) when you want less reverb tail on a drop.

## One-Instrument Pass Checklist

Before writing notes for a track, answer internally:

- What is this instrument's role: pulse, bass, harmony, melody, counterline, texture, accent, or transition?
- Which register is free?
- Which sections should it enter, leave, or change?
- What motif, groove, or voicing idea makes this part memorable?
- What should it not play so the arrangement breathes?

Then write only that track file. Keep the YAML simple and idiomatic. Prefer clear inline note objects for short notes and expanded YAML for important chords or expressive moments.

## Composition Heuristics

- Keep bass below melodies by at least an octave; avoid muddy low sustained thirds.
- Piano should use sparse voicings, not constant block chords. Let notes ring.
- Strings and pads need long notes, slow attacks, and quiet velocities.
- Cello works best as a counterline with stepwise motion and occasional leaps.
- Drums should support section energy. Do not fill every beat unless the genre demands it.
- Velocity should form phrases: weak pickups, stronger downbeats, shaped peaks.
- Leave silence. Good arrangements breathe.
- Reuse motifs across sections with transposition, inversion, rhythmic variation, or orchestration changes.
- Prefer 2-5 strong tracks over many weak tracks.

## Quality Bar

Before calling a song good, check:

- Does it have a recognizable motif within the first 8 bars?
- Does each section change energy, register, harmony, or orchestration?
- Are sample-backed `soundfont` names present on tracks?
- Do velocities vary musically?
- Are offsets/humanize subtle rather than chaotic?
- Does the ending feel intentional?
- Does `bun run check` pass?

If it sounds bad, revise the arrangement first: harmony, register, rhythm, and dynamics matter more than adding more notes.
