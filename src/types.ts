export type SceneName = "aurora" | "cathedral" | "tunnel" | "nebula";

export type InstrumentName =
  | "grand_piano"
  | "cinematic_strings"
  | "upright_bass"
  | "hybrid_drums"
  | "glass_pad"
  | "solo_cello"
  | "analog_lead";

export type NoteEvent = {
  time: string | number;
  duration: string | number;
  pitch?: string | number;
  pitches?: Array<string | number>;
  velocity?: number;
  articulation?: "legato" | "staccato" | "marcato" | "sustain" | "pluck";
  offset?: number;
  strum?: number;
};

export type AutomationPoint = {
  time: string | number;
  value: number;
};

export type Track = {
  id: string;
  name: string;
  instrument: InstrumentName;
  sound?: {
    source?: "soundfont" | "fallback";
    soundfont?: string;
    attack?: number;
    decay?: number;
    sustain?: number;
    release?: number;
  };
  gain?: number;
  pan?: number;
  reverb?: number;
  delay?: number;
  humanize?: number;
  swing?: number;
  octave?: number;
  notes: NoteEvent[];
  automation?: {
    gain?: AutomationPoint[];
    filter?: AutomationPoint[];
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
