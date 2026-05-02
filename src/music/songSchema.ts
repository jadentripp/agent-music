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
  strum: z.number().min(0).max(0.25).optional()
}).refine((note) => note.pitch !== undefined || note.pitches !== undefined, {
  message: "Provide pitch or pitches"
});

const automationPointSchema = z.object({
  time: timeValue,
  value: z.number()
});

const instrumentSchema = z.enum([
  "grand_piano",
  "cinematic_strings",
  "upright_bass",
  "hybrid_drums",
  "glass_pad",
  "solo_cello",
  "analog_lead"
]);

const sectionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  start: timeValue,
  duration: timeValue,
  scene: z.enum(["aurora", "cathedral", "tunnel", "nebula"]),
  intensity: z.number().min(0).max(2).optional()
});

const trackSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  instrument: instrumentSchema,
  sound: z
    .object({
      source: z.enum(["soundfont", "fallback"]).optional(),
      soundfont: z.string().min(1).optional(),
      attack: z.number().min(0).max(5).optional(),
      decay: z.number().min(0).max(5).optional(),
      sustain: z.number().min(0).max(1).optional(),
      release: z.number().min(0).max(8).optional()
    })
    .optional(),
  gain: z.number().min(0).max(2).optional(),
  pan: z.number().min(-1).max(1).optional(),
  reverb: z.number().min(0).max(1).optional(),
  delay: z.number().min(0).max(1).optional(),
  humanize: z.number().min(0).max(0.08).optional(),
  swing: z.number().min(0).max(0.35).optional(),
  octave: z.number().int().min(-3).max(3).optional(),
  notes: z.array(noteSchema).min(1),
  automation: z
    .object({
      gain: z.array(automationPointSchema).optional(),
      filter: z.array(automationPointSchema).optional()
    })
    .optional()
});

const songMetaSchema = z.object({
  title: z.string().min(1),
  artist: z.string().optional(),
  tempo: z.number().min(30).max(240),
  key: z.string().min(1),
  timeSignature: z.string().regex(/^\d+\/\d+$/),
  master: z.object({
    gain: z.number().min(0).max(1.2),
    limiter: z.boolean().optional()
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

  return parsed.data;
}

function formatIssues(issues: z.ZodIssue[]) {
  return issues.map((issue) => `${issue.path.join(".") || "song"}: ${issue.message}`).join("\n");
}
