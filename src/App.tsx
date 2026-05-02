import { useEffect, useMemo, useRef, useState } from "react";
import {
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
import VisualizerStage from "./components/VisualizerStage";
import { AudioEngine } from "./music/AudioEngine";
import { loadSong, songFiles } from "./music/songLoader";
import { musicalTimeToSeconds, songDuration } from "./music/timing";
import type { MixerState, Section, Song } from "./types";

export default function App() {
  const engineRef = useRef(new AudioEngine());
  const [selectedId, setSelectedId] = useState(songFiles[0]?.id ?? "");
  const [song, setSong] = useState<Song | null>(null);
  const [error, setError] = useState("");
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [activeSection, setActiveSection] = useState<Section | undefined>();
  const [mixer, setMixer] = useState<MixerState>({});
  const [masterVolume, setMasterVolume] = useState(0.86);
  const [tempoMultiplier, setTempoMultiplier] = useState(1);
  const [loopSectionId, setLoopSectionId] = useState("");
  const [visualIntensity, setVisualIntensity] = useState(1);

  const selectedFile = useMemo(() => songFiles.find((file) => file.id === selectedId), [selectedId]);

  useEffect(() => {
    if (!selectedFile) return;
    let alive = true;
    setError("");
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
        setDuration(songDuration(loaded) / tempoMultiplier);
        setCurrentTime(0);
        setPlaying(false);
        setLoopSectionId("");
        engineRef.current.loadSong(loaded, nextMixer, tempoMultiplier);
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
    engineRef.current.setLoopSection(loopSectionId || undefined);
  }, [loopSectionId]);

  const tick = () => {
    const engine = engineRef.current;
    setCurrentTime(engine.currentTime);
    setDuration(engine.duration);
    setActiveSection(engine.activeSection);
  };

  const togglePlayback = async () => {
    if (!song) return;
    const engine = engineRef.current;
    if (playing) {
      engine.pause();
      setPlaying(false);
      tick();
      return;
    }

    await engine.play(tick);
    setPlaying(true);
    tick();
  };

  const seek = (value: number) => {
    engineRef.current.seek(value);
    setCurrentTime(value);
    tick();
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
    tick();
  };

  const restart = () => {
    engineRef.current.seek(loopSectionId && song ? sectionStart(song, loopSectionId, tempoMultiplier) : 0);
    tick();
  };

  const goFullscreen = () => {
    void document.documentElement.requestFullscreen?.();
  };

  return (
    <main className="studio-shell">
      <VisualizerStage
        analyser={engineRef.current.analyserNode}
        activeSection={activeSection}
        intensity={visualIntensity}
        playing={playing}
      />

      <header className="topbar">
        <div>
          <p className="eyebrow">Agent-Written Music Studio</p>
          <h1>{song?.title ?? "No song loaded"}</h1>
        </div>
        <label className="song-picker">
          <ListMusic size={18} />
          <select value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>
            {songFiles.map((file) => (
              <option key={file.id} value={file.id}>
                {file.title}
              </option>
            ))}
          </select>
        </label>
      </header>

      <section className="transport-panel" aria-label="Playback controls">
        <button className="primary-button" onClick={togglePlayback} disabled={!song}>
          {playing ? <Pause size={22} /> : <Play size={22} />}
        </button>
        <button className="icon-button" onClick={restart} disabled={!song} title="Restart">
          <SkipBack size={18} />
        </button>
        <div className="timeline">
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
        <label className="compact-control">
          <Repeat size={16} />
          <select value={loopSectionId} onChange={(event) => setLoopSectionId(event.target.value)}>
            <option value="">No loop</option>
            {song?.sections.map((section) => (
              <option key={section.id} value={section.id}>
                {section.name}
              </option>
            ))}
          </select>
        </label>
        <button className="icon-button" onClick={goFullscreen} title="Fullscreen">
          <Expand size={18} />
        </button>
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
              <small>{section.scene}</small>
            </button>
          ))}
        </div>
        {error && <pre className="error-box">{error}</pre>}
      </aside>

      <aside className="right-mixer">
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
