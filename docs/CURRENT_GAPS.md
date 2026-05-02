# Current Gaps

This compares the current implementation against `docs/VISION.md`.

## Music Quality

- The app now uses browser-loaded SoundFont samples, but these are still general MIDI-style samples rather than premium, deeply expressive instrument libraries.
- Only one song, `Ambient Orbit`, has been rewritten with the newer expressive modular format. The other sample songs still need the same quality pass.
- The preferred song format is now modular folders with one track per file, but only `Ambient Orbit` has been migrated so far.
- The format is more expressive than the first version, but it still needs helper scripts so agents can scaffold songs, add tracks, and validate one instrument at a time.
- The composition format supports chords, timing offsets, strums, envelopes, articulations, and humanization, but it does not yet support richer musical controls like bends, crescendos, repeated motifs/macros, drum grooves, controller lanes, or section-level arrangement templates.
- The engine has limited effects. Reverb and delay are represented in track data, but the audio graph does not yet implement true reverb sends, EQ, compression per track, sidechain, saturation, or spatial mixing.
- Genre coverage is mostly aspirational. The examples do not yet prove that agents can write convincing jazz, hip-hop, rock, orchestral, ambient, dance, pop, experimental, and other styles.

## Instrument System

- Real sample playback exists through `soundfont-player`, but the app still needs a better local/premium sample-pack path for higher realism and offline reliability.
- Instrument variety is currently small: piano, strings, bass, drums, pad, cello, and lead. The vision calls for many instruments across many genres.
- First playback may wait while SoundFonts load and decode. The app needs better loading state, caching behavior, and preloading.

## Visualization Sync

- The visualization is audio-reactive through the master analyser and section-aware through the playback clock.
- It is not yet “perfectly synchronized” in the full creative sense: song files cannot precisely trigger visual events on beats, notes, hits, motifs, or instrument entrances.
- Visual scenes are limited to a few hardcoded modes. The app needs a richer visual cue language and more scene variety.
- The visualizer reacts to broad bass/mid/high energy, but it does not yet distinguish individual tracks or instruments.

## Browser Experience

- The current UI runs and renders well, with compact controls and full-screen WebGL.
- The large JavaScript bundle warning remains because Three.js and the audio stack are loaded in the main chunk.
- The app needs performance profiling on lower-end machines and mobile browsers.
- It needs better handling for loading, network failure, unsupported audio autoplay states, and long sessions.

## Agent Skill

- A first `agent-music-composer` skill exists and is installed locally, and it now explicitly requires a one-instrument-at-a-time composition workflow.
- The skill should be tested by asking fresh agents to write songs in different genres, then judging the musical output.
- The skill needs examples of excellent finished song files once the format and engine improve.
- The skill should eventually include stronger genre-specific guidance and a checklist for listening/revision.
