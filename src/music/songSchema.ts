import yaml from "js-yaml";
import { z } from "zod";
import type { SongMeta, Track } from "../types";

const timeValue = z.union([z.string().min(1), z.number().nonnegative()]);

const noteSchema = z.object({
  time: timeValue,
  duration: timeValue,
  pitch: z.union([z.string().min(1), z.number()]).optional(),
  pitches: z.array(z.union([z.string().min(1), z.number()])).min(1).optional(),
  velocity: z.number().min(0).max(1).optional(),
  articulation: z.enum(["legato", "staccato", "marcato", "sustain", "pluck"]).optional(),
  offset: z.number().min(-0.25).max(0.25).optional(),
  strum: z.number().min(0).max(0.25).optional(),
  ghost: z.boolean().optional(),
  flam: z.number().min(0).max(0.05).optional(),
  gain: z.number().min(0).max(2).optional()
}).refine((note) => note.pitch !== undefined || note.pitches !== undefined, {
  message: "Provide pitch or pitches"
});

const automationPointSchema = z.object({
  time: timeValue,
  value: z.number()
});

const automationReverbPointSchema = z.object({
  time: timeValue,
  value: z.number().min(0).max(1)
});

const automationPanPointSchema = z.object({
  time: timeValue,
  value: z.number().min(-1).max(1)
});

const instrumentSchema = z.enum([
  "grand_piano",
  "cinematic_strings",
  "upright_bass",
  "hybrid_drums",
  "drum_kit",
  "glass_pad",
  "solo_cello",
  "analog_lead",
  "electric_piano"
]);

const trackRoleSchema = z.enum([
  "drums",
  "bass",
  "harmony",
  "lead",
  "counterline",
  "texture",
  "pad",
  "ear_candy",
  "custom"
]);

const sectionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  start: timeValue,
  duration: timeValue,
  scene: z.enum(["aurora", "cathedral", "tunnel", "nebula"]),
  intensity: z.number().min(0).max(2).optional()
});

const kitVoiceSchema = z.object({
  soundfont: z.string().min(1).optional(),
  pitch: z.union([z.string().min(1), z.number()]).optional(),
  gain: z.number().min(0).max(2).optional()
});

const patternSchema = z.object({
  resolution: z.number().int().min(2).max(64).optional(),
  bars: z.number().int().min(1).max(64).optional(),
  repeat: z.number().int().min(1).max(64).optional(),
  start: timeValue.optional(),
  swing: z.number().min(0).max(0.4).optional(),
  velocity: z
    .object({
      default: z.number().min(0).max(1).optional(),
      ghost: z.number().min(0).max(1).optional(),
      accent: z.number().min(0).max(1).optional()
    })
    .optional(),
  lanes: z.record(z.string().min(1), z.string())
});

const grooveSchema = z.object({
  resolution: z.number().int().min(2).max(64).optional(),
  offsets: z.array(z.number().min(-200).max(200)).min(1)
});

const eqSchema = z.object({
  lowGain: z.number().min(-24).max(24).optional(),
  lowFrequency: z.number().min(20).max(2000).optional(),
  midGain: z.number().min(-24).max(24).optional(),
  midFrequency: z.number().min(80).max(12000).optional(),
  midQ: z.number().min(0.1).max(18).optional(),
  highGain: z.number().min(-24).max(24).optional(),
  highFrequency: z.number().min(1000).max(20000).optional()
});

const compressorSchema = z.object({
  threshold: z.number().min(-80).max(0).optional(),
  knee: z.number().min(0).max(40).optional(),
  ratio: z.number().min(1).max(30).optional(),
  attack: z.number().min(0).max(1).optional(),
  release: z.number().min(0.01).max(3).optional(),
  makeupGain: z.number().min(0).max(4).optional()
});

const trackSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  role: trackRoleSchema.optional(),
  instrument: instrumentSchema,
  sound: z
    .object({
      source: z.enum(["soundfont", "sample_pack", "fallback"]).optional(),
      soundfont: z.string().min(1).optional(),
      samplePack: z.string().min(1).optional(),
      attack: z.number().min(0).max(5).optional(),
      decay: z.number().min(0).max(5).optional(),
      sustain: z.number().min(0).max(1).optional(),
      release: z.number().min(0).max(8).optional()
    })
    .optional(),
  kit: z.record(z.string().min(1), kitVoiceSchema).optional(),
  pattern: patternSchema.optional(),
  groove: grooveSchema.optional(),
  gain: z.number().min(0).max(2).optional(),
  pan: z.number().min(-1).max(1).optional(),
  reverb: z.number().min(0).max(1).optional(),
  delay: z.number().min(0).max(1).optional(),
  delayTime: z.number().min(0.02).max(2).optional(),
  delayFeedback: z.number().min(0).max(0.85).optional(),
  saturation: z.number().min(0).max(1).optional(),
  lowpass: z.number().min(40).max(20000).optional(),
  highpass: z.number().min(20).max(8000).optional(),
  eq: eqSchema.optional(),
  compressor: compressorSchema.optional(),
  duck: z.string().min(1).optional(),
  duckAmount: z.number().min(0).max(1).optional(),
  humanize: z.number().min(0).max(0.08).optional(),
  swing: z.number().min(0).max(0.35).optional(),
  octave: z.number().int().min(-3).max(3).optional(),
  notes: z.array(noteSchema).optional().default([]),
  automation: z
    .object({
      gain: z.array(automationPointSchema).optional(),
      filter: z.array(automationPointSchema).optional(),
      reverb: z.array(automationReverbPointSchema).optional(),
      pan: z.array(automationPanPointSchema).optional()
    })
    .optional()
}).refine((track) => (track.notes && track.notes.length > 0) || track.pattern, {
  message: "Provide notes or a pattern"
});

const tempoMapPointSchema = z.object({
  time: timeValue,
  bpm: z.number().min(20).max(320)
});

const songMetaSchema = z.object({
  title: z.string().min(1),
  artist: z.string().optional(),
  tempo: z.number().min(30).max(240),
  tempoMap: z.array(tempoMapPointSchema).optional(),
  key: z.string().min(1),
  timeSignature: z.string().regex(/^\d+\/\d+$/),
  master: z.object({
    gain: z.number().min(0).max(1.2),
    limiter: z.boolean().optional(),
    vinyl: z.number().min(0).max(1).optional(),
    reverbIrSeconds: z.number().min(0.3).max(8).optional(),
    reverbIrDecay: z.number().min(0.5).max(6).optional(),
    reverbReturnGain: z.number().min(0).max(1).optional()
  }),
  sections: z.array(sectionSchema).min(1),
  trackOrder: z.array(z.string().min(1)).optional()
});

export function parseSongMetaYaml(source: string): SongMeta {
  const loaded = yaml.load(source);
  const parsed = songMetaSchema.safeParse(loaded);

  if (!parsed.success) {
    throw new Error(formatIssues(parsed.error.issues));
  }

  return parsed.data;
}

export function parseTrackYaml(source: string): Track {
  const loaded = yaml.load(source);
  const parsed = trackSchema.safeParse(loaded);

  if (!parsed.success) {
    throw new Error(formatIssues(parsed.error.issues));
  }

  return parsed.data as Track;
}

function formatIssues(issues: z.ZodIssue[]) {
  return issues.map((issue) => `${issue.path.join(".") || "song"}: ${issue.message}`).join("\n");
}
