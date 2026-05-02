import * as Soundfont from "soundfont-player";
import type { Player } from "soundfont-player";
import type { MixerState, Song, Track } from "../types";
import { findSectionAt, musicalTimeToSeconds, noteToFrequency, songDuration } from "./timing";

type ScheduledEvent = {
  id: string;
  track: Track;
  start: number;
  duration: number;
  pitch: string | number;
  frequency: number;
  velocity: number;
  articulation?: string;
};

const lookaheadSeconds = 0.18;
const schedulerMs = 35;
const defaultSoundfont = "MusyngKite";

const soundfontMap: Record<string, string> = {
  grand_piano: "acoustic_grand_piano",
  cinematic_strings: "string_ensemble_1",
  upright_bass: "acoustic_bass",
  hybrid_drums: "taiko_drum",
  glass_pad: "pad_2_warm",
  solo_cello: "cello",
  analog_lead: "lead_2_sawtooth"
};

const defaultEnvelopes: Record<string, [number, number, number, number]> = {
  grand_piano: [0.006, 0.16, 0.58, 0.45],
  cinematic_strings: [0.28, 0.42, 0.82, 1.6],
  upright_bass: [0.008, 0.12, 0.62, 0.36],
  hybrid_drums: [0.001, 0.08, 0.42, 0.22],
  glass_pad: [0.52, 0.9, 0.72, 2.4],
  solo_cello: [0.12, 0.3, 0.82, 1.2],
  analog_lead: [0.01, 0.16, 0.68, 0.42]
};

export class AudioEngine {
  private context?: AudioContext;
  private master?: GainNode;
  private analyser?: AnalyserNode;
  private compressor?: DynamicsCompressorNode;
  private events: ScheduledEvent[] = [];
  private nextEventIndex = 0;
  private startedAt = 0;
  private offset = 0;
  private timer?: number;
  private sources: AudioScheduledSourceNode[] = [];
  private song?: Song;
  private tempoMultiplier = 1;
  private mixer: MixerState = {};
  private loopSectionId?: string;
  private players = new Map<string, Player>();
  private onTick?: () => void;

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
  }

  loadSong(song: Song, mixer: MixerState, tempoMultiplier: number) {
    this.stop();
    this.song = song;
    this.offset = 0;
    this.tempoMultiplier = tempoMultiplier;
    this.mixer = mixer;
    this.events = song.tracks
      .flatMap((track) =>
        track.notes.flatMap((note, index) => {
          const pitches = note.pitches ?? (note.pitch !== undefined ? [note.pitch] : []);
          return pitches.map((pitch, pitchIndex) => {
            const voicedPitch = applyOctave(pitch, track.octave);
            return {
              id: `${track.id}-${index}-${pitchIndex}`,
              track,
              start:
                musicalTimeToSeconds(note.time, song, tempoMultiplier) +
                (note.offset ?? 0) +
                pitchIndex * (note.strum ?? 0) +
                swingOffset(note.time, song, track.swing),
              duration: Math.max(0.04, musicalTimeToSeconds(note.duration, song, tempoMultiplier)),
              pitch: voicedPitch,
              frequency: noteToFrequency(voicedPitch),
              velocity: note.velocity ?? 0.72,
              articulation: note.articulation
            };
          });
        })
      )
      .sort((a, b) => a.start - b.start);
    this.nextEventIndex = 0;
  }

  async play(onTick: () => void) {
    await this.init();
    if (!this.context || !this.song || !this.master) return;
    await this.context.resume();
    await this.loadPlayers();
    this.onTick = onTick;
    this.startedAt = this.context.currentTime - this.offset;
    this.nextEventIndex = this.events.findIndex((event) => event.start + event.duration >= this.offset);
    if (this.nextEventIndex < 0) this.nextEventIndex = this.events.length;
    this.master.gain.setTargetAtTime(this.song.master.gain, this.context.currentTime, 0.02);
    this.timer = window.setInterval(() => this.schedule(), schedulerMs);
    this.schedule();
  }

  pause() {
    this.offset = this.currentTime;
    this.clearTimer();
    this.stopSources();
  }

  stop() {
    this.offset = 0;
    this.clearTimer();
    this.stopSources();
  }

  seek(seconds: number) {
    const wasPlaying = Boolean(this.timer);
    this.offset = Math.max(0, Math.min(seconds, this.duration));
    this.stopSources();
    if (this.context) {
      this.startedAt = this.context.currentTime - this.offset;
    }
    this.nextEventIndex = this.events.findIndex((event) => event.start + event.duration >= this.offset);
    if (this.nextEventIndex < 0) this.nextEventIndex = this.events.length;
    if (wasPlaying) this.schedule();
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

  setMasterVolume(value: number) {
    if (!this.master || !this.context) return;
    this.master.gain.setTargetAtTime(value, this.context.currentTime, 0.025);
  }

  get currentTime() {
    if (!this.context || !this.timer) return this.offset;
    return Math.min(this.context.currentTime - this.startedAt, this.duration);
  }

  get duration() {
    return this.song ? songDuration(this.song) / this.tempoMultiplier : 0;
  }

  get activeSection() {
    return this.song ? findSectionAt(this.song, this.currentTime * this.tempoMultiplier) : undefined;
  }

  get analyserNode() {
    return this.analyser;
  }

  private schedule() {
    if (!this.context || !this.song) return;
    const current = this.currentTime;

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
      this.pause();
      this.seek(0);
      this.onTick?.();
      return;
    }

    const horizon = current + lookaheadSeconds;
    while (this.nextEventIndex < this.events.length && this.events[this.nextEventIndex].start <= horizon) {
      const event = this.events[this.nextEventIndex];
      if (event.start + event.duration >= current) {
        const when = this.context.currentTime + Math.max(0, event.start - current);
        this.scheduleEvent(event, when);
      }
      this.nextEventIndex += 1;
    }

    this.onTick?.();
  }

  private scheduleEvent(event: ScheduledEvent, when: number) {
    if (!this.context || !this.master) return;
    const trackMix = this.mixer[event.track.id] ?? { volume: 1, muted: false, solo: false };
    const soloed = Object.values(this.mixer).some((track) => track.solo);
    if (trackMix.muted || (soloed && !trackMix.solo)) return;

    const gain = this.context.createGain();
    const pan = this.context.createStereoPanner();
    const delay = this.context.createDelay(1);
    const delayGain = this.context.createGain();
    const dryGain = this.context.createGain();
    const trackGain = (event.track.gain ?? 0.8) * trackMix.volume * event.velocity;
    const humanize = (event.track.humanize ?? 0) * seededNoise(event.id);
    const startAt = Math.max(this.context.currentTime, when + humanize);
    const release = event.track.instrument.includes("strings") || event.track.instrument.includes("pad") ? 1.2 : 0.16;

    pan.pan.value = event.track.pan ?? 0;
    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, trackGain), startAt + 0.025);
    gain.gain.setTargetAtTime(0.0001, startAt + event.duration, release);

    dryGain.gain.value = 1 - (event.track.delay ?? 0) * 0.45;
    delay.delayTime.value = 0.24;
    delayGain.gain.value = event.track.delay ?? 0;
    gain.connect(pan);
    pan.connect(dryGain);
    dryGain.connect(this.master);
    pan.connect(delay);
    delay.connect(delayGain);
    delayGain.connect(this.master);

    if (!this.createSampleVoice(event, gain, startAt)) {
      this.createFallbackVoice(event, gain, startAt, event.duration + release);
    }
  }

  private async loadPlayers() {
    if (!this.context || !this.song) return;
    const tracks = uniqueBy(
      this.song.tracks.filter((track) => track.sound?.source !== "fallback"),
      (track) => this.soundfontName(track)
    );

    await Promise.all(
      tracks.map(async (track) => {
        const name = this.soundfontName(track);
        if (this.players.has(name)) return;
        const notes = this.events.filter((event) => event.track.instrument === track.instrument).map((event) => event.pitch);
        const player = await Soundfont.instrument(this.context!, name as never, {
          soundfont: defaultSoundfont,
          destination: this.context!.destination,
          notes,
          gain: 1,
          adsr: this.envelope(track)
        });
        player.connect(this.context!.destination);
        this.players.set(name, player);
      })
    );
  }

  private createSampleVoice(event: ScheduledEvent, destination: AudioNode, startAt: number) {
    if (!this.context || event.track.sound?.source === "fallback") return false;
    const player = this.players.get(this.soundfontName(event.track));
    if (!player) return false;
    const source = player.play(String(event.pitch), startAt, {
      duration: event.duration,
      gain: 1,
      adsr: this.envelope(event.track, event.articulation)
    }) as unknown as { stop?: (when?: number) => void; amp?: GainNode };
    if (!source.amp) return false;
    source.amp.disconnect();
    source.amp.connect(destination);
    if (source.stop) {
      const stopper = { stop: source.stop.bind(source) } as AudioScheduledSourceNode;
      this.sources.push(stopper);
    }
    return true;
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

  private createFallbackVoice(event: ScheduledEvent, destination: AudioNode, startAt: number, duration: number) {
    if (!this.context) return;
    if (event.track.instrument === "hybrid_drums") {
      this.createDrumVoice(event, destination, startAt);
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
    this.sources.push(osc, body);
  }

  private createDrumVoice(event: ScheduledEvent, destination: AudioNode, startAt: number) {
    if (!this.context) return;
    const osc = this.context.createOscillator();
    const gain = this.context.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(event.frequency, startAt);
    osc.frequency.exponentialRampToValueAtTime(Math.max(40, event.frequency * 0.42), startAt + 0.12);
    gain.gain.setValueAtTime(0.9, startAt);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.22);
    osc.connect(gain);
    gain.connect(destination);
    osc.start(startAt);
    osc.stop(startAt + 0.24);
    this.sources.push(osc);
  }

  private stopSources() {
    for (const source of this.sources) {
      try {
        source.stop();
      } catch {
        // Already stopped by the Web Audio scheduler.
      }
    }
    this.sources = [];
  }

  private clearTimer() {
    if (this.timer) window.clearInterval(this.timer);
    this.timer = undefined;
  }
}

function uniqueBy<T>(items: T[], key: (item: T) => string) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const value = key(item);
    if (seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

function applyOctave(pitch: string | number, octaveShift = 0) {
  if (typeof pitch === "number" || octaveShift === 0) return pitch;
  return pitch.replace(/(-?\d)$/, (octave) => String(Number(octave) + octaveShift));
}

function swingOffset(time: string | number, song: Song, swing = 0) {
  if (!swing || typeof time !== "string" || !/^\d+:\d+(:\d+)?$/.test(time)) return 0;
  const beat = musicalTimeToSeconds(time, song) / (60 / song.tempo);
  return Math.round(beat * 2) % 2 === 1 ? swing * (60 / song.tempo) : 0;
}

function seededNoise(id: string) {
  let seed = 0;
  for (const char of id) seed = (seed * 31 + char.charCodeAt(0)) >>> 0;
  return (seed / 0xffffffff - 0.5) * 2;
}
