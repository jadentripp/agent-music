export type SceneName = "aurora" | "cathedral" | "tunnel" | "nebula";

export type TrackRole =
  | "drums"
  | "bass"
  | "harmony"
  | "lead"
  | "counterline"
  | "texture"
  | "pad"
  | "ear_candy"
  | "custom";

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
  /** Pattern drums mark ghost steps; engine shortens body and trims level. */
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

export type TrackEq = {
  lowGain?: number;
  lowFrequency?: number;
  midGain?: number;
  midFrequency?: number;
  midQ?: number;
  highGain?: number;
  highFrequency?: number;
};

export type TrackCompressor = {
  threshold?: number;
  knee?: number;
  ratio?: number;
  attack?: number;
  release?: number;
  makeupGain?: number;
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

/** Per-step timing in milliseconds; `resolution` = steps per bar (default 16). */
export type GrooveSpec = {
  resolution?: number;
  offsets: number[];
};

export type Track = {
  id: string;
  name: string;
  role?: TrackRole;
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
  eq?: TrackEq;
  compressor?: TrackCompressor;
  /** Sidechain source lane(s): e.g. `kick`, `snare`, or `kick,snare` (drum_kit hits only). */
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

export type TempoMapPoint = {
  time: string | number;
  bpm: number;
};

export type Song = {
  title: string;
  artist?: string;
  tempo: number;
  /** Piecewise-constant BPM from each point until the next (or end). First point can replace `tempo` at beat 0. */
  tempoMap?: TempoMapPoint[];
  key: string;
  timeSignature: string;
  master: {
    gain: number;
    limiter?: boolean;
    vinyl?: number;
    /** Shared convolver IR length in seconds (default 2.8). */
    reverbIrSeconds?: number;
    /** IR decay shaping (default 2.6); higher = faster tail decay inside the buffer. */
    reverbIrDecay?: number;
    /** Send return level into master (default 0.42). */
    reverbReturnGain?: number;
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

export type VisualEvent = {
  id: string;
  trackId: string;
  trackName: string;
  role: TrackRole;
  instrument: InstrumentName;
  lane?: string;
  pitch: string | number;
  frequency: number;
  start: number;
  duration: number;
  velocity: number;
  gain: number;
  pan: number;
  timeDelta: number;
  progress: number;
  active: boolean;
  recent: boolean;
  upcoming: boolean;
  ghost?: boolean;
  articulation?: string;
};

export type VisualTrackState = {
  id: string;
  name: string;
  role: TrackRole;
  instrument: InstrumentName;
  volume: number;
  muted: boolean;
  solo: boolean;
  audible: boolean;
  pan: number;
  recentHit: number;
  sustain: number;
  energy: number;
};

export type VisualSyncFrame = {
  time: number;
  duration: number;
  playing: boolean;
  tempoMultiplier: number;
  activeSection?: Section;
  sectionProgress: number;
  beat: number;
  beatInBar: number;
  bar: number;
  beatsPerBar: number;
  beatProgress: number;
  barProgress: number;
  secondsPerBeat: number;
  beatPulse: number;
  barPulse: number;
  events: VisualEvent[];
  tracks: VisualTrackState[];
};

export type VisualSyncSource = {
  getVisualSyncFrame: () => VisualSyncFrame;
};
