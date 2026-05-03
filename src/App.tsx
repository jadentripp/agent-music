import { lazy, Suspense, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Expand,
  Gauge,
  Headphones,
  ListMusic,
  Pause,
  Play,
  Repeat,
  SkipBack,
  SlidersHorizontal,
  Volume2,
  VolumeX
} from "lucide-react";
import { AudioEngine } from "./music/AudioEngine";
import { loadSong, songFiles } from "./music/songLoader";
import { musicalTimeToSeconds } from "./music/timing";
import type { MixerState, Section, Song } from "./types";

const VisualizerStage = lazy(() => import("./components/VisualizerStage"));

/** Wall-clock throttle for scheduler-driven UI — avoids React re-render ~28Hz */
const TRANSPORT_UI_MS = 100;

function wallNowMs(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

export default function App() {
  const engineRef = useRef(new AudioEngine());
  const lastTransportUiMs = useRef(0);

  /**
   * Immediate transport readout sync (pause, seek, tempo, restart, post-load).
   */
  const flushTransportUi = () => {
    const engine = engineRef.current;
    lastTransportUiMs.current = wallNowMs();
    setCurrentTime(engine.currentTime);
    setDuration(engine.duration);
    setActiveSection(engine.activeSection);
  };

  /** Called from AudioEngine scheduler (~35ms); batches updates for the UI thread */
  const tickFromScheduler = () => {
    const now = wallNowMs();
    if (now - lastTransportUiMs.current < TRANSPORT_UI_MS) return;
    flushTransportUi();
  };
  const [selectedId, setSelectedId] = useState(
    songFiles.some((file) => file.id === "midnight-groove") ? "midnight-groove" : songFiles[0]?.id ?? ""
  );
  const [song, setSong] = useState<Song | null>(null);
  const [error, setError] = useState("");
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [activeSection, setActiveSection] = useState<Section | undefined>();
  const [mixer, setMixer] = useState<MixerState>({});
  const [masterVolume, setMasterVolume] = useState(0.86);
  const [tempoMultiplier, setTempoMultiplier] = useState(1);
  const [loopEnabled, setLoopEnabled] = useState(true);
  const [visualIntensity, setVisualIntensity] = useState(1);
  const [mixerOpen, setMixerOpen] = useState(false);

  const selectedFile = songFiles.find((file) => file.id === selectedId);

  useEffect(() => {
    if (!selectedFile) return;
    let alive = true;
    setError("");
    setSong(null);
    loadSong(selectedFile)
      .then((loaded) => {
        if (!alive) return;
        const nextMixer = Object.fromEntries(
          loaded.tracks.map((track) => [
            track.id,
            {
              volume: 1,
              muted: false,
              solo: false
            }
          ])
        );
        setSong(loaded);
        setMixer(nextMixer);
        setCurrentTime(0);
        setPlaying(false);
        engineRef.current.loadSong(loaded, nextMixer, tempoMultiplier);
        engineRef.current.setLoopEnabled(loopEnabled);
        setDuration(engineRef.current.duration);
      })
      .catch((loadError) => {
        setSong(null);
        setError(loadError instanceof Error ? loadError.message : String(loadError));
      });

    return () => {
      alive = false;
      engineRef.current.stop();
    };
  }, [selectedFile]);

  useEffect(() => {
    engineRef.current.setMixer(mixer);
  }, [mixer]);

  useEffect(() => {
    engineRef.current.setMasterVolume(masterVolume);
  }, [masterVolume]);

  useEffect(() => {
    engineRef.current.setLoopEnabled(loopEnabled);
  }, [loopEnabled]);

  const togglePlayback = async () => {
    if (!song) return;
    const engine = engineRef.current;
    if (playing) {
      engine.pause();
      setPlaying(false);
      flushTransportUi();
      return;
    }

    setError("");
    // Flip the button state to "playing" *before* awaiting engine.play(). The
    // first play of a song can take a moment while soundfonts/samples fetch;
    // without this, the button still reads "Play" during that window and a
    // user click triggers a second play() instead of a pause(). The engine's
    // play-token guard makes this safe — if the user pauses mid-load, the
    // in-flight play() aborts before the scheduler starts.
    setPlaying(true);
    try {
      await engine.play(tickFromScheduler);
      flushTransportUi();
    } catch (playError) {
      setPlaying(false);
      setError(playError instanceof Error ? playError.message : String(playError));
    }
  };

  const togglePlaybackRef = useRef(togglePlayback);
  togglePlaybackRef.current = togglePlayback;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== "Space" && event.key !== " ") return;
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || tag === "BUTTON" || target?.isContentEditable) return;
      event.preventDefault();
      void togglePlaybackRef.current();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const seek = (value: number) => {
    engineRef.current.seek(value);
    flushTransportUi();
  };

  const setTrackMix = (trackId: string, patch: Partial<MixerState[string]>) => {
    setMixer((current) => ({
      ...current,
      [trackId]: {
        ...current[trackId],
        ...patch
      }
    }));
  };

  const changeTempo = (value: number) => {
    setTempoMultiplier(value);
    engineRef.current.setTempoMultiplier(value);
    flushTransportUi();
  };

  const restart = () => {
    engineRef.current.seek(0);
    flushTransportUi();
  };

  const goFullscreen = () => {
    void document.documentElement.requestFullscreen?.();
  };

  const progress = duration > 0 ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0;

  return (
    <main className="studio-shell">
      <Suspense fallback={<div className="visualizer-stage" aria-hidden />}>
        <VisualizerStage
          analyser={engineRef.current.analyserNode}
          activeSection={activeSection}
          intensity={visualIntensity}
          playing={playing}
        />
      </Suspense>

      <header className="topbar">
        <div className="topbar-brand">
          <p className="eyebrow">Agent-Written Music Studio</p>
          <label className="topbar-title-picker">
            <ListMusic size={20} aria-hidden strokeWidth={1.6} />
            <select
              value={selectedId}
              aria-label="Choose composition"
              onChange={(event) => setSelectedId(event.target.value)}
            >
              {songFiles.map((file) => (
                <option key={file.id} value={file.id}>
                  {file.title}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="topbar-meta" role="group" aria-label="Composition details">
          <span className="meta-chip">{song?.key ?? "—"}</span>
          <span className="meta-chip meta-chip-accent">
            <span className="meta-value">{song?.tempo ?? "—"}</span>
            <span className="meta-label">BPM</span>
          </span>
          <span className={`meta-chip meta-chip-flag${loopEnabled ? " meta-chip-flag-on" : ""}`}>
            {loopEnabled ? "Loop on" : "Loop off"}
          </span>
        </div>
      </header>

      <section className="transport-panel" aria-label="Playback controls">
        <div className="transport-main">
          <button className="primary-button" onClick={togglePlayback} disabled={!song} title={playing ? "Pause" : "Play"}>
            {playing ? <Pause size={24} /> : <Play size={24} />}
          </button>
          <button className="icon-button" onClick={restart} disabled={!song} title="Restart">
            <SkipBack size={18} />
          </button>
        </div>
        <div className="transport-readout">
          <div className="transport-copy">
            <strong>{activeSection?.name ?? song?.sections[0]?.name ?? "Ready"}</strong>
            <span>{playing ? "Playing" : "Paused"} · {formatTime(currentTime)} / {formatTime(duration)}</span>
          </div>
          <div className="timeline" style={{ "--progress": `${progress}%` } as CSSProperties}>
            <span>{formatTime(currentTime)}</span>
          <input
            type="range"
            min={0}
            max={Math.max(0.01, duration)}
            step={0.01}
            value={Math.min(currentTime, duration)}
            onChange={(event) => seek(Number(event.target.value))}
          />
            <span>{formatTime(duration)}</span>
          </div>
        </div>
        <div className="transport-actions">
          <button
            className={loopEnabled ? "icon-button active" : "icon-button"}
            onClick={() => setLoopEnabled((value) => !value)}
            title={loopEnabled ? "Loop on" : "Loop off"}
          >
            <Repeat size={18} />
          </button>
          <button className="icon-button" onClick={goFullscreen} title="Fullscreen">
            <Expand size={18} />
          </button>
        </div>
      </section>

      <aside className="left-rail">
        <div className="rail-title">
          <Headphones size={17} />
          <span>{song?.key ?? "Key"} · {song?.tempo ?? 0} BPM</span>
        </div>
        <div className="section-list">
          {song?.sections.map((section) => (
            <button
              key={section.id}
              className={activeSection?.id === section.id ? "section-row active" : "section-row"}
              onClick={() => seek(sectionStart(song, section.id, tempoMultiplier))}
            >
              <span>{section.name}</span>
              <small>{formatTime(musicalTimeToSeconds(section.duration, song, tempoMultiplier))}</small>
            </button>
          ))}
        </div>
        {error && <pre className="error-box">{error}</pre>}
      </aside>

      <aside className={mixerOpen ? "right-mixer" : "right-mixer collapsed"}>
        <button
          className="mixer-toggle"
          onClick={() => setMixerOpen((value) => !value)}
          title={mixerOpen ? "Hide mixer" : "Show mixer"}
        >
          {mixerOpen ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
        {mixerOpen && (<>
        <div className="rail-title">
          <SlidersHorizontal size={17} />
          <span>Mixer</span>
        </div>
        <label className="slider-row">
          <span><Volume2 size={15} /> Master</span>
          <input
            type="range"
            min={0}
            max={1.2}
            step={0.01}
            value={masterVolume}
            onChange={(event) => setMasterVolume(Number(event.target.value))}
          />
        </label>
        <label className="slider-row">
          <span><Gauge size={15} /> Tempo</span>
          <input
            type="range"
            min={0.5}
            max={1.5}
            step={0.01}
            value={tempoMultiplier}
            onChange={(event) => changeTempo(Number(event.target.value))}
          />
        </label>
        <label className="slider-row">
          <span><Gauge size={15} /> Visuals</span>
          <input
            type="range"
            min={0.2}
            max={1.8}
            step={0.01}
            value={visualIntensity}
            onChange={(event) => setVisualIntensity(Number(event.target.value))}
          />
        </label>
        <div className="track-list">
          {song?.tracks.map((track) => {
            const mix = mixer[track.id] ?? { volume: 1, muted: false, solo: false };
            return (
              <div className="track-row" key={track.id}>
                <div>
                  <strong>{track.name}</strong>
                  <small>{track.instrument.replace(/_/g, " ")}</small>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1.4}
                  step={0.01}
                  value={mix.volume}
                  onChange={(event) => setTrackMix(track.id, { volume: Number(event.target.value) })}
                />
                <button
                  className={mix.muted ? "mini-button active" : "mini-button"}
                  onClick={() => setTrackMix(track.id, { muted: !mix.muted })}
                  title="Mute"
                >
                  <VolumeX size={14} />
                </button>
                <button
                  className={mix.solo ? "mini-button active" : "mini-button"}
                  onClick={() => setTrackMix(track.id, { solo: !mix.solo })}
                >
                  S
                </button>
              </div>
            );
          })}
        </div>
        </>)}
      </aside>
    </main>
  );
}

function sectionStart(song: Song, sectionId: string, tempoMultiplier: number) {
  const section = song.sections.find((item) => item.id === sectionId);
  return section ? musicalTimeToSeconds(section.start, song, tempoMultiplier) : 0;
}

function formatTime(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remaining = Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0");
  return `${minutes}:${remaining}`;
}