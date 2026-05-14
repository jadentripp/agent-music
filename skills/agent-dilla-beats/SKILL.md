---
name: agent-dilla-beats
description: Use when writing dusty hip-hop, lo-fi, boom-bap, or J Dilla-style beats in the Agent-Written Music Studio. Covers drum_kit + pattern grid, explicit per-step groove offsets (milliseconds), Rhodes beds, bass ducking, vinyl. Reference arrangement: `songs/midnight-groove`.
---

# Agent Dilla Beats

## When to use

Hip-hop, lo-fi, boom-bap, jazzy beats, head-nod loops at 75–95 BPM. Not for four-on-the-floor, pure cinematic, or ambient.

## Sound character (non-negotiables)

1. **Late hats / ghosts** — off-grid feel via `groove: { resolution, offsets: [...] }` (ms per step) and `pattern.swing`; kicks and downbeat snares stay earlier / straighter.
2. **Dust** — saturation, low-pass on kit, `master.vinyl`.
3. **Rhodes (or similar) ducking under kick** — `duck: kick`, sensible `duckAmount`.

There are **no bundled groove names**. Author offsets yourself (see `songs/midnight-groove/tracks/drums.track.yaml` for a 16-step example).

## Tracks

| Role | Typical `instrument` | Notes |
|---|---|---|
| Drums | `drum_kit` | `pattern` + explicit `groove` object + `kit` |
| Bass | `upright_bass` | Sparse roots, `duck: kick`, `articulation: pluck` |
| Chords | `electric_piano` | Voicings you spell; `duck: kick`, light saturation / lowpass |
| Air | `glass_pad` | Optional, very low gain |

## Authoring rules

- Tempo ~82–94, minor keys, 4/4.
- `pattern`: lane tokens `x`, `X`, `g`, `f`, `.` — see repo README.
- **Groove:** `groove: { resolution: 16, offsets: [ ...16 or multiple-of-16 ms values ] }` aligned to your `pattern.resolution`.
- **Master:** set `gain`, `limiter`, `vinyl`; shared convolution is configured with optional numeric `reverbIrSeconds`, `reverbIrDecay`, `reverbReturnGain` on `master` (no preset names).

## Workflow

One track file per pass: drums first (feel must be right), then bass, then keys, then optional texture. Validate with `bun run check` and listen.

## Anti-patterns

- Quantized, on-grid hats with no groove offsets.
- Busy fills and lead lines on top — restraint is the genre.
- Snare on 2 and 4 every bar with no ghost layers.
