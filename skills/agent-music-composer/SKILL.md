---
name: agent-music-composer
description: Use when writing or improving Agent-Written Music Studio songs — prefer typed `arrangement.ts` for complex agent-authored music, compile to repo-backed `song.yaml` and `tracks/*.track.yaml`, then audit/listen/revise.
---

# Agent Music Composer

## Goal

Write modular song folders that sound intentional. For complex work, author `songs/<id>/arrangement.ts` first, compile it, then revise the generated arrangement until it clears audit and sounds musical in the browser. Use `arrangement.yaml` only for simple data-only sources or compatibility.

## Expressing different styles (composition, not presets)

There are **no style templates** in the repo—only **authoring primitives**. The model encodes genre and feel by **composing** those primitives:

- **Time feel:** `pattern` density and lane choices; `pattern.swing`; per-step `groove.offsets` (ms) you design for push/pull; `humanize` and per-note `offset`.
- **Harmony / register:** explicit `pitches`, sparse vs dense voicings, which sections enter or drop out.
- **Rhythm identity:** ghost hits (`g`), accents, rests, `flam`, drum `kit` tuning, velocity curves.
- **Sonic character:** `sound` / sample pack / soundfont, `eq`, `compressor`, `saturation`, filters, `reverb`, `delay`, `master.vinyl`, optional numeric `reverbIr*` for space.
- **Rigidity vs pocket:** sidechain via `duck` / `duckAmount`; automation on gain/filter/reverb for section energy.

Reference **finished songs under `songs/`** only as examples of complete work—not as scaffolds to duplicate. Build each piece from the brief using these fields.

## Workflow

1. Musical brief: arc, energy, length, key, tempo, instruments.
2. For complex pieces, write **`songs/<id>/arrangement.ts`** with form, chord `harmony`, named `motifs`, explicit `grooves`, and role-based `parts`.
3. Compile with **`bun run arrange compile <song-id>`**; do not hand-edit generated files unless the song intentionally opts out of the compiler.
4. Typical arrangement order: pulse / drums → bass → harmony → lead/counterline → ear candy → mix/master.
5. Validate with **`bun run arrange check <song-id>`**, **`bun run agent:music check <song-id>`**, **`bun run check`**, and listen in the browser after meaningful edits.
6. **Mix / master pass:** After arranged notes feel right, rebalance **`gain`**, **`pan`**, **`eq`**, **`compressor`**, **`reverb`**, **`duck`**, **`automation`**, then **`song.yaml` → `master`**.
7. Humanize: velocities, `humanize`, `offset`, `strum`, `articulation`, optional `groove` as **`{ resolution, offsets: [ms...] }`** (author the ms array; no preset names).

## TypeScript Arrangement DSL

Use `arrangement.ts` when the user asks for professional or complex music. Import helpers from `src/music/dsl.ts`:

```ts
import { defineArrangement, section, chords, motif, groove, drums, bass, harmony } from "../../src/music/dsl.ts";
```

Its stable concepts are:

- `sections` — the form and visual scene timeline.
- `harmony` — chord timeline, with `time`, `duration`, and chord symbol.
- `motifs` — reusable scale-degree phrases that the compiler varies deterministically across sections or harmony points.
- `grooves` — named explicit per-step millisecond offset arrays.
- `parts` — role-based tracks (`drums`, `bass`, `harmony`, `lead`, `counterline`, `pad`, `ear_candy`, `custom`) with `sound`, `mix`, `performance`, `voicing`, `pattern`, and optional generated `notes`.

Compiler pass:

```bash
bun run arrange compile <song-id>
bun run arrange check <song-id>
```

If generated YAML is stale, update `arrangement.ts` and recompile. Keep generated headers intact. `arrangement.yaml` remains a fallback source, but `arrangement.ts` wins when both exist.

The compiler writes **`arrangement.map.json`** next to the source. Use it indirectly through `bun run agent:music ...`; it maps generated notes back to part roles, intents, motif placements, harmony points, fills, and patterns.

Agent-friendly DSL verbs:

- Explicit notes: `note(time, duration, pitch, opts)`, `hit(time, lane, opts)`, `chordNote(...)`, and `phrase(start, [[beatOffset, duration, pitch, opts], ...])`.
- Part sound/mix/performance: `.soundfont()`, `.samplePack()`, `.gain()`, `.pan()`, `.reverb()`, `.delay()`, `.filter()`, `.eq()`, `.compressor()`, `.duck()`, `.automate()`, `.humanize()`, `.velocityRamp()`.
- Part role helpers: `.intent("...")`, `.lockToKick(amount)`, `.fillIntoSections()`, `.approachNextChord()`, `.drop2()`, `.avoidLowThirds(low, high)`.
- Motif transforms: `.transpose(degrees)`, `.invert(axis)`, `.sequence()` / `.repeat()`, `.thin(every)`, `.take(count)`.

Prefer fluent helpers for new `arrangement.ts` work; use raw `.mix({ ... })`, `.sound({ ... })`, or `.notes([...])` only when the fluent surface is less clear.

Useful loops:

```bash
bun run agent:music check <song-id>
bun run agent:music analyze <song-id>
bun run agent:music suggest <song-id> --issue masking
bun run arrange preview <song-id> --section verse2 --solo bass
```

Use `docs/AGENT_MUSIC_EXAMPLES.md` for compact source patterns before inventing a new arrangement from scratch.

## Composing across tracks

- **`trackOrder`** — When you set `song.trackOrder`, keep it aligned with every `tracks/*.track.yaml` **`id`**. Unknown ids or missing track ids make mixer/playback order fall back to file sort and can surprise mix decisions.
- **`duck` / sidechain** — `duck` lane names must exist on the **`drum_kit`** (or hybrid part) you reference; the kit’s manifest defines which lanes are valid targets.
- **`sections`** — Section `start`/`duration` form the structure timeline; extend parts whose musical material should continue under later sections so visualization and energy match the arrangement.
- **`tempoMap`** — A tempo map applies to **every** track; coordinated timing changes hit all parts at once—plan cross-track entries accordingly.
- After coordinated edits, run **`bun run check`** and listen.

## Mix and master (where to edit, in what order)

**Files:** `song.yaml` → **`master`** only for the stereo bus. Every stem lives in **`tracks/<id>.track.yaml`** (`gain`, `pan`, sends, tone, `duck`, `automation`).

**Rough signal path (per track):** high-pass → low-pass (optional) → saturation → **duck** (sidechain dips) → optional **delay** → **pan** → track fader (`automation.gain` drives this fader) → **master**; **reverb** is a parallel send from post-pan into one shared convolver, whose return level is set on **`master`**.

### Master bus (`song.yaml` → `master`)

| Field | Role | Hint |
| --- | --- | --- |
| `gain` | Master trim | `0.55`–`0.92` typical before limiting; schema allows up to `1.2` if the mix is quiet. |
| `limiter` | Bus compressor/limiter behavior | **On by default** (`true` or omitted). Set **`limiter: false`** only if you want an uncompressed, hotter stem-like export. |
| `vinyl` | Lo-fi noise bed | `0`–`1`; subtle at `0.1`–`0.35`. |
| `reverbIrSeconds` | Shared room IR length | Default **2.8** if omitted. |
| `reverbIrDecay` | IR decay shape | Default **2.6** if omitted. |
| `reverbReturnGain` | Wet return into master | Default **0.42** if omitted; lower for drier productions, raise for washier mixes. |

Per-track **`reverb`** is **send depth** (`0`–`1`). The engine maps sends non-linearly; treat `0.15`–`0.45` as common musical values before automating.

### Per-track mix (`*.track.yaml`)

Work **one pass at a time**: balance **`gain`** (and note **`velocity`**) so the low end, drums, and lead do not all peak the same register; then **`pan`**; then **`reverb`** / **`delay`**; then **`duck`** / **`duckAmount`** against a drum lane; then **`automation`** for section lifts ( **`gain`**, **`filter`**, **`reverb`**, **`pan`** — see `src/music/songSchema.ts` for shapes).

| Group | Fields | Notes |
| --- | --- | --- |
| Level / space | `gain`, `pan`, `reverb`, `delay`, `delayTime`, `delayFeedback` | Delay dry/wet uses `delay`; default delay time **0.24** s if not set. |
| Tone / weight | `highpass`, `lowpass`, `eq`, `compressor`, `saturation` | High-pass mud removal; use `eq` for broad low/mid/high shaping and `compressor` for stem control before ducking. |
| Pump / groove | `duck`, `duckAmount`, `swing`, `humanize` | **`duck`** is a comma list of drum **lane** names, e.g. `kick` or `kick,snare`. **`duckAmount`** default in engine is **0.6** if omitted. |
| Moves | `automation.gain`, `.filter`, `.reverb`, `.pan` | Points use song **`time`** values; use for drops, builds, and section contrast. |

### Model workflow for a mix pass

1. Read current **`trackOrder`** (if any) so you know stack order; adjust stem **`gain`** / **velocities** first.
2. Tame masking: **`highpass`** on non-bass parts; **`lowpass`** or **`saturation`** only where tone needs it.
3. Place elements: **`pan`**, then shared room via **`reverb`**; use **`delay`** for slap/widening.
4. Pocket: **`duck`** + **`duckAmount`** on bass/pads/keys so kick/snare breathe.
5. Section energy: **`automation`** (often **`gain`** + **`filter`** or **`reverb`** on pads).
6. Last: **`master.gain`** and, if needed, **`reverbReturnGain`** / IR — then **`bun run check`** and listen.

## Layout

`songs/<id>/song.yaml` and `songs/<id>/tracks/*.track.yaml`.

## `song.yaml` fields

- `title`, `artist?`, `tempo`, `tempoMap?`, `key`, `timeSignature`, `master`, `sections`, `trackOrder?`
- `master`: `gain`, `limiter?`, `vinyl?`, optional **`reverbIrSeconds`**, **`reverbIrDecay`**, **`reverbReturnGain`** (shared convolver — numbers only).

## `track` fields (see Zod in `src/music/songSchema.ts`)

- `id`, `name`, `instrument` (`grand_piano`, `electric_piano`, `drum_kit`, …)
- `sound?` (`soundfont`, `samplePack`, envelope, `source`)
- `pattern?` (step grid) and/or **`notes`** (each needs `time` + `duration` + `pitch` or `pitches`)
- Mix: `gain`, `pan`, `reverb`, `delay` / `delayTime` / `delayFeedback`, filters, `eq`, `compressor`, `saturation`, `duck`, `duckAmount`, `humanize`, `track.swing`
- **`groove`:** only ` { resolution?: number, offsets: number[] } ` — per-step MS offsets; no string presets.
- `automation?` on `gain`, `filter`, `reverb`, `pan`

## Instruments

Prefer explicit `sound` blocks and repo sample packs where applicable (`grand_piano` salamander, `drum_kit` virtuosity, etc.). Rhodes-style: `electric_piano` + `electric_piano_1` (or author your own soundfont).

## Expressive notes

`velocity`, `gain`, `articulation` (`legato`, `staccato`, …), `offset`, `strum` (with `pitches`), `ghost`, `flam`.

## Pass checklist

Role, register, section entries/exits, motif, what stays silent, mix intent. **Mix/master:** stem **`gain`** balance, **`pan`** and **`reverb`** staging, **`duck`** audibility, at least one **automation** move if the arrange is long, **`master.gain`** / **limiter** / **return** sanity.

## Quality

Motif in first 8 bars; section contrast; sensible velocities; fresh compiled output; `bun run check` passes.
