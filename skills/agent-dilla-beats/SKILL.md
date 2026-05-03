---
name: agent-dilla-beats
description: Use when writing dusty hip-hop, lo-fi, boom-bap, or J Dilla-style beats in the Agent-Written Music Studio. Covers the drum_kit instrument, the pattern step-grid, the dilla-drag groove, Rhodes chord beds, sub-bass with sidechain ducking, and the vinyl/saturation mix recipe. Reference song is `songs/dusty-loop`.
---

# Agent Dilla Beats

## When to use

Hip-hop, lo-fi, boom-bap, jazzy beats, head-nod loops at 75–95 BPM. If the brief is "Dilla", "MPC", "dusty", "Madlib", "Donuts", "Soulquarians", "Suff Daddy", "Knxwledge", or anything with "lo-fi" in it, this is the right skill.

Skip this skill for: dance music, four-on-the-floor anything, cinematic, ambient, orchestral.

## Why it sounds like Dilla and nothing else does

Three things make a Dilla beat sound like a Dilla beat. Lose any of them and the beat sounds generic.

1. **Drunk timing.** Hats and ghost snares drag *behind* the grid. Kicks and downbeat snares stay in the pocket. Quantized hats kill the feel instantly.
2. **Dust.** Tape saturation, light low-pass on the kit, vinyl crackle on the master. No clean reverb tails.
3. **Rhodes 9-chords ducking under the kick.** The chord bed is sidechained to the kick — you can hear the chord "breathe" with every kick hit.

Everything else (kit choice, voicings, tempo) supports those three.

## Required ingredients

A Dilla beat in this studio is exactly four tracks:

| Track | Instrument | Role |
|---|---|---|
| `drums` | `drum_kit` | The kit. Use `pattern` + `groove: dilla-drag`. |
| `bass` | `upright_bass` | Sub-bass roots. `duck: kick`. Sparse, 2–4 notes per bar. |
| `rhodes` | `electric_piano` | m9 / maj9 chord bed. `duck: kick`. Lowpass, light saturation. |
| `texture` | `glass_pad` | Low-gain air. Optional. Long sustained 3-note pads. |

Don't add a lead. Don't add strings. Restraint is the genre.

## Tempo, key, time signature

- Tempo: **82–94 BPM**. 88 is the safe pick.
- Key: minor. F minor, A minor, D minor, C# minor all work. Avoid majors unless going for Sa-Ra / Pharaohe Monch territory.
- Time: 4/4. Always.
- Master: `gain: 0.78`, `vinyl: 0.18`–`0.25`.

## Drum kit (copy this)

```yaml
id: drums
name: Dusty Kit
instrument: drum_kit
gain: 0.92
saturation: 0.32        # tape edge; do not skip
lowpass: 7400           # roll off the icy top end
highpass: 55            # clean rumble below the kick fundamental
groove: dilla-drag      # the whole point
humanize: 0.012
kit:
  kick:  { soundfont: taiko_drum, pitch: A1, gain: 1.05 }
  snare: { soundfont: synth_drum, pitch: D3, gain: 0.9 }
  hat:   { soundfont: woodblock,  pitch: C5, gain: 0.5 }
  open_hat: { soundfont: woodblock, pitch: G5, gain: 0.45 }
  perc:  { soundfont: synth_drum, pitch: A4, gain: 0.55 }
pattern:
  resolution: 16
  bars: 2
  repeat: 8             # repeat the 2-bar phrase to cover the song
  start: 1:1
  swing: 0.18           # MPC swing on top of the groove
  velocity: { default: 0.78, ghost: 0.34, accent: 0.95 }
  lanes:
    kick:  "x . . . . . . . . . x . . . . . x . . . . . . . x . . . . . . ."
    snare: ". . . . X . . g . . . . x . . . . . . . X . . . . . g . . . . ."
    hat:   "X . x . x . g . X . x . x . x . X . x . x . g . X . x . x . x ."
    perc:  ". . . . . . . . . . . . . g . . . . . . . . . g . . . . . . . ."
notes: []
```

### Lane tokens

- `x` — normal hit at default velocity
- `X` — accent
- `g` — ghost (low velocity, marked as ghost)
- `f` — flam (a quiet grace note 25 ms before)
- `.` — silence

### Groove names

- `dilla-drag` — the default. Hats and ghosts drag late, downbeats in the pocket.
- `j-rush` — opposite move: hats slightly *early*. Use for Donuts-era frantic feel.
- `boom-bap` — straight, slight snare push.
- `mpc-swing-58` — hard 58% swing, classic MPC.

## Bass (copy this shape)

```yaml
id: bass
name: Sub Bass
instrument: upright_bass
sound: { soundfont: acoustic_bass, attack: 0.006, decay: 0.18, sustain: 0.7, release: 0.32 }
gain: 0.62
saturation: 0.18
lowpass: 1800           # kill harmonics, leave the fundamental
duck: kick
duckAmount: 0.7         # the deepest duck — bass must move
humanize: 0.014
notes:
  - { time: 1:1, duration: 2n, pitch: F1, velocity: 0.62, articulation: pluck }
  - { time: 1:3, duration: 4n, pitch: C2, velocity: 0.45, articulation: pluck }
  # ... root on bar 1, optional 5th hop on beat 3, repeat
```

Rules:
- One note per bar minimum, four notes per bar maximum. Usually two.
- Roots only, with occasional 5th or octave.
- `articulation: pluck` always. Velocity 0.55–0.65.
- Octave 1 (very low). The lowpass kills upper harmonics.

## Rhodes chord bed (copy this shape)

```yaml
id: rhodes
name: Tape Rhodes
instrument: electric_piano
sound: { soundfont: electric_piano_1, attack: 0.012, decay: 0.32, sustain: 0.6, release: 1.1 }
gain: 0.5
pan: -0.18
saturation: 0.22
lowpass: 5200
highpass: 120
duck: kick
duckAmount: 0.42        # subtler than bass — you want to feel it, not hear it
humanize: 0.02
reverb: 0.4
notes:
  - { time: 1:1, duration: 1m, pitches: [Db4, F4, Ab4, C5], velocity: 0.52, articulation: sustain, strum: 0.014 }
  - { time: 2:3, duration: 2n, pitches: [Db4, F4, Ab4],     velocity: 0.42, articulation: legato }
```

Voicings:
- **m9**: `[b3, 5, b7, 9]` of the root. For Fm9 with root in bass: `[Ab3, C4, Eb4, G4]`. For Bbm9: `[Db4, F4, Ab4, C5]`.
- **maj9**: `[3, 5, 7, 9]`. For Dbmaj9: `[F3, Ab3, C4, Eb4]`.
- **Dominant 9**: `[3, b7, 9]`. For C9: `[E3, Bb3, D4]`.
- Drop the root from the voicing — the bass holds it.
- Drop the 5th if you need to thin it out — keep the 3rd and 7th.
- Always `strum: 0.012`–`0.018` on the chord. Never simultaneous attacks.
- One chord per bar on beat 1, optional stab on the "and of 2" or beat 3.

## Texture (optional)

```yaml
id: texture
name: Air Pad
instrument: glass_pad
gain: 0.18              # very low — it should be sub-audible
reverb: 0.6
lowpass: 3200
highpass: 220
notes:
  - { time: 5:1, duration: 4m, pitches: [F4, Ab4, C5], velocity: 0.32, articulation: sustain, strum: 0.04 }
```

Rules:
- 3-note voicing, no root, very long sustain (4m or more).
- Gain under 0.2 always. If you can pick it out in the mix, it's too loud.
- Skip entirely on shorter beats (under 8 bars).

## Master mix

```yaml
master:
  gain: 0.78
  limiter: true
  vinyl: 0.22           # 0.15–0.30 is the sweet spot
```

## Section template (16-bar loop)

```yaml
sections:
  - { id: intro, name: Tape Intro, start: 1:1, duration: 4m, scene: aurora, intensity: 0.6 }
  - { id: loop, name: Pocket Loop, start: 5:1, duration: 8m, scene: nebula, intensity: 1.1 }
  - { id: outro, name: Vinyl Outro, start: 13:1, duration: 4m, scene: cathedral, intensity: 0.45 }
```

Drums play through the whole song (use `repeat`). Bass enters at the intro. Rhodes enters at the loop. Texture enters with Rhodes. The outro is just bass + Rhodes + texture decaying out.

## What to avoid

- ❌ Quantized hats — every off-16th must drag (use `groove: dilla-drag`).
- ❌ Four-on-the-floor kick. The kick is the *least* predictable element.
- ❌ Snares on every 2 and 4 with no ghosts. Ghosts are the texture.
- ❌ Busy fills. One open-hat or perc accent every 2 bars is the budget.
- ❌ `articulation: marcato` anywhere. Everything is loose.
- ❌ Reverb above 0.5 on the drums. You want air, not space.
- ❌ Lead instruments. If the loop needs a lead, the loop isn't done.
- ❌ Major-key brightness. If you must, use a maj7 chord, not maj9.
- ❌ Tempos above 95 BPM. That's not Dilla, that's a different genre.

## One-pass workflow

Same one-instrument-at-a-time rule as the parent `agent-music-composer` skill, but the order is fixed:

1. `song.yaml` with sections + `vinyl: 0.22`.
2. `drums.track.yaml` with `pattern` + `groove: dilla-drag`. Build, play. Hats *must* drag.
3. `bass.track.yaml` with `duck: kick` and `duckAmount: 0.7`. You should *feel* the duck.
4. `rhodes.track.yaml` with `duck: kick` and `duckAmount: 0.42`. m9 voicings only.
5. `texture.track.yaml` (optional, only on 12+ bar songs).

Reference: `songs/dusty-loop` is the canonical implementation. Diff against it when something feels off.

## Validation

```bash
bun run build
```

Then open the dev server, pick the song, listen for:

- Kick punches through, doesn't disappear into the snare.
- Hats drag late on the off-16ths (audibly behind the grid).
- Bass drops volume on every kick and recovers within ~180 ms.
- Rhodes chords have a subtle pump under the kick.
- Vinyl noise audible but not distracting on solo.

If any of those is missing, the beat isn't dusty enough yet. Revise that one track.
