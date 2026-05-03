export type SceneName = "aurora" | "cathedral" | "tunnel" | "nebula";

export type InstrumentName =
  | "grand_piano"
  | "cinematic_strings"
  | "upright_bass"
  | "hybrid_drums"
  | "drum_kit"
  | "glass_pad"
  | "solo_cello"
  | "analog_lead"
  | "electric_piano";

export type NoteEvent = {
  time: string | number;
  duration: string | number;
  pitch?: string | number;
  pitches?: Array<string | number>;
  velocity?: number;
  articulation?: "legato" | "staccato" | "marcato" | "sustain" | "pluck";
  offset?: number;
  strum?: number;
  ghost?: boolean;
  flam?: number;
  /** Phrase trim / expression multiplier after velocity (default 1). */
  gain?: number;
};

export type AutomationPoint = {
  time: string | number;
  value: number;
};

export type KitVoice = {
  soundfont?: string;
  pitch?: string | number;
  gain?: number;
};

export type DrumPattern = {
  resolution?: number;
  bars?: number;
  repeat?: number;
  start?: string | number;
  swing?: number;
  velocity?: { default?: number; ghost?: number; accent?: number };
  lanes: Record<string, string>;
};

export type GrooveSpec =
  | string
  | {
      resolution?: number;
      offsets: number[];
    };

export type Track = {
  id: string;
  name: string;
  instrument: InstrumentName;
  sound?: {
    source?: "soundfont" | "sample_pack" | "fallback";
    soundfont?: string;
    samplePack?: string;
    attack?: number;
    decay?: number;
    sustain?: number;
    release?: number;
  };
  kit?: Record<string, KitVoice>;
  pattern?: DrumPattern;
  groove?: GrooveSpec;
  gain?: number;
  pan?: number;
  reverb?: number;
  /** Wet send 0–1 (dry/wet mix with delay line). */
  delay?: number;
  /** Delay line time in seconds (default 0.24 when delay wet is used). */
  delayTime?: number;
  /** Feedback 0–0.85; delay output fed back into the delay input. */
  delayFeedback?: number;
  saturation?: number;
  lowpass?: number;
  highpass?: number;
  duck?: string;
  duckAmount?: number;
  humanize?: number;
  swing?: number;
  octave?: number;
  notes: NoteEvent[];
  automation?: {
    gain?: AutomationPoint[];
    filter?: AutomationPoint[];
    /** Reverb send depth 0–1; same scale as track.reverb. */
    reverb?: AutomationPoint[];
    /** Stereo position -1 (left) to 1 (right). */
    pan?: AutomationPoint[];
  };
};

export type Section = {
  id: string;
  name: string;
  start: string | number;
  duration: string | number;
  scene: SceneName;
  intensity?: number;
};

export type Song = {
  title: string;
  artist?: string;
  tempo: number;
  key: string;
  timeSignature: string;
  master: {
    gain: number;
    limiter?: boolean;
    vinyl?: number;
  };
  sections: Section[];
  tracks: Track[];
};

export type SongMeta = Omit<Song, "tracks"> & {
  trackOrder?: string[];
};

export type SongFile = {
  id: string;
  title: string;
  path: string;
};

export type PlaybackState = {
  playing: boolean;
  currentTime: number;
  duration: number;
  activeSection?: Section;
  analyser?: AnalyserNode;
};

export type MixerState = Record<
  string,
  {
    volume: number;
    muted: boolean;
    solo: boolean;
  }
>;
