import * as Soundfont from "soundfont-player";
import type { Player } from "soundfont-player";
import type {
  AutomationPoint,
  KitVoice,
  MixerState,
  Song,
  Track,
  TrackRole,
  VisualEvent,
  VisualSyncFrame,
  VisualTrackState
} from "../types";
import { SampleInstrument, type SampleUsage } from "./SampleInstrument";
import {
  beatsPerMeasure,
  findSectionAt,
  musicalTimeToBeats,
  musicalTimeToSeconds,
  noteDurationSeconds,
  noteToFrequency,
  secondsPerBeatAt,
  songSecondsToBeats,
  songDuration,
  swingOffset
} from "./timing";

type ScheduledEvent = {
  id: string;
  track: Track;
  start: number;
  duration: number;
  pitch: string | number;
  frequency: number;
  velocity: number;
  humanize: number;
  /** Expression trim after velocity (default 1). */
  noteGain: number;
  articulation?: string;
  flam?: number;
  /** Drum lane key for sidechain (kick / snare), when `instrument` is drum_kit. */
  sidechainLane?: string;
  ghost?: boolean;
};

type TrackChannel = {
  input: GainNode;
  duck: GainNode;
  processors?: AudioNode[];
  delayMerge?: GainNode;
  delayDry?: GainNode;
  delayLine?: DelayNode;
  delayWet?: GainNode;
  delayFeedback?: GainNode;
  panner: StereoPannerNode;
  output: GainNode;
  tone?: BiquadFilterNode;
  reverbSend?: GainNode;
};

type Voice = {
  silence: (now: number) => void;
  stop: (now: number) => void;
  /** Wall/song-relative end; once `currentSongSec` passes this plus margin, prune the entry (see pruneExpiredVoiceRefs). */
  purgeAfterSongSec?: number;
};

const baseLookaheadSeconds = 3;
const schedulerMs = 35;
/** Wall-clock gap between scheduler ticks → extra lookahead (song seconds) to avoid missing notes after main-thread stalls. */
const schedulerGapToSongSecondsScale = 0.92;
/** Max extra lookahead from a single gap (prevents pathological scheduling after long interruptions). */
const maxGapCatchupSongSeconds = 45;
/** If the scheduler runs late, still trigger hits that started up to this many seconds ago (short drums, etc.). */
const lateHitGraceSeconds = 1.25;
/** Extra time after the last scheduled event so groove/offset stragglers and tails don't end the transport early. */
const playbackEndPadSeconds = 0.5;
/** Pre-schedule at most this many seconds of sample-pack hits; the rest use the incremental scheduler (avoids huge synchronous bursts). */
const samplePreScheduleWindowSec = 20;
const defaultSoundfont = "MusyngKite";
const defaultSamplePacks: Partial<Record<Track["instrument"], string>> = {
  cinematic_strings: "/samples/vsco-violin-section-sustain/manifest.yaml",
  grand_piano: "/samples/salamander-grand-v8/manifest.yaml",
  solo_cello: "/samples/vsco-cello-section-sustain/manifest.yaml",
  drum_kit: "/samples/virtuosity-kit/manifest.yaml"
};

const soundfontMap: Record<string, string> = {
  grand_piano: "acoustic_grand_piano",
  cinematic_strings: "string_ensemble_1",
  upright_bass: "acoustic_bass",
  hybrid_drums: "taiko_drum",
  drum_kit: "synth_drum",
  glass_pad: "pad_2_warm",
  solo_cello: "cello",
  analog_lead: "lead_2_sawtooth",
  electric_piano: "electric_piano_1"
};

const defaultEnvelopes: Record<string, [number, number, number, number]> = {
  grand_piano: [0.006, 0.16, 0.58, 0.45],
  cinematic_strings: [0.28, 0.42, 0.82, 1.6],
  upright_bass: [0.008, 0.12, 0.62, 0.36],
  hybrid_drums: [0.001, 0.08, 0.42, 0.22],
  drum_kit: [0.001, 0.05, 0.0, 0.18],
  glass_pad: [0.52, 0.9, 0.72, 2.4],
  solo_cello: [0.12, 0.3, 0.82, 1.2],
  analog_lead: [0.01, 0.16, 0.68, 0.42],
  electric_piano: [0.008, 0.22, 0.66, 0.9]
};

const defaultKit: Record<string, KitVoice> = {
  kick: { soundfont: "taiko_drum", pitch: "A1", gain: 1.0 },
  snare: { soundfont: "synth_drum", pitch: "D3", gain: 0.92 },
  clap: { soundfont: "synth_drum", pitch: "G3", gain: 0.85 },
  hat: { soundfont: "woodblock", pitch: "C5", gain: 0.55 },
  closed_hat: { soundfont: "woodblock", pitch: "C5", gain: 0.55 },
  open_hat: { soundfont: "woodblock", pitch: "G5", gain: 0.5 },
  rim: { soundfont: "woodblock", pitch: "F4", gain: 0.65 },
  perc: { soundfont: "synth_drum", pitch: "A4", gain: 0.6 },
  tom: { soundfont: "taiko_drum", pitch: "C2", gain: 0.85 },
  ride: { soundfont: "woodblock", pitch: "E5", gain: 0.55 },
  crash: { soundfont: "reverse_cymbal", pitch: "C5", gain: 0.6 }
};

const kickAliases = new Set(["kick", "bd", "bass_drum", "k"]);
const snareAliases = new Set(["snare", "sd", "side_stick", "rimshot"]);

function parseDuckLanes(duck: string): string[] {
  return duck
    .split(/[,|]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function sidechainLaneForDrumPitch(pitch: string | number): string | undefined {
  if (typeof pitch !== "string") return undefined;
  const key = pitch.toLowerCase();
  if (kickAliases.has(key)) return "kick";
  if (snareAliases.has(key)) return "snare";
  return undefined;
}

function visualLaneForPitch(track: Track, pitch: string | number): string | undefined {
  if (track.instrument !== "drum_kit" || typeof pitch !== "string") return undefined;
  return pitch.toLowerCase();
}

function inferredTrackRole(track: Track): TrackRole {
  if (track.role) return track.role;
  if (track.instrument === "drum_kit" || track.instrument === "hybrid_drums") return "drums";
  if (track.instrument === "upright_bass") return "bass";
  if (track.instrument === "electric_piano" || track.instrument === "grand_piano") return "harmony";
  if (track.instrument === "glass_pad" || track.instrument === "cinematic_strings") return "pad";
  if (track.instrument === "solo_cello") return "counterline";
  if (track.instrument === "analog_lead") return "lead";
  return "custom";
}

function eventIndexAtOrAfter(events: ScheduledEvent[], target: number): number {
  let low = 0;
  let high = events.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (events[mid].start < target) low = mid + 1;
    else high = mid;
  }
  return low;
}

function positiveModulo(value: number, mod: number): number {
  return ((value % mod) + mod) % mod;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function pulseFromProgress(progress: number, width: number): number {
  return clamp01(1 - progress / Math.max(0.001, width));
}

function emptyVisualSyncFrame(time: number, duration: number, playing: boolean, tempoMultiplier: number): VisualSyncFrame {
  return {
    time,
    duration,
    playing,
    tempoMultiplier,
    sectionProgress: 0,
    beat: 0,
    beatInBar: 0,
    bar: 0,
    beatsPerBar: 4,
    beatProgress: 0,
    barProgress: 0,
    secondsPerBeat: 60 / 88,
    beatPulse: 0,
    barPulse: 0,
    events: [],
    tracks: []
  };
}

export class AudioEngine {
  private context?: AudioContext;
  private master?: GainNode;
  private analyser?: AnalyserNode;
  private compressor?: DynamicsCompressorNode;
  private reverb?: ConvolverNode;
  private reverbReturn?: GainNode;
  private vinylSource?: AudioBufferSourceNode;
  private vinylGain?: GainNode;
  private events: ScheduledEvent[] = [];
  private nextEventIndex = 0;
  private startedAt = 0;
  private offset = 0;
  private timer?: number;
  private voices: Voice[] = [];
  private song?: Song;
  private tempoMultiplier = 1;
  private mixer: MixerState = {};
  private loopSectionId?: string;
  private loopEnabled = false;
  private masterVolume = 1;
  private players = new Map<string, Player>();
  private sampleInstruments = new Map<string, SampleInstrument>();
  private channels = new Map<string, TrackChannel>();
  private channelsForSong?: Song;
  /** Drum hit times by lane (kick, snare, …) for sidechain sources. */
  private sidechainTimesByLane = new Map<string, number[]>();
  /** Per-track merged hit times for `duck` lane list. */
  private sidechainDuckSchedules = new Map<string, number[]>();
  private duckedHitIndex = new Map<string, number>();
  /** Set in `loadSong` from note/event timing */
  private scaledDurationCached = 0;
  private onTick?: () => void;
  private playGeneration = 0;
  private _agentLastScheduleWallMs = 0;
  /** Event indices already played via upfront scheduling (sample-pack tracks only). Soundfonts stay incremental. */
  private preScheduledEventIndices = new Set<number>();

  async init() {
    if (this.context) return;
    this.context = new AudioContext();
    this.master = this.context.createGain();
    this.compressor = this.context.createDynamicsCompressor();
    this.analyser = this.context.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.78;
    this.compressor.threshold.value = -18;
    this.compressor.knee.value = 22;
    this.compressor.ratio.value = 7;
    this.compressor.attack.value = 0.004;
    this.compressor.release.value = 0.18;
    this.master.connect(this.compressor);
    this.compressor.connect(this.analyser);
    this.analyser.connect(this.context.destination);
    this.buildReverbBus();
    this.buildVinylBus();
  }

  loadSong(song: Song, mixer: MixerState, tempoMultiplier: number) {
    this.stop();
    this.song = song;
    this.channelsForSong = undefined;
    this.offset = 0;
    this.tempoMultiplier = tempoMultiplier;
    this.mixer = mixer;
    this.events = song.tracks
      .flatMap((track) =>
        track.notes.flatMap((note, index) => {
          const pitches = note.pitches ?? (note.pitch !== undefined ? [note.pitch] : []);
          return pitches.flatMap((pitch, pitchIndex) => {
            const voicedPitch = applyOctave(pitch, track.octave);
            const eventId = `${track.id}-${index}-${pitchIndex}`;
            const baseStart =
              musicalTimeToSeconds(note.time, song, tempoMultiplier) +
              (note.offset ?? 0) +
              pitchIndex * (note.strum ?? 0) +
              swingOffset(note.time, song, track.swing, tempoMultiplier);
            const sidechainLane =
              track.instrument === "drum_kit" ? sidechainLaneForDrumPitch(voicedPitch) : undefined;
            const noteGain = note.gain ?? 1;
            const durSec = Math.max(
              0.04,
              noteDurationSeconds(note.time, note.duration, song, tempoMultiplier)
            );
            const main: ScheduledEvent = {
              id: eventId,
              track,
              start: baseStart,
              duration: durSec,
              pitch: voicedPitch,
              frequency: noteToFrequency(safeFreqPitch(voicedPitch)),
              velocity: note.velocity ?? 0.72,
              humanize: (track.humanize ?? 0) * seededNoise(eventId),
              noteGain,
              articulation: note.articulation,
              sidechainLane,
              ghost: note.ghost
            };
            if (note.flam && note.flam > 0) {
              const graceId = `${main.id}-flam`;
              const grace: ScheduledEvent = {
                ...main,
                id: graceId,
                start: baseStart - note.flam,
                duration: Math.max(0.03, main.duration * 0.5),
                velocity: main.velocity * 0.45,
                humanize: (track.humanize ?? 0) * seededNoise(graceId),
                sidechainLane: undefined,
                ghost: false
              };
              return [grace, main];
            }
            return [main];
          });
        })
      )
      .sort((a, b) => a.start - b.start);
    this.sidechainTimesByLane.clear();
    for (const event of this.events) {
      if (!event.sidechainLane) continue;
      let arr = this.sidechainTimesByLane.get(event.sidechainLane);
      if (!arr) {
        arr = [];
        this.sidechainTimesByLane.set(event.sidechainLane, arr);
      }
      arr.push(event.start);
    }
    for (const arr of this.sidechainTimesByLane.values()) {
      arr.sort((a, b) => a - b);
    }
    this.sidechainDuckSchedules.clear();
    for (const track of song.tracks) {
      if (!track.duck) continue;
      const lanes = parseDuckLanes(track.duck);
      const merged = lanes
        .flatMap((lane) => this.sidechainTimesByLane.get(lane) ?? [])
        .sort((a, b) => a - b);
      if (merged.length) {
        this.sidechainDuckSchedules.set(track.id, merged);
      }
    }
    this.duckedHitIndex.clear();
    this.nextEventIndex = 0;
    this.preScheduledEventIndices.clear();
    const maxEventEnd = this.events.reduce((max, e) => Math.max(max, e.start + e.duration), 0);
    const fromSectionsAndNotes = songDuration(song, tempoMultiplier);
    this.scaledDurationCached = Math.max(fromSectionsAndNotes, maxEventEnd) + playbackEndPadSeconds;
  }

  async play(onTick: () => void) {
    const myGen = ++this.playGeneration;
    this.clearTimer();

    await this.init();
    if (myGen !== this.playGeneration) return;
    if (!this.context || !this.song || !this.master) return;

    await this.context.resume();
    if (myGen !== this.playGeneration) return;

    if (this.channelsForSong !== this.song) {
      this.buildChannels();
      this.channelsForSong = this.song;
    }

    await this.loadSampleInstruments();
    if (myGen !== this.playGeneration) return;

    await this.loadPlayers();
    if (myGen !== this.playGeneration) return;

    this.onTick = onTick;
    this.startedAt = this.context.currentTime - this.offset;
    this.stopVoices();
    this.applyMasterBus();
    this.applyReverbFromSong();
    this.scheduleTrackAutomation();
    this.scheduleAllNotesFromOffset(this.offset);
    this.applyVinylAmount(this.song.master.vinyl ?? 0);
    this.timer = window.setInterval(() => this.schedule(), schedulerMs);
    this._agentLastScheduleWallMs = 0;
    this.schedule();
  }

  pause() {
    this.playGeneration += 1;
    this.offset = this.currentTime;
    this.clearTimer();
    void this.context?.suspend();
  }

  stop() {
    this.playGeneration += 1;
    this.offset = 0;
    this.clearTimer();
    this.stopVoices();
    void this.context?.suspend();
  }

  seek(seconds: number) {
    const wasPlaying = Boolean(this.timer);
    this.offset = Math.max(0, Math.min(seconds, this.duration));
    this.stopVoices();
    if (this.context) {
      this.startedAt = this.context.currentTime - this.offset;
    }
    this.duckedHitIndex.clear();
    if (wasPlaying) {
      this.scheduleTrackAutomation();
      this.scheduleAllNotesFromOffset(this.offset);
      this.schedule();
    }
  }

  setMixer(mixer: MixerState) {
    this.mixer = mixer;
  }

  setTempoMultiplier(value: number) {
    if (!this.song) return;
    const wasPlaying = Boolean(this.timer);
    const progress = this.duration > 0 ? this.currentTime / this.duration : 0;
    this.tempoMultiplier = value;
    this.loadSong(this.song, this.mixer, value);
    this.seek(progress * this.duration);
    if (wasPlaying && this.onTick) void this.play(this.onTick);
  }

  setLoopSection(sectionId?: string) {
    this.loopSectionId = sectionId;
  }

  setLoopEnabled(value: boolean) {
    this.loopEnabled = value;
  }

  setMasterVolume(value: number) {
    this.masterVolume = value;
    this.applyMasterBus();
  }

  get currentTime() {
    if (!this.context || !this.timer) return this.offset;
    return Math.min(this.context.currentTime - this.startedAt, this.duration);
  }

  get duration() {
    return this.scaledDurationCached;
  }

  get activeSection() {
    return this.song ? findSectionAt(this.song, this.currentTime, this.tempoMultiplier) : undefined;
  }

  get analyserNode() {
    return this.analyser;
  }

  getVisualSyncFrame(): VisualSyncFrame {
    const current = this.currentTime;
    const playing = Boolean(this.timer);
    if (!this.song) {
      return emptyVisualSyncFrame(current, this.duration, playing, this.tempoMultiplier);
    }

    const song = this.song;
    const beatsPerBar = beatsPerMeasure(song);
    const beat = songSecondsToBeats(song, current, this.tempoMultiplier);
    const beatProgress = positiveModulo(beat, 1);
    const beatInBar = positiveModulo(beat, beatsPerBar);
    const activeSection = findSectionAt(song, current, this.tempoMultiplier);
    const sectionStartBeat = musicalTimeToBeats(activeSection.start, song);
    const sectionDurationBeats = Math.max(0.0001, musicalTimeToBeats(activeSection.duration, song));
    const sectionProgress = clamp01((beat - sectionStartBeat) / sectionDurationBeats);
    const soloed = Object.values(this.mixer).some((track) => track.solo);
    const tracks = new Map<string, VisualTrackState>();

    for (const track of song.tracks) {
      const mix = this.mixer[track.id] ?? { volume: 1, muted: false, solo: false };
      const audible = !mix.muted && (!soloed || mix.solo);
      tracks.set(track.id, {
        id: track.id,
        name: track.name,
        role: inferredTrackRole(track),
        instrument: track.instrument,
        volume: mix.volume,
        muted: mix.muted,
        solo: mix.solo,
        audible,
        pan: track.pan ?? 0,
        recentHit: 0,
        sustain: 0,
        energy: 0
      });
    }

    const recentWindow = 1.4;
    const upcomingWindow = 9.5;
    const events: VisualEvent[] = [];
    const firstEvent = eventIndexAtOrAfter(this.events, current - recentWindow - 0.12);

    for (let i = firstEvent; i < this.events.length && events.length < 320; i += 1) {
      const event = this.events[i];
      if (event.start > current + upcomingWindow + 0.12) break;

      const visualEvent = this.toVisualEvent(event, current, soloed, recentWindow, upcomingWindow);
      if (!visualEvent) continue;
      events.push(visualEvent);

      const track = tracks.get(event.track.id);
      if (!track) continue;
      const hitStrength = visualEvent.recent ? (1 - Math.abs(visualEvent.timeDelta) / recentWindow) * visualEvent.gain : 0;
      const sustainStrength = visualEvent.active ? (1 - visualEvent.progress * 0.36) * visualEvent.gain : 0;
      track.recentHit = Math.max(track.recentHit, hitStrength);
      track.sustain = Math.max(track.sustain, sustainStrength);
      track.energy = Math.max(track.energy, hitStrength, sustainStrength * 0.78);
    }

    return {
      time: current,
      duration: this.duration,
      playing,
      tempoMultiplier: this.tempoMultiplier,
      activeSection,
      sectionProgress,
      beat,
      beatInBar,
      bar: Math.floor(beat / beatsPerBar),
      beatsPerBar,
      beatProgress,
      barProgress: beatInBar / beatsPerBar,
      secondsPerBeat: secondsPerBeatAt(song, beat, this.tempoMultiplier),
      beatPulse: playing ? pulseFromProgress(beatProgress, 0.18) : 0,
      barPulse: playing ? pulseFromProgress(beatInBar / beatsPerBar, 0.12) : 0,
      events,
      tracks: Array.from(tracks.values())
    };
  }

  private toVisualEvent(
    event: ScheduledEvent,
    current: number,
    soloed: boolean,
    recentWindow: number,
    upcomingWindow: number
  ): VisualEvent | undefined {
    const trackMix = this.mixer[event.track.id] ?? { volume: 1, muted: false, solo: false };
    if (trackMix.muted || (soloed && !trackMix.solo)) return undefined;

    const kitVoice = this.resolveKitVoice(event.track, event.pitch);
    const kitGain = kitVoice?.gain ?? 1;
    const gain = (event.track.gain ?? 0.8) * trackMix.volume * event.velocity * kitGain * event.noteGain;
    const start = event.start + event.humanize;
    const timeDelta = start - current;
    const active = current >= start && current <= start + event.duration;
    const recent = timeDelta <= 0 && timeDelta >= -recentWindow;
    const upcoming = timeDelta > 0 && timeDelta <= upcomingWindow;
    if (!active && !recent && !upcoming) return undefined;

    return {
      id: event.id,
      trackId: event.track.id,
      trackName: event.track.name,
      role: inferredTrackRole(event.track),
      instrument: event.track.instrument,
      lane: visualLaneForPitch(event.track, event.pitch),
      pitch: event.pitch,
      frequency: event.frequency,
      start,
      duration: event.duration,
      velocity: event.velocity,
      gain,
      pan: event.track.pan ?? 0,
      timeDelta,
      progress: clamp01((current - start) / Math.max(0.001, event.duration)),
      active,
      recent,
      upcoming,
      ghost: event.ghost,
      articulation: event.articulation
    };
  }

  private schedule() {
    if (!this.context || !this.song) return;
    if (this.timer && this.context.state === "suspended") {
      void this.context.resume();
    }
    const current = this.currentTime;

    this.pruneExpiredVoiceRefs(current);

    const wallNow = typeof performance !== "undefined" ? performance.now() : 0;
    let schedulerGapWallMs = 0;
    if (this.timer && this._agentLastScheduleWallMs > 0 && wallNow > 0) {
      schedulerGapWallMs = wallNow - this._agentLastScheduleWallMs;
    }
    if (this.timer && wallNow > 0) {
      this._agentLastScheduleWallMs = wallNow;
    }

    const gapCatchupSongSec =
      schedulerGapWallMs > 55
        ? Math.min((schedulerGapWallMs / 1000) * schedulerGapToSongSecondsScale, maxGapCatchupSongSeconds)
        : 0;

    if (this.loopSectionId) {
      const section = this.song.sections.find((item) => item.id === this.loopSectionId);
      if (section) {
        const start = musicalTimeToSeconds(section.start, this.song, this.tempoMultiplier);
        const end = start + musicalTimeToSeconds(section.duration, this.song, this.tempoMultiplier);
        if (current >= end) {
          this.seek(start);
          return;
        }
      }
    } else if (current >= this.duration) {
      if (this.loopEnabled) {
        this.seek(0);
        return;
      }
      this.pause();
      this.seek(0);
      this.onTick?.();
      return;
    }

    const horizon = current + baseLookaheadSeconds + gapCatchupSongSec;
    while (this.nextEventIndex < this.events.length && this.events[this.nextEventIndex].start <= horizon) {
      if (this.preScheduledEventIndices.has(this.nextEventIndex)) {
        this.nextEventIndex += 1;
        continue;
      }
      const event = this.events[this.nextEventIndex];
      const end = event.start + event.duration;
      const stillAudible = end > current;
      const lateGrace = event.start < current && event.start >= current - lateHitGraceSeconds;
      if (stillAudible || lateGrace) {
        const when = this.context.currentTime + Math.max(0, event.start - current);
        this.scheduleEvent(event, when);
      }
      this.nextEventIndex += 1;
    }

    this.scheduleDucks(current, horizon);
    this.onTick?.();
  }

  /**
   * Schedule every note that should still sound from `offsetSeconds` through the end of the song.
   * Wall times use `startedAt`; avoids losing notes when `setInterval` ticks are late/throttled.
   */
  private scheduleAllNotesFromOffset(offsetSeconds: number) {
    if (!this.context || !this.song) return;

    this.preScheduledEventIndices.clear();

    const preUntil = offsetSeconds + samplePreScheduleWindowSec;

    for (let i = 0; i < this.events.length; i++) {
      const event = this.events[i];
      const end = event.start + event.duration;
      const lateGrace =
        event.start < offsetSeconds && event.start >= offsetSeconds - lateHitGraceSeconds;
      if (end <= offsetSeconds && !lateGrace) continue;

      if (!this.samplePackForTrack(event.track)) continue;

      if (event.start >= offsetSeconds && event.start > preUntil) continue;

      const voicesBefore = this.voices.length;
      if (event.start >= offsetSeconds) {
        this.scheduleEvent(event, this.startedAt + event.start);
      } else if (end > offsetSeconds) {
        const remaining = Math.max(0.03, end - offsetSeconds);
        this.scheduleEvent(event, this.context.currentTime, { noteDuration: remaining });
      } else {
        this.scheduleEvent(event, this.startedAt + event.start);
      }
      if (this.voices.length > voicesBefore) {
        this.preScheduledEventIndices.add(i);
      }
    }
    this.nextEventIndex = 0;
  }

  private scheduleEvent(event: ScheduledEvent, when: number, playback?: { noteDuration?: number }) {
    if (!this.context || !this.master) return;
    const trackMix = this.mixer[event.track.id] ?? { volume: 1, muted: false, solo: false };
    const soloed = Object.values(this.mixer).some((track) => track.solo);
    if (trackMix.muted || (soloed && !trackMix.solo)) {
      return;
    }

    const channel = this.channels.get(event.track.id);
    const destination: AudioNode = channel ? channel.input : this.master;

    const gain = this.context.createGain();
    const kitVoice = this.resolveKitVoice(event.track, event.pitch);
    const kitGain = kitVoice?.gain ?? 1;
    let trackGain =
      (event.track.gain ?? 0.8) * trackMix.volume * event.velocity * kitGain * event.noteGain;
    const startAt = Math.max(this.context.currentTime, when + event.humanize);
    const noteDuration = playback?.noteDuration ?? event.duration;
    let release =
      event.track.instrument.includes("strings") || event.track.instrument.includes("pad") ? 1.2 : 0.16;
    if (event.ghost) {
      trackGain *= 0.82;
      release = Math.min(release, 0.09);
    }

    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, trackGain), startAt + 0.025);
    gain.gain.setTargetAtTime(0.0001, startAt + noteDuration, release);

    gain.connect(destination);

    const voice: Voice = {
      silence: (now: number) => {
        try {
          const value = gain.gain.value;
          gain.gain.cancelScheduledValues(now);
          gain.gain.setValueAtTime(value, now);
          gain.gain.linearRampToValueAtTime(0, now + 0.008);
        } catch {
        }
      },
      stop: () => {}
    };
    voice.purgeAfterSongSec = event.start + noteDuration + release + 3;
    this.voices.push(voice);

    if (!this.createSampleVoice(event, gain, startAt, voice, kitVoice, noteDuration)) {
      this.createFallbackVoice(event, gain, startAt, noteDuration + release, voice);
    }
  }

  private buildChannels() {
    if (!this.context || !this.master || !this.song) return;
    for (const channel of this.channels.values()) {
      disconnectNode(channel.input);
      disconnectNode(channel.duck);
      for (const processor of channel.processors ?? []) disconnectNode(processor);
      if (channel.delayMerge) disconnectNode(channel.delayMerge);
      if (channel.delayDry) disconnectNode(channel.delayDry);
      if (channel.delayLine) disconnectNode(channel.delayLine);
      if (channel.delayWet) disconnectNode(channel.delayWet);
      if (channel.delayFeedback) disconnectNode(channel.delayFeedback);
      disconnectNode(channel.panner);
      disconnectNode(channel.output);
      if (channel.tone) disconnectNode(channel.tone);
      if (channel.reverbSend) disconnectNode(channel.reverbSend);
    }
    this.channels.clear();

    for (const track of this.song.tracks) {
      const input = this.context.createGain();
      const duck = this.context.createGain();
      const panner = this.context.createStereoPanner();
      const output = this.context.createGain();
      const reverbSend = this.context.createGain();
      input.gain.value = 1;
      duck.gain.value = 1;
      panner.pan.value = track.pan ?? 0;
      output.gain.value = 1;
      reverbSend.gain.value = reverbSendLevel(track.reverb);

      let chainEnd: AudioNode = input;
      const processors: AudioNode[] = [];

      if (track.highpass !== undefined) {
        const hp = this.context.createBiquadFilter();
        hp.type = "highpass";
        hp.frequency.value = track.highpass;
        hp.Q.value = 0.7;
        chainEnd.connect(hp);
        chainEnd = hp;
        processors.push(hp);
      }

      const needsToneFilter = track.lowpass !== undefined || Boolean(track.automation?.filter?.length);
      let tone: BiquadFilterNode | undefined;
      if (needsToneFilter) {
        const lp = this.context.createBiquadFilter();
        lp.type = "lowpass";
        lp.frequency.value = track.lowpass ?? 18000;
        lp.Q.value = 0.7;
        chainEnd.connect(lp);
        chainEnd = lp;
        tone = lp;
        processors.push(lp);
      }

      if (track.eq) {
        const { lowGain = 0, lowFrequency = 120, midGain = 0, midFrequency = 900, midQ = 0.9, highGain = 0, highFrequency = 7000 } = track.eq;
        if (Math.abs(lowGain) > 0.001) {
          const low = this.context.createBiquadFilter();
          low.type = "lowshelf";
          low.frequency.value = lowFrequency;
          low.gain.value = lowGain;
          chainEnd.connect(low);
          chainEnd = low;
          processors.push(low);
        }
        if (Math.abs(midGain) > 0.001) {
          const mid = this.context.createBiquadFilter();
          mid.type = "peaking";
          mid.frequency.value = midFrequency;
          mid.Q.value = midQ;
          mid.gain.value = midGain;
          chainEnd.connect(mid);
          chainEnd = mid;
          processors.push(mid);
        }
        if (Math.abs(highGain) > 0.001) {
          const high = this.context.createBiquadFilter();
          high.type = "highshelf";
          high.frequency.value = highFrequency;
          high.gain.value = highGain;
          chainEnd.connect(high);
          chainEnd = high;
          processors.push(high);
        }
      }

      if (track.saturation !== undefined && track.saturation > 0) {
        const shaper = this.context.createWaveShaper();
        shaper.curve = makeSaturationCurve(track.saturation);
        shaper.oversample = "2x";
        chainEnd.connect(shaper);
        chainEnd = shaper;
        processors.push(shaper);
      }

      if (track.compressor) {
        const c = track.compressor;
        const compressor = this.context.createDynamicsCompressor();
        compressor.threshold.value = c.threshold ?? -20;
        compressor.knee.value = c.knee ?? 14;
        compressor.ratio.value = c.ratio ?? 3;
        compressor.attack.value = c.attack ?? 0.006;
        compressor.release.value = c.release ?? 0.16;
        chainEnd.connect(compressor);
        chainEnd = compressor;
        processors.push(compressor);

        if (c.makeupGain !== undefined && Math.abs(c.makeupGain - 1) > 0.001) {
          const makeup = this.context.createGain();
          makeup.gain.value = c.makeupGain;
          chainEnd.connect(makeup);
          chainEnd = makeup;
          processors.push(makeup);
        }
      }

      chainEnd.connect(duck);

      const wet = track.delay ?? 0;
      const delayFeedback = track.delayFeedback ?? 0;
      const delayTimeSec = track.delayTime ?? 0.24;
      const useDelay = wet > 0 || delayFeedback > 0;

      let delayMerge: GainNode | undefined;
      let delayDry: GainNode | undefined;
      let delayLine: DelayNode | undefined;
      let delayWet: GainNode | undefined;
      let delayFb: GainNode | undefined;

      let prePanner: AudioNode = duck;
      if (useDelay) {
        delayMerge = this.context.createGain();
        delayMerge.gain.value = 1;
        delayDry = this.context.createGain();
        delayDry.gain.value = 1 - wet * 0.45;
        delayLine = this.context.createDelay(Math.max(2, delayTimeSec + 0.05));
        delayLine.delayTime.value = delayTimeSec;
        delayWet = this.context.createGain();
        delayWet.gain.value = wet;
        duck.connect(delayDry);
        delayDry.connect(delayMerge);
        duck.connect(delayLine);
        delayLine.connect(delayWet);
        delayWet.connect(delayMerge);
        if (delayFeedback > 0) {
          delayFb = this.context.createGain();
          delayFb.gain.value = Math.min(0.85, delayFeedback);
          delayLine.connect(delayFb);
          delayFb.connect(delayLine);
        }
        prePanner = delayMerge;
      }

      prePanner.connect(panner);
      panner.connect(output);
      output.connect(this.master);
      if (this.reverb) {
        panner.connect(reverbSend);
        reverbSend.connect(this.reverb);
      }

      this.channels.set(track.id, {
        input,
        duck,
        processors,
        delayMerge,
        delayDry,
        delayLine,
        delayWet,
        delayFeedback: delayFb,
        panner,
        output,
        tone,
        reverbSend
      });
    }
  }

  private scheduleTrackAutomation() {
    if (!this.context || !this.song) return;
    const now = this.context.currentTime;

    for (const track of this.song.tracks) {
      const channel = this.channels.get(track.id);
      if (!channel) continue;

      scheduleParamAutomation({
        context: this.context,
        param: channel.output.gain,
        points: track.automation?.gain,
        song: this.song,
        tempoMultiplier: this.tempoMultiplier,
        songOffset: this.offset,
        fallbackValue: 1,
        minValue: 0,
        maxValue: 2
      });

      if (channel.tone) {
        scheduleParamAutomation({
          context: this.context,
          param: channel.tone.frequency,
          points: track.automation?.filter,
          song: this.song,
          tempoMultiplier: this.tempoMultiplier,
          songOffset: this.offset,
          fallbackValue: track.lowpass ?? 18000,
          minValue: 40,
          maxValue: 20000
        });
      }

      if (channel.reverbSend && this.reverb) {
        scheduleReverbSendAutomation({
          context: this.context,
          param: channel.reverbSend.gain,
          points: track.automation?.reverb,
          song: this.song,
          tempoMultiplier: this.tempoMultiplier,
          songOffset: this.offset,
          fallbackDepth: track.reverb ?? 0
        });
      }

      scheduleParamAutomation({
        context: this.context,
        param: channel.panner.pan,
        points: track.automation?.pan,
        song: this.song,
        tempoMultiplier: this.tempoMultiplier,
        songOffset: this.offset,
        fallbackValue: track.pan ?? 0,
        minValue: -1,
        maxValue: 1
      });
    }
  }

  private resolveKitVoice(track: Track, pitch: string | number): KitVoice | undefined {
    if (track.instrument !== "drum_kit") return undefined;
    if (typeof pitch !== "string") return undefined;
    const key = pitch.toLowerCase();
    return track.kit?.[key] ?? track.kit?.[pitch] ?? defaultKit[key];
  }

  private async loadPlayers() {
    if (!this.context || !this.song) return;
    const needed = new Map<string, Set<string>>();
    const addNote = (name: string, pitch: string | number) => {
      if (!needed.has(name)) needed.set(name, new Set());
      needed.get(name)!.add(String(pitch));
    };

    for (const track of this.song.tracks) {
      if (track.sound?.source === "fallback") continue;
      if (this.samplePackForTrack(track)) continue;
      if (track.instrument === "drum_kit") {
        const lanes = new Set<string>();
        for (const note of track.notes) {
          const pitches = note.pitches ?? (note.pitch !== undefined ? [note.pitch] : []);
          for (const pitch of pitches) {
            if (typeof pitch === "string") lanes.add(pitch.toLowerCase());
          }
        }
        for (const lane of lanes) {
          const voice = track.kit?.[lane] ?? defaultKit[lane];
          const sound = voice?.soundfont;
          const pitch = voice?.pitch ?? "C4";
          if (sound) addNote(sound, pitch);
        }
      } else {
        const sound = this.soundfontName(track);
        for (const note of track.notes) {
          const pitches = note.pitches ?? (note.pitch !== undefined ? [note.pitch] : []);
          for (const pitch of pitches) {
            const voiced = applyOctave(pitch, track.octave);
            if (typeof voiced === "string" && /^[A-G](#|b)?-?\d$/.test(voiced)) {
              addNote(sound, voiced);
            }
          }
        }
      }
    }

    await Promise.all(
      Array.from(needed.entries()).map(async ([name, notesSet]) => {
        if (this.players.has(name)) return;
        const notes = Array.from(notesSet);
        const player = await Soundfont.instrument(this.context!, name as never, {
          soundfont: defaultSoundfont,
          destination: this.context!.destination,
          notes,
          gain: 1
        });
        player.connect(this.context!.destination);
        this.players.set(name, player);
      })
    );
  }

  private createSampleVoice(
    event: ScheduledEvent,
    destination: AudioNode,
    startAt: number,
    voice: Voice,
    kitVoice?: KitVoice,
    playbackDuration?: number
  ) {
    const duration = playbackDuration ?? event.duration;
    if (!this.context || event.track.sound?.source === "fallback") return false;
    const samplePack = this.samplePackForTrack(event.track);
    if (samplePack) {
      const instrument = this.sampleInstruments.get(samplePack);
      const sources = instrument?.trigger({
        pitch: event.pitch,
        velocity: event.velocity,
        destination,
        startAt,
        duration,
        gain: kitVoice?.gain ?? 1
      });
      if (sources?.length) {
        voice.stop = (now: number) => {
          for (const source of sources) {
            try {
              source.stop(now + 0.012);
            } catch {
              try {
                source.stop();
              } catch {
              }
            }
          }
        };
        return true;
      }
    }

    let playerName = this.soundfontName(event.track);
    let pitchToPlay: string | number = event.pitch;

    if (event.track.instrument === "drum_kit") {
      if (!kitVoice) return false;
      playerName = kitVoice.soundfont ?? soundfontMap.drum_kit;
      pitchToPlay = kitVoice.pitch ?? "C4";
    }

    const player = this.players.get(playerName);
    if (!player) return false;
    const source = player.play(String(pitchToPlay), startAt, {
      duration,
      gain: 1,
      adsr: this.envelope(event.track, event.articulation)
    }) as unknown as { stop?: (when?: number) => void; amp?: GainNode } | undefined;
    if (!source?.amp) return false;
    source.amp.disconnect();
    source.amp.connect(destination);
    if (source.stop) {
      const stopFn = source.stop.bind(source);
      voice.stop = (now: number) => {
        try {
          stopFn(now + 0.012);
        } catch {
          try {
            stopFn();
          } catch {
          }
        }
      };
    }
    return true;
  }

  private async loadSampleInstruments() {
    if (!this.context || !this.song) return;
    const manifests = unique(
      this.song.tracks
        .map((track) => this.samplePackForTrack(track))
        .filter((manifest): manifest is string => Boolean(manifest))
    );
    const usageByManifest = new Map<string, SampleUsage[]>();
    for (const event of this.events) {
      const manifest = this.samplePackForTrack(event.track);
      if (!manifest) continue;
      const usage = usageByManifest.get(manifest) ?? [];
      usage.push({ pitch: event.pitch, velocity: event.velocity });
      usageByManifest.set(manifest, usage);
    }

    await Promise.all(
      manifests.map(async (manifest) => {
        if (this.sampleInstruments.has(manifest)) return;
        this.sampleInstruments.set(
          manifest,
          await SampleInstrument.load(this.context!, manifest, uniqueSampleUsage(usageByManifest.get(manifest) ?? []))
        );
      })
    );
  }

  private samplePackForTrack(track: Track) {
    if (track.sound?.source === "fallback" || track.sound?.source === "soundfont") return undefined;
    return track.sound?.samplePack ?? defaultSamplePacks[track.instrument];
  }

  private soundfontName(track: Track) {
    return track.sound?.soundfont ?? soundfontMap[track.instrument] ?? "acoustic_grand_piano";
  }

  private envelope(track: Track, articulation?: string): [number, number, number, number] {
    const base = defaultEnvelopes[track.instrument] ?? [0.01, 0.12, 0.72, 0.4];
    const sound = track.sound;
    const envelope: [number, number, number, number] = [
      sound?.attack ?? base[0],
      sound?.decay ?? base[1],
      sound?.sustain ?? base[2],
      sound?.release ?? base[3]
    ];

    if (articulation === "staccato" || articulation === "pluck") {
      envelope[0] = Math.min(envelope[0], 0.012);
      envelope[2] = Math.min(envelope[2], 0.48);
      envelope[3] = Math.min(envelope[3], 0.22);
    }
    if (articulation === "legato" || articulation === "sustain") {
      envelope[0] = Math.max(envelope[0], 0.08);
      envelope[3] = Math.max(envelope[3], 0.8);
    }
    if (articulation === "marcato") {
      envelope[0] = Math.min(envelope[0], 0.018);
      envelope[1] = Math.min(envelope[1], 0.18);
      envelope[2] = Math.max(envelope[2], 0.74);
    }

    return envelope;
  }

  private createFallbackVoice(
    event: ScheduledEvent,
    destination: AudioNode,
    startAt: number,
    duration: number,
    voice: Voice
  ) {
    if (!this.context) return;
    if (event.track.instrument === "hybrid_drums" || event.track.instrument === "drum_kit") {
      this.createDrumVoice(event, destination, startAt, voice);
      return;
    }

    const osc = this.context.createOscillator();
    const body = this.context.createOscillator();
    const filter = this.context.createBiquadFilter();
    const bodyGain = this.context.createGain();
    const detune = event.track.instrument === "cinematic_strings" ? -7 : 4;
    const type = event.track.instrument === "glass_pad" ? "sine" : event.track.instrument === "analog_lead" ? "sawtooth" : "triangle";

    osc.type = type;
    body.type = event.track.instrument === "grand_piano" ? "sine" : "triangle";
    osc.frequency.value = event.frequency;
    body.frequency.value = event.frequency * (event.track.instrument === "upright_bass" ? 0.5 : 1.005);
    body.detune.value = detune;
    filter.type = "lowpass";
    filter.frequency.value = event.track.instrument === "glass_pad" ? 1800 : event.track.instrument === "solo_cello" ? 1200 : 3600;
    filter.Q.value = event.track.instrument === "analog_lead" ? 7 : 0.7;
    bodyGain.gain.value = event.track.instrument === "grand_piano" ? 0.35 : 0.7;

    osc.connect(filter);
    body.connect(bodyGain);
    bodyGain.connect(filter);
    filter.connect(destination);
    osc.start(startAt);
    body.start(startAt);
    osc.stop(startAt + duration);
    body.stop(startAt + duration);
    voice.stop = (now: number) => {
      try { osc.stop(now + 0.012); } catch { }
      try { body.stop(now + 0.012); } catch { }
    };
  }

  private createDrumVoice(event: ScheduledEvent, destination: AudioNode, startAt: number, voice: Voice) {
    if (!this.context) return;
    const osc = this.context.createOscillator();
    const gain = this.context.createGain();
    osc.type = "sine";
    const baseFreq = event.frequency > 0 ? event.frequency : 220;
    osc.frequency.setValueAtTime(baseFreq, startAt);
    osc.frequency.exponentialRampToValueAtTime(Math.max(40, baseFreq * 0.42), startAt + 0.12);
    gain.gain.setValueAtTime(0.9, startAt);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.22);
    osc.connect(gain);
    gain.connect(destination);
    osc.start(startAt);
    osc.stop(startAt + 0.24);
    voice.stop = (now: number) => {
      try { osc.stop(now + 0.012); } catch { }
    };
  }

  private scheduleDucks(currentSongTime: number, horizonSongTime: number): number {
    if (!this.context || !this.song) return 0;

    let bassKickDips = 0;
    for (const track of this.song.tracks) {
      if (!track.duck) continue;
      const hitTimes = this.sidechainDuckSchedules.get(track.id);
      if (!hitTimes?.length) continue;

      const channel = this.channels.get(track.id);
      if (!channel) continue;

      const amount = Math.max(0, Math.min(1, track.duckAmount ?? 0.6));
      if (amount <= 0) continue;

      const lastIndex = this.duckedHitIndex.get(track.id) ?? -1;
      let nextIndex = lastIndex + 1;
      while (nextIndex < hitTimes.length && hitTimes[nextIndex] <= horizonSongTime) {
        const hitSongTime = hitTimes[nextIndex];
        if (hitSongTime + 0.4 < currentSongTime) {
          nextIndex += 1;
          continue;
        }
        const audioTime = this.context.currentTime + Math.max(0, hitSongTime - currentSongTime);
        scheduleDuckDip(channel.duck, audioTime, amount);
        if (track.instrument === "upright_bass") bassKickDips += 1;
        nextIndex += 1;
      }
      this.duckedHitIndex.set(track.id, nextIndex - 1);
    }
    return bassKickDips;
  }

  private applyReverbFromSong() {
    if (!this.context || !this.reverb || !this.reverbReturn || !this.song) return;
    const m = this.song.master;
    const seconds = m.reverbIrSeconds ?? 2.8;
    const decay = m.reverbIrDecay ?? 2.6;
    const returnGain = m.reverbReturnGain ?? 0.42;
    this.reverb.buffer = makeImpulseResponse(this.context, seconds, decay);
    this.reverbReturn.gain.setTargetAtTime(returnGain, this.context.currentTime, 0.05);
  }

  private buildVinylBus() {
    if (!this.context || !this.master) return;
    const buffer = this.context.createBuffer(1, this.context.sampleRate * 2, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) {
      const noise = Math.random() * 2 - 1;
      const crackle = Math.random() < 0.0008 ? (Math.random() * 2 - 1) * 6 : 0;
      data[i] = noise * 0.3 + crackle;
    }
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const filter = this.context.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 3500;
    filter.Q.value = 0.6;
    const gain = this.context.createGain();
    gain.gain.value = 0;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    source.start();
    this.vinylSource = source;
    this.vinylGain = gain;
  }

  private buildReverbBus() {
    if (!this.context || !this.master) return;
    this.reverb = this.context.createConvolver();
    this.reverb.buffer = makeImpulseResponse(this.context, 2.8, 2.6);
    this.reverbReturn = this.context.createGain();
    this.reverbReturn.gain.value = 0.42;
    this.reverb.connect(this.reverbReturn);
    this.reverbReturn.connect(this.master);
  }

  private applyMasterBus() {
    if (!this.context || !this.master || !this.song || !this.compressor) return;
    const limiterOn = this.song.master.limiter !== false;
    const calculatedGain = this.song.master.gain * this.masterVolume;
    this.master.gain.setTargetAtTime(calculatedGain, this.context.currentTime, 0.025);
    this.compressor.threshold.setTargetAtTime(limiterOn ? -18 : 0, this.context.currentTime, 0.04);
    this.compressor.knee.setTargetAtTime(limiterOn ? 22 : 0, this.context.currentTime, 0.04);
    this.compressor.ratio.setTargetAtTime(limiterOn ? 7 : 1, this.context.currentTime, 0.04);
    this.compressor.attack.setTargetAtTime(limiterOn ? 0.004 : 0.02, this.context.currentTime, 0.04);
    this.compressor.release.setTargetAtTime(limiterOn ? 0.18 : 0.25, this.context.currentTime, 0.04);
  }

  private applyVinylAmount(amount: number) {
    if (!this.vinylGain || !this.context) return;
    const value = Math.max(0, Math.min(1, amount)) * 0.18;
    this.vinylGain.gain.setTargetAtTime(value, this.context.currentTime, 0.05);
  }

  private pruneExpiredVoiceRefs(currentSongSec: number) {
    if (!this.timer || this.voices.length === 0) return;
    const marginSec = 0.4;
    this.voices = this.voices.filter((v) => {
      const cutoff = v.purgeAfterSongSec;
      return cutoff === undefined || currentSongSec < cutoff + marginSec;
    });
  }

  private stopVoices() {
    if (!this.context) {
      this.voices = [];
      return;
    }
    const now = this.context.currentTime;
    for (const voice of this.voices) {
      voice.silence(now);
      voice.stop(now);
    }
    this.voices = [];
  }

  private clearTimer() {
    if (this.timer) window.clearInterval(this.timer);
    this.timer = undefined;
  }
}

function scheduleDuckDip(node: GainNode, when: number, amount: number) {
  const dipTo = Math.max(0.05, 1 - amount);
  node.gain.cancelScheduledValues(when);
  node.gain.setValueAtTime(node.gain.value || 1, when);
  node.gain.linearRampToValueAtTime(dipTo, when + 0.012);
  node.gain.setTargetAtTime(1, when + 0.05, 0.09);
}

function scheduleParamAutomation({
  context,
  param,
  points,
  song,
  tempoMultiplier,
  songOffset,
  fallbackValue,
  minValue,
  maxValue
}: {
  context: AudioContext;
  param: AudioParam;
  points?: AutomationPoint[];
  song: Song;
  tempoMultiplier: number;
  songOffset: number;
  fallbackValue: number;
  minValue: number;
  maxValue: number;
}) {
  const now = context.currentTime;
  const sorted = [...(points ?? [])].sort(
    (a, b) => musicalTimeToSeconds(a.time, song, tempoMultiplier) - musicalTimeToSeconds(b.time, song, tempoMultiplier)
  );
  const currentPoint = [...sorted]
    .reverse()
    .find((point) => musicalTimeToSeconds(point.time, song, tempoMultiplier) <= songOffset);
  const startValue = clamp(currentPoint?.value ?? fallbackValue, minValue, maxValue);

  param.cancelScheduledValues(now);
  param.setValueAtTime(startValue, now);

  for (const point of sorted) {
    const songTime = musicalTimeToSeconds(point.time, song, tempoMultiplier);
    if (songTime <= songOffset) continue;
    const audioTime = now + (songTime - songOffset);
    param.linearRampToValueAtTime(clamp(point.value, minValue, maxValue), audioTime);
  }
}

function reverbSendLevel(amount = 0) {
  return Math.pow(Math.max(0, Math.min(1, amount)), 1.4) * 0.72;
}

function scheduleReverbSendAutomation({
  context,
  param,
  points,
  song,
  tempoMultiplier,
  songOffset,
  fallbackDepth
}: {
  context: AudioContext;
  param: AudioParam;
  points?: AutomationPoint[];
  song: Song;
  tempoMultiplier: number;
  songOffset: number;
  fallbackDepth: number;
}) {
  const now = context.currentTime;
  const sorted = [...(points ?? [])].sort(
    (a, b) => musicalTimeToSeconds(a.time, song, tempoMultiplier) - musicalTimeToSeconds(b.time, song, tempoMultiplier)
  );
  const currentPoint = [...sorted]
    .reverse()
    .find((point) => musicalTimeToSeconds(point.time, song, tempoMultiplier) <= songOffset);
  const depth = clamp(currentPoint?.value ?? fallbackDepth, 0, 1);
  const startGain = reverbSendLevel(depth);

  param.cancelScheduledValues(now);
  param.setValueAtTime(startGain, now);

  for (const point of sorted) {
    const songTime = musicalTimeToSeconds(point.time, song, tempoMultiplier);
    if (songTime <= songOffset) continue;
    const audioTime = now + (songTime - songOffset);
    const mappedGain = reverbSendLevel(clamp(point.value, 0, 1));
    param.linearRampToValueAtTime(mappedGain, audioTime);
  }
}

function makeImpulseResponse(context: AudioContext, seconds: number, decay: number) {
  const length = Math.max(1, Math.floor(context.sampleRate * seconds));
  const impulse = context.createBuffer(2, length, context.sampleRate);

  for (let channel = 0; channel < impulse.numberOfChannels; channel += 1) {
    const data = impulse.getChannelData(channel);
    for (let i = 0; i < length; i += 1) {
      const progress = i / length;
      const noise = Math.random() * 2 - 1;
      data[i] = noise * Math.pow(1 - progress, decay);
    }
  }

  return impulse;
}

function disconnectNode(node: AudioNode) {
  try {
    node.disconnect();
  } catch {
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function unique<T>(items: T[]) {
  return Array.from(new Set(items));
}

function uniqueSampleUsage(items: SampleUsage[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${String(item.pitch)}:${item.velocity.toFixed(4)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function makeSaturationCurve(amount: number): Float32Array<ArrayBuffer> {
  const samples = 1024;
  const buffer = new ArrayBuffer(samples * Float32Array.BYTES_PER_ELEMENT);
  const curve = new Float32Array(buffer);
  const k = 1 + amount * 18;
  for (let i = 0; i < samples; i += 1) {
    const x = (i * 2) / samples - 1;
    curve[i] = Math.tanh(k * x) / Math.tanh(k);
  }
  return curve;
}

function applyOctave(pitch: string | number, octaveShift = 0) {
  if (typeof pitch === "number" || octaveShift === 0) return pitch;
  return pitch.replace(/(-?\d)$/, (octave) => String(Number(octave) + octaveShift));
}

function safeFreqPitch(pitch: string | number): string | number {
  if (typeof pitch === "number") return pitch;
  return /^[A-G](#|b)?-?\d$/.test(pitch) ? pitch : "C4";
}

function seededNoise(id: string) {
  let seed = 0;
  for (const char of id) seed = (seed * 31 + char.charCodeAt(0)) >>> 0;
  return (seed / 0xffffffff - 0.5) * 2;
}
