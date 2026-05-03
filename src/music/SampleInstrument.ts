import yaml from "js-yaml";

export type SampleRegion = {
  id?: string;
  lane?: string;
  layer?: string;
  sample: string;
  root?: string | number;
  lokey?: string | number;
  hikey?: string | number;
  lovel?: number;
  hivel?: number;
  gain?: number;
  attack?: number;
  release?: number;
  oneShot?: boolean;
  roundRobin?: string;
};

export type SampleInstrumentManifest = {
  name: string;
  kind?: string;
  baseUrl?: string;
  regions: SampleRegion[];
};

export type SampleTrigger = {
  pitch: string | number;
  velocity: number;
  destination: AudioNode;
  startAt: number;
  duration: number;
  gain?: number;
};

type DecodedRegion = SampleRegion & {
  buffer: AudioBuffer;
  rootMidi?: number;
  lowMidi?: number;
  highMidi?: number;
};

export class SampleInstrument {
  private roundRobinIndexes = new Map<string, number>();

  private constructor(
    private readonly context: AudioContext,
    private readonly manifestUrl: string,
    private readonly manifest: SampleInstrumentManifest,
    private readonly regions: DecodedRegion[]
  ) {}

  static async load(context: AudioContext, manifestUrl: string) {
    const response = await fetch(manifestUrl);
    if (!response.ok) {
      throw new Error(`Sample manifest failed: ${manifestUrl} (${response.status})`);
    }

    const manifest = yaml.load(await response.text()) as SampleInstrumentManifest;
    if (!manifest?.regions?.length) {
      throw new Error(`Sample manifest has no regions: ${manifestUrl}`);
    }

    const baseUrl = resolveBaseUrl(manifestUrl, manifest.baseUrl);
    const regions = await Promise.all(
      manifest.regions.map(async (region) => {
        const sampleUrl = resolveSampleUrl(region.sample, baseUrl);
        const sampleResponse = await fetch(sampleUrl);
        if (!sampleResponse.ok) {
          throw new Error(`Sample failed: ${sampleUrl} (${sampleResponse.status})`);
        }

        return {
          ...region,
          buffer: await decodeSample(context, sampleUrl, await sampleResponse.arrayBuffer()),
          rootMidi: toMidi(region.root),
          lowMidi: toMidi(region.lokey),
          highMidi: toMidi(region.hikey)
        };
      })
    );

    return new SampleInstrument(context, manifestUrl, manifest, regions);
  }

  trigger({ pitch, velocity, destination, startAt, duration, gain = 1 }: SampleTrigger) {
    const regions = this.pickRegions(pitch, velocity);
    if (regions.length === 0) return undefined;

    return regions.map((region) => {
      const source = this.context.createBufferSource();
      const amp = this.context.createGain();
      source.buffer = region.buffer;
      source.playbackRate.value = playbackRate(region, pitch);

      const regionGain = Math.max(0.0001, gain * velocity * (region.gain ?? 1));
      const attack = region.attack ?? 0.001;
      const release = region.release ?? 0.08;
      amp.gain.setValueAtTime(0.0001, startAt);
      amp.gain.exponentialRampToValueAtTime(regionGain, startAt + attack);

      const stopAt = region.oneShot ? startAt + region.buffer.duration + 0.02 : startAt + duration + release;
      if (!region.oneShot) {
        amp.gain.setTargetAtTime(0.0001, startAt + duration, release);
      }

      source.connect(amp);
      amp.connect(destination);
      source.start(startAt);
      source.stop(stopAt);
      return source;
    });
  }

  private pickRegions(pitch: string | number, velocity: number) {
    const midi = toMidi(pitch);
    const lane = typeof pitch === "string" && midi === undefined ? pitch.toLowerCase() : undefined;
    const candidates = this.regions.filter((region) => {
      const laneMatches = lane ? region.lane?.toLowerCase() === lane : true;
      const velocityMatches = velocity >= (region.lovel ?? 0) && velocity <= (region.hivel ?? 1);
      const keyMatches =
        midi === undefined ||
        (midi >= (region.lowMidi ?? Number.NEGATIVE_INFINITY) && midi <= (region.highMidi ?? Number.POSITIVE_INFINITY));
      return laneMatches && velocityMatches && keyMatches;
    });

    if (candidates.length === 0) return [];

    const layers = new Map<string, DecodedRegion[]>();
    for (const candidate of candidates) {
      const layer = candidate.layer ?? "main";
      if (!layers.has(layer)) layers.set(layer, []);
      layers.get(layer)!.push(candidate);
    }

    return Array.from(layers.entries()).map(([layer, layerCandidates]) => {
      const key = `${lane ?? String(midi ?? this.manifestUrl)}:${layer}`;
      const index = this.roundRobinIndexes.get(key) ?? 0;
      this.roundRobinIndexes.set(key, index + 1);
      return layerCandidates[index % layerCandidates.length];
    });
  }
}

function resolveBaseUrl(manifestUrl: string, baseUrl?: string) {
  if (baseUrl) return new URL(baseUrl, window.location.origin).toString();
  return new URL(".", new URL(manifestUrl, window.location.origin)).toString();
}

function resolveSampleUrl(sample: string, baseUrl: string) {
  const encodedSample = sample
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return new URL(encodedSample, baseUrl).toString();
}

async function decodeSample(context: AudioContext, sampleUrl: string, data: ArrayBuffer) {
  try {
    return await context.decodeAudioData(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Sample decode failed: ${sampleUrl} (${message})`);
  }
}

function playbackRate(region: DecodedRegion, pitch: string | number) {
  const target = toMidi(pitch);
  if (target === undefined || region.rootMidi === undefined) return 1;
  return Math.pow(2, (target - region.rootMidi) / 12);
}

function toMidi(value: string | number | undefined) {
  if (typeof value === "number") return value;
  if (!value) return undefined;
  const match = value.match(/^([A-G](?:#|b)?)(-?\d)$/);
  if (!match) return undefined;
  const note = pitchClasses[match[1]];
  if (note === undefined) return undefined;
  return (Number(match[2]) + 1) * 12 + note;
}

const pitchClasses: Record<string, number> = {
  C: 0,
  "C#": 1,
  Db: 1,
  D: 2,
  "D#": 3,
  Eb: 3,
  E: 4,
  F: 5,
  "F#": 6,
  Gb: 6,
  G: 7,
  "G#": 8,
  Ab: 8,
  A: 9,
  "A#": 10,
  Bb: 10,
  B: 11
};
