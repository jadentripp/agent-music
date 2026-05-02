import type { Song, SongFile } from "../types";
import { parseSongMetaYaml, parseTrackYaml } from "./songSchema";

const metaModules = import.meta.glob("../../songs/*/song.yaml", {
  query: "?raw",
  import: "default"
});

const trackModules = import.meta.glob("../../songs/*/tracks/*.track.yaml", {
  query: "?raw",
  import: "default"
});

export const songFiles: SongFile[] = Object.keys(metaModules)
  .sort()
  .map((path) => {
    const id = path.split("/").at(-2) ?? path;
    return {
      id,
      title: titleFromId(id),
      path
    };
  })
  .sort((a, b) => a.title.localeCompare(b.title));

export async function loadSong(file: SongFile): Promise<Song> {
  const metaLoader = metaModules[file.path];
  if (!metaLoader) {
    throw new Error(`Song metadata not found: ${file.path}`);
  }

  const meta = parseSongMetaYaml((await metaLoader()) as string);
  const songDir = file.path.replace(/\/song\.yaml$/, "");
  const trackEntries = Object.entries(trackModules)
    .filter(([path]) => path.startsWith(`${songDir}/tracks/`))
    .sort(([a], [b]) => a.localeCompare(b));

  if (trackEntries.length === 0) {
    throw new Error(`No track files found under ${songDir}/tracks/*.track.yaml`);
  }

  const tracks = await Promise.all(
    trackEntries.map(async ([path, loader]) => {
      try {
        return parseTrackYaml((await loader()) as string);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`${path}\n${message}`);
      }
    })
  );

  const orderedTracks = meta.trackOrder?.length
    ? [...tracks].sort((a, b) => {
        const aIndex = meta.trackOrder?.indexOf(a.id) ?? -1;
        const bIndex = meta.trackOrder?.indexOf(b.id) ?? -1;
        return orderValue(aIndex) - orderValue(bIndex);
      })
    : tracks;

  return {
    ...meta,
    tracks: orderedTracks
  };
}

function titleFromId(id: string) {
  return id
    .split("-")
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

function orderValue(index: number) {
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}
