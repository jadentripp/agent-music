# Agent Music Song Storage

This project stores agent-written song folders in SQLite while preserving the folder/YAML authoring workflow.

The repository stays useful for app code, examples, schemas, and fixtures. User songs live in SQLite as immutable versions.

## Model

```text
SQLite = canonical version history
Filesystem = temporary editing workspace
songctl = import/export/validate bridge
Agent = edits normal YAML files
```

Every save creates a new immutable song version. Rolling back is just moving the song's `current_version_id` pointer.

## Simple Workflow

```bash
bun install
bun link
songctl new "Glass Meadow"
songctl list
songctl save work/glass-meadow --message "Add bass track"
songctl history glass-meadow
```

That is the main loop: **new, edit files, save**.

For an existing song:

```bash
songctl open glass-meadow
```

By default the database is stored at `.data/songs.sqlite`. Override it with:

```bash
SONG_DB=/path/to/songs.sqlite songctl history minimal-song
```

## Extra Commands

```bash
songctl list
songctl history glass-meadow --full
songctl validate work/minimal-song
songctl changes minimal-song <old-version-id> <new-version-id>
```

## Song Folder Shape

```text
song.yaml
tracks/
  piano.track.yaml
  bass.track.yaml
```

`song.yaml` should include:

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
