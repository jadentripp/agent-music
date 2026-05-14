import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { Section, TrackRole, VisualEvent, VisualSyncFrame, VisualSyncSource } from "../types";

type VisualizerStageProps = {
  syncSource?: VisualSyncSource;
  analyser?: AnalyserNode;
  activeSection?: Section;
  intensity: number;
  playing: boolean;
};

type AudioBands = {
  bass: number;
  mids: number;
  highs: number;
  rms: number;
  centroid: number;
  dynamics: number;
  sparse: number;
};

type RoleLevels = Record<TrackRole, number>;

type EventEnergy = {
  kick: number;
  snare: number;
  hats: number;
  bass: number;
  harmony: number;
  lead: number;
  impact: number;
};

type RippleKind = "kick" | "snare" | "hat" | "tonal";

type RippleState = {
  id: string;
  origin: THREE.Vector2;
  age: number;
  strength: number;
  speed: number;
  width: number;
  seed: number;
  kind: RippleKind;
};

type ChromeGlob = {
  group: THREE.Group;
  core: THREE.Mesh<THREE.SphereGeometry, THREE.MeshPhysicalMaterial>;
  reflection: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  waterline: THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>;
  home: THREE.Vector3;
  radius: number;
  role: TrackRole;
  seed: number;
};

type LightStrip = {
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
};

type TrailLine = {
  line: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  positions: Float32Array;
};

type CausticPoints = {
  points: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;
  basePositions: Float32Array;
  positions: Float32Array;
  seeds: Float32Array;
};

const roleNames: TrackRole[] = ["drums", "bass", "harmony", "lead", "counterline", "texture", "pad", "ear_candy", "custom"];
const maxShaderRipples = 30;
const maxRippleMeshes = 58;
const maxFlashStrips = 26;
const maxLeadTrails = 34;
const trailPointCount = 28;
const causticPointCount = 720;
const tau = Math.PI * 2;

const scratchVector = new THREE.Vector3();
const scratchVectorB = new THREE.Vector3();
const scratchVector2 = new THREE.Vector2();
const scratchColor = new THREE.Color();
const cameraTarget = new THREE.Vector3(0, 0.08, -0.72);

export default function VisualizerStage({ syncSource, analyser, activeSection, intensity, playing }: VisualizerStageProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const stateRef = useRef({ syncSource, analyser, activeSection, intensity, playing });

  useEffect(() => {
    stateRef.current = { syncSource, analyser, activeSection, intensity, playing };
  }, [syncSource, analyser, activeSection, intensity, playing]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
    renderer.setClearColor("#e4eff7", 1);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, reducedMotion ? 1.2 : 1.85));
    renderer.setSize(Math.max(1, mount.clientWidth), Math.max(1, mount.clientHeight));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.18;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#e4eff7");
    scene.fog = new THREE.Fog("#e4eff7", 10, 25);

    const environmentTexture = createChromeEnvironmentTexture();
    const backdropTexture = createBackdropTexture();
    scene.environment = environmentTexture;

    const camera = new THREE.PerspectiveCamera(43, 1, 0.1, 80);
    const cameraBase = new THREE.Vector3(0, 4.7, 7.8);
    camera.position.copy(cameraBase);
    camera.lookAt(cameraTarget);

    const studio = new THREE.Group();
    scene.add(studio);

    const backdrop = new THREE.Mesh(
      new THREE.PlaneGeometry(25, 12),
      new THREE.MeshBasicMaterial({ map: backdropTexture, color: "#ffffff", fog: false })
    );
    backdrop.position.set(0, 3.15, -6.6);
    studio.add(backdrop);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(28, 24),
      new THREE.MeshStandardMaterial({
        color: "#f5f8fb",
        metalness: 0.22,
        roughness: 0.32,
        envMapIntensity: 1.25
      })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, -0.08, -0.4);
    floor.receiveShadow = true;
    studio.add(floor);

    const waterGeometry = new THREE.PlaneGeometry(18, 15, 188, 150);
    const waterMaterial = createWaterMaterial();
    const water = new THREE.Mesh(waterGeometry, waterMaterial);
    water.rotation.x = -Math.PI / 2;
    water.position.y = 0.005;
    water.frustumCulled = false;
    studio.add(water);

    const rippleGeometry = new THREE.RingGeometry(0.98, 1.012, 128);
    const rippleMeshes = createRippleMeshes(maxRippleMeshes, rippleGeometry);
    for (const ripple of rippleMeshes) studio.add(ripple.mesh);

    const flashGeometry = new THREE.PlaneGeometry(1, 1);
    const flashStrips = createFlashStripPool(maxFlashStrips, flashGeometry);
    for (const strip of flashStrips) studio.add(strip.mesh);

    const trails = createLeadTrailPool(maxLeadTrails);
    for (const trail of trails) studio.add(trail.line);

    const caustics = createCausticPoints(causticPointCount);
    studio.add(caustics.points);

    const globs = createChromeGlobs();
    for (const glob of globs) studio.add(glob.group);

    const hemiLight = new THREE.HemisphereLight("#ffffff", "#bed0dc", 2.65);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight("#ffffff", 4.2);
    keyLight.position.set(-3.8, 7.4, 4.8);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(1024, 1024);
    scene.add(keyLight);

    const rimLight = new THREE.PointLight("#d9f7ff", 25, 18, 1.85);
    rimLight.position.set(4.5, 3.4, 2.2);
    scene.add(rimLight);

    const lowChromeLight = new THREE.PointLight("#ffffff", 18, 14, 2);
    lowChromeLight.position.set(-4.5, 1.2, -3.2);
    scene.add(lowChromeLight);

    const frequencyData = new Uint8Array(1024);
    const timeData = new Uint8Array(1024);
    const bands: AudioBands = { bass: 0.035, mids: 0.035, highs: 0.03, rms: 0.02, centroid: 0.36, dynamics: 0.12, sparse: 0.9 };
    const roleLevels = createRoleLevels();
    const targetRoleLevels = createRoleLevels();
    const eventEnergy: EventEnergy = { kick: 0, snare: 0, hats: 0, bass: 0, harmony: 0, lead: 0, impact: 0 };
    const targetEventEnergy: EventEnergy = { kick: 0, snare: 0, hats: 0, bass: 0, harmony: 0, lead: 0, impact: 0 };
    const ripples: RippleState[] = [];
    const seenEvents = new Map<string, number>();
    let raf = 0;
    let lastFrame = 0;
    let lastSongTime = 0;
    let lastBeatIndex = -1;
    let renderingSuspended = false;

    const render = (timeMs: number) => {
      if (renderingSuspended) return;

      const { syncSource: liveSyncSource, analyser: liveAnalyser, activeSection: propSection, intensity: visualIntensity, playing: propPlaying } = stateRef.current;
      const frame = liveSyncSource?.getVisualSyncFrame() ?? emptyFrame(propPlaying, propSection);
      const playingNow = frame.playing || propPlaying;
      const time = timeMs * 0.001;
      const dt = lastFrame ? Math.min(0.05, Math.max(0.001, (timeMs - lastFrame) / 1000)) : 1 / 60;
      lastFrame = timeMs;

      if (frame.time + 0.18 < lastSongTime || !playingNow) {
        seenEvents.clear();
        lastBeatIndex = -1;
      }
      lastSongTime = frame.time;

      let next = idleAudioFeatures(playingNow);
      if (liveAnalyser) {
        liveAnalyser.getByteFrequencyData(frequencyData);
        liveAnalyser.getByteTimeDomainData(timeData);
        next = analyzeAudio(frequencyData, timeData, playingNow);
      }

      const smoothing = playingNow ? 7.2 : 3.2;
      bands.bass = THREE.MathUtils.damp(bands.bass, next.bass, smoothing, dt);
      bands.mids = THREE.MathUtils.damp(bands.mids, next.mids, smoothing, dt);
      bands.highs = THREE.MathUtils.damp(bands.highs, next.highs, smoothing, dt);
      bands.rms = THREE.MathUtils.damp(bands.rms, next.rms, smoothing, dt);
      bands.centroid = THREE.MathUtils.damp(bands.centroid, next.centroid, 3.4, dt);
      bands.dynamics = THREE.MathUtils.damp(bands.dynamics, next.dynamics, 4.4, dt);
      bands.sparse = THREE.MathUtils.damp(bands.sparse, next.sparse, 4.2, dt);

      writeRoleLevels(frame, roleLevels, targetRoleLevels, dt);
      writeEventEnergy(frame, targetEventEnergy);
      dampEventEnergy(eventEnergy, targetEventEnergy, frame.playing ? 13 : 5.5, dt);

      const motionScale = reducedMotion ? 0.3 : 1;
      if (playingNow) {
        spawnEventRipples(frame, ripples, seenEvents, visualIntensity, reducedMotion);
        const beatIndex = Math.floor(frame.beat);
        if (beatIndex !== lastBeatIndex && frame.beatPulse > 0.02) {
          lastBeatIndex = beatIndex;
          const beatStrength = THREE.MathUtils.clamp(0.18 + eventEnergy.impact * 0.72 + bands.bass * 0.38, 0.18, 1.15);
          if (beatStrength > 0.22) addClockRipple(ripples, frame, beatStrength * visualIntensity);
        }
      }

      updateRippleMeshes(ripples, rippleMeshes, dt, visualIntensity, motionScale);
      updateWaterMaterial(waterMaterial, frame, bands, roleLevels, eventEnergy, visualIntensity, time, ripples, motionScale);
      updateGlobs(globs, frame, bands, roleLevels, eventEnergy, visualIntensity, time, dt, motionScale);
      updateFlashStrips(flashStrips, frame, visualIntensity, motionScale);
      updateLeadTrails(trails, frame, bands, visualIntensity, time, motionScale);
      updateCaustics(caustics, bands, eventEnergy, visualIntensity, time, motionScale);

      studio.position.y = THREE.MathUtils.damp(studio.position.y, -eventEnergy.kick * 0.035 * motionScale, 5.6, dt);
      studio.rotation.y = THREE.MathUtils.damp(studio.rotation.y, Math.sin(time * 0.12 + frame.bar * 0.03) * 0.012 * motionScale, 2.8, dt);

      const cameraFloat = Math.sin(time * 0.18) * 0.06 * motionScale;
      camera.position.x = THREE.MathUtils.damp(
        camera.position.x,
        cameraBase.x + Math.sin(frame.sectionProgress * tau + time * 0.08) * 0.14 * motionScale,
        2.2,
        dt
      );
      camera.position.y = THREE.MathUtils.damp(camera.position.y, cameraBase.y + cameraFloat - eventEnergy.impact * 0.035 * motionScale, 1.4, dt);
      camera.position.z = THREE.MathUtils.damp(camera.position.z, cameraBase.z + Math.cos(time * 0.11) * 0.045 * motionScale, 1.4, dt);
      camera.lookAt(cameraTarget);

      rimLight.intensity = 18 + bands.highs * 28 + eventEnergy.snare * 18 + eventEnergy.hats * 11;
      lowChromeLight.intensity = 12 + bands.bass * 22 + eventEnergy.kick * 22;
      renderer.toneMappingExposure = 0.92 + visualIntensity * 0.04 + bands.rms * 0.44 + eventEnergy.snare * 0.07 + eventEnergy.hats * 0.035;

      renderer.render(scene, camera);
      raf = window.requestAnimationFrame(render);
    };

    const resize = () => {
      const width = Math.max(1, mount.clientWidth);
      const height = Math.max(1, mount.clientHeight);
      const aspect = width / height;
      camera.aspect = aspect;
      camera.fov = aspect < 0.75 ? 51 : 43;
      cameraBase.set(aspect < 0.75 ? 0.1 : 0, aspect < 0.75 ? 5.75 : 4.7, aspect < 0.75 ? 9.4 : 7.8);
      camera.position.copy(cameraBase);
      camera.lookAt(cameraTarget);
      camera.updateProjectionMatrix();
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, reducedMotion ? 1.2 : 1.85));
      renderer.setSize(width, height, false);
    };

    const resizeObserver = typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : undefined;
    resizeObserver?.observe(mount);
    window.addEventListener("resize", resize);

    const onContextLost = (event: Event) => {
      event.preventDefault();
      renderingSuspended = true;
      window.cancelAnimationFrame(raf);
    };
    const onContextRestored = () => {
      renderingSuspended = false;
      lastFrame = 0;
      resize();
      raf = window.requestAnimationFrame(render);
    };
    renderer.domElement.addEventListener("webglcontextlost", onContextLost);
    renderer.domElement.addEventListener("webglcontextrestored", onContextRestored);

    resize();
    raf = window.requestAnimationFrame(render);

    return () => {
      renderingSuspended = true;
      window.cancelAnimationFrame(raf);
      resizeObserver?.disconnect();
      window.removeEventListener("resize", resize);
      renderer.domElement.removeEventListener("webglcontextlost", onContextLost);
      renderer.domElement.removeEventListener("webglcontextrestored", onContextRestored);
      waterGeometry.dispose();
      waterMaterial.dispose();
      rippleGeometry.dispose();
      disposeLightStrips(rippleMeshes);
      flashGeometry.dispose();
      disposeLightStrips(flashStrips);
      disposeLeadTrails(trails);
      disposeChromeGlobs(globs);
      caustics.points.geometry.dispose();
      caustics.points.material.dispose();
      floor.geometry.dispose();
      floor.material.dispose();
      backdrop.geometry.dispose();
      backdrop.material.dispose();
      environmentTexture.dispose();
      backdropTexture.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, []);

  return <div className="visualizer-stage" ref={mountRef} />;
}

function createWaterMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uIntensity: { value: 1 },
      uMotion: { value: 1 },
      uBass: { value: 0 },
      uMids: { value: 0 },
      uHighs: { value: 0 },
      uRms: { value: 0 },
      uCentroid: { value: 0.36 },
      uKick: { value: 0 },
      uSnare: { value: 0 },
      uHats: { value: 0 },
      uHarmony: { value: 0 },
      uLead: { value: 0 },
      uBeatPulse: { value: 0 },
      uBarPulse: { value: 0 },
      uRipples: { value: Array.from({ length: maxShaderRipples }, () => new THREE.Vector4(0, 0, 99, 0)) }
    },
    vertexShader: `
      uniform float uTime;
      uniform float uIntensity;
      uniform float uMotion;
      uniform float uBass;
      uniform float uMids;
      uniform float uHighs;
      uniform float uKick;
      uniform float uSnare;
      uniform float uHats;
      uniform float uHarmony;
      uniform float uLead;
      uniform float uBeatPulse;
      uniform float uBarPulse;
      uniform vec4 uRipples[${maxShaderRipples}];

      varying vec2 vSurfacePosition;
      varying vec3 vWorldPosition;
      varying float vWave;
      varying float vRingGlow;

      void main() {
        vec3 transformed = position;
        vec2 p = position.xy;
        float slow = uTime * (0.24 + uMotion * 0.18);
        float viscosity = 1.0 + uHarmony * 0.8 + uMids * 0.32;
        float wave =
          sin(p.x * 0.78 + slow * 1.8) * (0.024 + uBass * 0.07) +
          sin(p.y * 0.9 - slow * 1.35) * (0.02 + uHarmony * 0.048) +
          sin((p.x + p.y) * 3.2 + uTime * (0.68 + uLead * 0.35)) * (0.012 + uHighs * 0.03) +
          sin(length(p + vec2(0.4, -0.2)) * 4.8 - uTime * 1.25) * (0.008 + uMids * 0.018);

        float ringGlow = 0.0;
        for (int i = 0; i < ${maxShaderRipples}; i++) {
          vec4 drop = uRipples[i];
          if (drop.w > 0.001) {
            float dist = length(p - drop.xy);
            float radius = drop.z * (1.72 + drop.w * 0.22);
            float band = dist - radius;
            float width = 2.6 + drop.w * 2.8;
            float envelope = exp(-(band * band) * width) * exp(-drop.z * (0.58 + viscosity * 0.1));
            float crest = sin(band * (18.0 + drop.w * 4.0));
            wave += crest * envelope * drop.w * (0.82 + uMotion * 0.18);
            ringGlow += envelope * drop.w;
          }
        }

        float snap = uKick * sin(length(p) * 3.6 - uTime * 4.2) * 0.045;
        float chatter = uHats * sin((p.x - p.y) * 16.0 + uTime * 8.0) * 0.018;
        transformed.z += (wave + snap + chatter) * (0.2 + uIntensity * 0.17);

        vSurfacePosition = p;
        vWave = wave;
        vRingGlow = ringGlow;
        vec4 world = modelMatrix * vec4(transformed, 1.0);
        vWorldPosition = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: `
      precision highp float;
      uniform float uTime;
      uniform float uIntensity;
      uniform float uBass;
      uniform float uMids;
      uniform float uHighs;
      uniform float uRms;
      uniform float uCentroid;
      uniform float uKick;
      uniform float uSnare;
      uniform float uHats;
      uniform float uHarmony;
      uniform float uLead;
      uniform float uBeatPulse;
      uniform float uBarPulse;

      varying vec2 vSurfacePosition;
      varying vec3 vWorldPosition;
      varying float vWave;
      varying float vRingGlow;

      float hash(vec2 p) {
        p = fract(p * vec2(123.34, 456.21));
        p += dot(p, p + 45.32);
        return fract(p.x * p.y);
      }

      void main() {
        vec3 viewDir = normalize(cameraPosition - vWorldPosition);
        vec3 normalish = normalize(vec3(-dFdx(vWave) * 5.0, 1.0, -dFdy(vWave) * 5.0));
        float facing = clamp(dot(viewDir, normalish), 0.0, 1.0);
        float fresnel = pow(1.0 - facing, 2.25);
        float foreground = smoothstep(-5.6, 5.8, vWorldPosition.z);
        float farWater = 1.0 - foreground;
        float basin = smoothstep(8.2, 1.0, length(vSurfacePosition * vec2(0.84, 1.08)));
        float chromeBand = 0.5 + 0.5 * sin(vWorldPosition.z * 1.45 + vWorldPosition.x * 0.46 + uTime * 0.16);
        float razorBand = smoothstep(0.955, 1.0, sin(vWorldPosition.x * 2.7 - vWorldPosition.z * 0.55 + uTime * 0.55) * 0.5 + 0.5);
        float waveContour = smoothstep(0.82, 1.0, sin(vSurfacePosition.x * 2.15 + vSurfacePosition.y * 3.4 + vWave * 32.0 + uTime * 0.6) * 0.5 + 0.5);
        float crossContour = smoothstep(0.9, 1.0, sin(vSurfacePosition.x * -4.8 + vSurfacePosition.y * 2.2 - uTime * 0.42) * 0.5 + 0.5);
        float caustic = smoothstep(0.84, 1.0, sin((vSurfacePosition.x + vSurfacePosition.y) * 5.8 + vWave * 28.0 + uTime * (0.9 + uHighs)) * 0.5 + 0.5);
        float glitter = step(0.988 - uHats * 0.018 - uHighs * 0.012, hash(floor((vSurfacePosition + uTime * 0.035) * 38.0)));

        vec3 deepWater = vec3(0.42, 0.62, 0.75);
        vec3 blueGlass = vec3(0.64, 0.83, 0.94);
        vec3 surfaceMilk = vec3(0.88, 0.96, 0.99);
        vec3 mirror = vec3(1.0, 0.995, 0.98);
        vec3 silver = vec3(0.55, 0.64, 0.72);
        vec3 ice = vec3(0.48, 0.82, 1.0);

        vec3 color = mix(deepWater, blueGlass, farWater * 0.5 + basin * 0.28);
        color = mix(color, surfaceMilk, foreground * 0.24 + facing * 0.14);
        color = mix(color, mirror, fresnel * (0.32 + chromeBand * 0.18));
        color = mix(color, silver, (1.0 - basin) * 0.16 + chromeBand * 0.06);
        color += vec3(0.12, 0.36, 0.5) * (waveContour * 0.12 + crossContour * 0.055) * (0.5 + farWater);
        color += mirror * razorBand * (0.06 + uSnare * 0.14 + uLead * 0.05);
        color += ice * (vRingGlow * (0.38 + uIntensity * 0.18) + caustic * (0.06 + uHighs * 0.13 + uHarmony * 0.075));
        color += vec3(1.0) * glitter * (0.035 + uHats * 0.22 + uHighs * 0.11);
        color += vec3(0.7, 0.9, 1.0) * (uKick * 0.05 + uBarPulse * 0.028 + uBeatPulse * 0.02);
        color *= 0.74 + basin * 0.12 + farWater * 0.16 + uRms * 0.18 + uIntensity * 0.025;

        gl_FragColor = vec4(color, 1.0);
      }
    `
  });
}

function createChromeEnvironmentTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 512;
  const context = canvas.getContext("2d");
  if (context) {
    const sky = context.createLinearGradient(0, 0, 0, canvas.height);
    sky.addColorStop(0, "#ffffff");
    sky.addColorStop(0.32, "#e5eef6");
    sky.addColorStop(0.5, "#aebdca");
    sky.addColorStop(0.56, "#ffffff");
    sky.addColorStop(1, "#d9e4ec");
    context.fillStyle = sky;
    context.fillRect(0, 0, canvas.width, canvas.height);

    for (let i = 0; i < 12; i += 1) {
      const y = 120 + i * 22;
      const alpha = i % 2 === 0 ? 0.34 : 0.16;
      context.fillStyle = `rgba(255, 255, 255, ${alpha})`;
      context.fillRect(0, y, canvas.width, 5 + (i % 3) * 3);
    }

    context.strokeStyle = "rgba(104, 136, 158, 0.34)";
    context.lineWidth = 2;
    for (let i = 0; i < 7; i += 1) {
      context.beginPath();
      context.ellipse(512, 278, 180 + i * 85, 34 + i * 22, 0, 0, tau);
      context.stroke();
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.needsUpdate = true;
  return texture;
}

function createBackdropTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 640;
  const context = canvas.getContext("2d");
  if (context) {
    const gradient = context.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, "#ffffff");
    gradient.addColorStop(0.5, "#eaf2f8");
    gradient.addColorStop(1, "#b9c7d2");
    context.fillStyle = gradient;
    context.fillRect(0, 0, canvas.width, canvas.height);

    context.fillStyle = "rgba(255, 255, 255, 0.65)";
    context.fillRect(0, 260, canvas.width, 44);
    context.fillStyle = "rgba(110, 132, 150, 0.16)";
    context.fillRect(0, 302, canvas.width, 8);

    const paneGradient = context.createLinearGradient(0, 120, canvas.width, 520);
    paneGradient.addColorStop(0, "rgba(255, 255, 255, 0.38)");
    paneGradient.addColorStop(0.5, "rgba(150, 178, 196, 0.12)");
    paneGradient.addColorStop(1, "rgba(255, 255, 255, 0.24)");
    context.fillStyle = paneGradient;
    context.fillRect(0, 318, canvas.width, 126);

    for (let i = 0; i < 10; i += 1) {
      const x = 80 + i * 118;
      context.strokeStyle = i % 2 === 0 ? "rgba(255,255,255,0.5)" : "rgba(118,140,154,0.18)";
      context.lineWidth = i % 2 === 0 ? 2 : 1;
      context.beginPath();
      context.moveTo(x, 72);
      context.lineTo(x - 170, canvas.height);
      context.stroke();
    }

    for (let i = 0; i < 7; i += 1) {
      const y = 112 + i * 58;
      context.strokeStyle = i % 2 === 0 ? "rgba(255,255,255,0.48)" : "rgba(118,140,154,0.15)";
      context.lineWidth = 1.5;
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(canvas.width, y - 18);
      context.stroke();
    }

    context.strokeStyle = "rgba(120, 154, 178, 0.2)";
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(170, 440);
    context.lineTo(420, 372);
    context.lineTo(760, 390);
    context.lineTo(1034, 336);
    context.lineTo(1110, 386);
    context.lineTo(780, 466);
    context.lineTo(430, 448);
    context.closePath();
    context.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function createRippleMeshes(count: number, geometry: THREE.RingGeometry): LightStrip[] {
  return Array.from({ length: count }, () => {
    const material = new THREE.MeshBasicMaterial({
      color: "#2aa6d6",
      transparent: true,
      opacity: 0,
      depthWrite: false,
      depthTest: false,
      side: THREE.DoubleSide
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.visible = false;
    mesh.frustumCulled = false;
    return { mesh };
  });
}

function createFlashStripPool(count: number, geometry: THREE.PlaneGeometry): LightStrip[] {
  return Array.from({ length: count }, () => {
    const material = new THREE.MeshBasicMaterial({
      color: "#ffffff",
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.visible = false;
    mesh.frustumCulled = false;
    return { mesh };
  });
}

function createLeadTrailPool(count: number): TrailLine[] {
  return Array.from({ length: count }, () => {
    const positions = new Float32Array(trailPointCount * 3);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setDrawRange(0, 0);
    const material = new THREE.LineBasicMaterial({
      color: "#f8fdff",
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const line = new THREE.Line(geometry, material);
    line.visible = false;
    line.frustumCulled = false;
    return { line, positions };
  });
}

function createCausticPoints(count: number): CausticPoints {
  const basePositions = new Float32Array(count * 3);
  const positions = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  for (let i = 0; i < count; i += 1) {
    const seed = seededUnit(`caustic-${i}`);
    const seedB = seededUnit(`caustic-b-${i}`);
    const seedC = seededUnit(`caustic-c-${i}`);
    basePositions[i * 3] = (seed - 0.5) * 15.6;
    basePositions[i * 3 + 1] = 0.045 + seedC * 0.08;
    basePositions[i * 3 + 2] = (seedB - 0.5) * 11.8 - 0.55;
    positions[i * 3] = basePositions[i * 3];
    positions[i * 3 + 1] = basePositions[i * 3 + 1];
    positions[i * 3 + 2] = basePositions[i * 3 + 2];
    seeds[i] = seed;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    color: "#ffffff",
    size: 0.034,
    transparent: true,
    opacity: 0.28,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  return { points, basePositions, positions, seeds };
}

function createChromeGlobs(): ChromeGlob[] {
  const sphereGeometry = new THREE.SphereGeometry(1, 64, 36);
  const torusGeometry = new THREE.TorusGeometry(1, 0.018, 14, 128);
  const chromeMaterial = new THREE.MeshPhysicalMaterial({
    color: "#fbfdff",
    metalness: 1,
    roughness: 0.055,
    clearcoat: 1,
    clearcoatRoughness: 0.02,
    envMapIntensity: 2.7
  });
  const glassMaterial = new THREE.MeshPhysicalMaterial({
    color: "#e9fbff",
    metalness: 0.05,
    roughness: 0.02,
    transmission: 0.54,
    thickness: 0.8,
    transparent: true,
    opacity: 0.66,
    clearcoat: 1,
    clearcoatRoughness: 0.015,
    envMapIntensity: 2.35
  });
  const reflectionMaterial = new THREE.MeshBasicMaterial({
    color: "#d9f7ff",
    transparent: true,
    opacity: 0.16,
    depthWrite: false
  });
  const waterlineMaterial = new THREE.MeshBasicMaterial({
    color: "#62d4ff",
    transparent: true,
    opacity: 0.56,
    depthWrite: false,
    depthTest: false,
    side: THREE.DoubleSide
  });

  const specs: Array<{ x: number; y: number; z: number; radius: number; role: TrackRole; glass?: boolean; seed: number }> = [
    { x: -3.95, y: 0.02, z: -1.65, radius: 1.08, role: "bass", seed: 0.12 },
    { x: 2.95, y: 0.1, z: -1.2, radius: 0.88, role: "harmony", glass: true, seed: 0.28 },
    { x: 0.25, y: 0.18, z: -3.05, radius: 1.34, role: "lead", seed: 0.44 },
    { x: -1.65, y: 0.0, z: 1.15, radius: 0.72, role: "drums", glass: true, seed: 0.63 },
    { x: 4.35, y: 0.05, z: 1.2, radius: 0.62, role: "ear_candy", seed: 0.77 },
    { x: -5.25, y: 0.06, z: 1.72, radius: 0.54, role: "texture", glass: true, seed: 0.91 },
    { x: 1.48, y: 0.08, z: 2.35, radius: 0.5, role: "counterline", seed: 0.36 },
    { x: -0.8, y: 0.12, z: -0.45, radius: 0.42, role: "pad", glass: true, seed: 0.55 }
  ];

  return specs.map((spec) => {
    const group = new THREE.Group();
    group.position.set(spec.x, 0, spec.z);
    const material = spec.glass ? glassMaterial.clone() : chromeMaterial.clone();
    const core = new THREE.Mesh(sphereGeometry, material);
    core.position.y = spec.y + spec.radius * 0.58;
    core.scale.setScalar(spec.radius);
    core.castShadow = true;
    core.receiveShadow = true;

    const reflection = new THREE.Mesh(sphereGeometry, reflectionMaterial.clone());
    reflection.position.y = 0.018;
    reflection.scale.set(spec.radius * 1.05, spec.radius * 0.04, spec.radius * 0.56);

    const waterline = new THREE.Mesh(torusGeometry, waterlineMaterial.clone());
    waterline.rotation.x = Math.PI / 2;
    waterline.position.y = 0.045;
    waterline.scale.setScalar(spec.radius * 0.86);

    group.add(reflection, core, waterline);
    return {
      group,
      core,
      reflection,
      waterline,
      home: new THREE.Vector3(spec.x, spec.y, spec.z),
      radius: spec.radius,
      role: spec.role,
      seed: spec.seed
    };
  });
}

function disposeLightStrips(pool: LightStrip[]) {
  for (const item of pool) item.mesh.material.dispose();
}

function disposeLeadTrails(pool: TrailLine[]) {
  for (const trail of pool) {
    trail.line.geometry.dispose();
    trail.line.material.dispose();
  }
}

function disposeChromeGlobs(globs: ChromeGlob[]) {
  const geometries = new Set<THREE.BufferGeometry>();
  for (const glob of globs) {
    geometries.add(glob.core.geometry);
    geometries.add(glob.reflection.geometry);
    geometries.add(glob.waterline.geometry);
    glob.core.material.dispose();
    glob.reflection.material.dispose();
    glob.waterline.material.dispose();
  }
  for (const geometry of geometries) geometry.dispose();
}

function spawnEventRipples(
  frame: VisualSyncFrame,
  ripples: RippleState[],
  seenEvents: Map<string, number>,
  intensity: number,
  reducedMotion: boolean
) {
  for (const [id, time] of seenEvents) {
    if (Math.abs(frame.time - time) > 18) seenEvents.delete(id);
  }

  for (const event of frame.events) {
    if (!event.recent || event.timeDelta > 0 || -event.timeDelta > (reducedMotion ? 0.12 : 0.2)) continue;
    if (seenEvents.has(event.id)) continue;
    seenEvents.set(event.id, frame.time);

    eventWaterPosition(scratchVector2, event, frame);
    const strength = eventStrength(event) * THREE.MathUtils.clamp(intensity, 0.25, 1.8);
    if (event.role === "drums") {
      if (isKickEvent(event)) {
        addRipple(ripples, event, scratchVector2, "kick", strength * 1.32, 1.95, 0.62);
      } else if (isSnareEvent(event)) {
        addRipple(ripples, event, scratchVector2, "snare", strength * 0.92, 1.72, 0.46);
      } else if (isHatEvent(event)) {
        addRipple(ripples, event, scratchVector2, "hat", strength * 0.36, 1.38, 0.22);
      } else {
        addRipple(ripples, event, scratchVector2, "hat", strength * 0.48, 1.42, 0.28);
      }
      continue;
    }

    if (event.role === "bass") {
      addRipple(ripples, event, scratchVector2, "tonal", strength * 0.62, 1.18, 0.72);
      continue;
    }

    if (isHarmonyRole(event.role)) {
      addRipple(ripples, event, scratchVector2, "tonal", strength * 0.34, 0.95, 0.92);
      continue;
    }

    if (event.role === "lead" || event.role === "counterline") {
      addRipple(ripples, event, scratchVector2, "snare", strength * 0.42, 1.45, 0.34);
    }
  }
}

function addRipple(
  ripples: RippleState[],
  event: VisualEvent,
  origin: THREE.Vector2,
  kind: RippleKind,
  strength: number,
  speed: number,
  width: number
) {
  ripples.push({
    id: event.id,
    origin: origin.clone(),
    age: 0,
    strength: THREE.MathUtils.clamp(strength, 0.04, 2.2),
    speed,
    width,
    seed: seededUnit(`${event.id}:ripple`),
    kind
  });
  if (ripples.length > maxRippleMeshes) {
    ripples.splice(0, ripples.length - maxRippleMeshes);
  }
}

function addClockRipple(ripples: RippleState[], frame: VisualSyncFrame, strength: number) {
  const beatIndex = Math.floor(frame.beat);
  const seed = seededUnit(`clock-${frame.bar}-${beatIndex}`);
  const origin = new THREE.Vector2(
    Math.sin(seed * tau + frame.sectionProgress * tau) * 5.2,
    -0.6 + Math.cos(seed * tau + frame.barProgress * 0.7) * 2.65
  );
  ripples.push({
    id: `clock-${beatIndex}-${frame.time.toFixed(2)}`,
    origin,
    age: 0,
    strength: THREE.MathUtils.clamp(strength, 0.08, 1.4),
    speed: 1.32 + strength * 0.28,
    width: 0.66 + strength * 0.18,
    seed,
    kind: strength > 0.58 ? "kick" : "tonal"
  });
  if (ripples.length > maxRippleMeshes) {
    ripples.splice(0, ripples.length - maxRippleMeshes);
  }
}

function updateRippleMeshes(
  ripples: RippleState[],
  meshes: LightStrip[],
  dt: number,
  intensity: number,
  motionScale: number
) {
  for (let i = ripples.length - 1; i >= 0; i -= 1) {
    const ripple = ripples[i];
    ripple.age += dt * (0.72 + motionScale * 0.34);
    const lifetime = ripple.kind === "kick" ? 3.9 : ripple.kind === "tonal" ? 4.6 : 2.5;
    if (ripple.age > lifetime) ripples.splice(i, 1);
  }

  for (let i = 0; i < meshes.length; i += 1) {
    const ripple = ripples[i];
    const item = meshes[i];
    if (!ripple) {
      item.mesh.visible = false;
      continue;
    }

    const fade = Math.exp(-ripple.age * (ripple.kind === "tonal" ? 0.58 : 0.82));
    const radius = 0.18 + ripple.age * ripple.speed * (1.35 + ripple.strength * 0.08);
    const opacity =
      fade *
      ripple.strength *
      (ripple.kind === "kick" ? 0.72 : ripple.kind === "snare" ? 0.68 : ripple.kind === "hat" ? 0.42 : 0.46) *
      THREE.MathUtils.clamp(intensity, 0.25, 1.8);
    item.mesh.visible = opacity > 0.008;
    item.mesh.position.set(ripple.origin.x, 0.09 + ripple.strength * 0.003, ripple.origin.y);
    item.mesh.rotation.z = ripple.seed * tau;
    item.mesh.scale.set(radius * (1 + ripple.seed * 0.08), radius * (0.9 + ripple.width * 0.08), 1);
    item.mesh.material.opacity = opacity;
    item.mesh.material.color.copy(colorForRipple(ripple));
  }
}

function updateWaterMaterial(
  material: THREE.ShaderMaterial,
  frame: VisualSyncFrame,
  bands: AudioBands,
  roleLevels: RoleLevels,
  energy: EventEnergy,
  intensity: number,
  time: number,
  ripples: RippleState[],
  motionScale: number
) {
  material.uniforms.uTime.value = time;
  material.uniforms.uIntensity.value = THREE.MathUtils.clamp(intensity, 0.2, 1.8);
  material.uniforms.uMotion.value = motionScale;
  material.uniforms.uBass.value = THREE.MathUtils.clamp(bands.bass + roleLevels.bass * 0.68 + energy.bass * 0.42, 0, 1.8);
  material.uniforms.uMids.value = THREE.MathUtils.clamp(bands.mids + roleLevels.harmony * 0.28 + roleLevels.pad * 0.32, 0, 1.5);
  material.uniforms.uHighs.value = THREE.MathUtils.clamp(bands.highs + roleLevels.ear_candy * 0.34 + energy.hats * 0.32, 0, 1.5);
  material.uniforms.uRms.value = bands.rms;
  material.uniforms.uCentroid.value = bands.centroid;
  material.uniforms.uKick.value = THREE.MathUtils.clamp(energy.kick + frame.barPulse * 0.08, 0, 1.4);
  material.uniforms.uSnare.value = THREE.MathUtils.clamp(energy.snare, 0, 1.3);
  material.uniforms.uHats.value = THREE.MathUtils.clamp(energy.hats, 0, 1.3);
  material.uniforms.uHarmony.value = THREE.MathUtils.clamp(energy.harmony + roleLevels.texture * 0.36 + roleLevels.pad * 0.4, 0, 1.6);
  material.uniforms.uLead.value = THREE.MathUtils.clamp(energy.lead + Math.max(roleLevels.lead, roleLevels.counterline) * 0.5, 0, 1.5);
  material.uniforms.uBeatPulse.value = frame.beatPulse;
  material.uniforms.uBarPulse.value = frame.barPulse;

  const vectors = material.uniforms.uRipples.value as THREE.Vector4[];
  for (let i = 0; i < vectors.length; i += 1) {
    const ripple = ripples[i];
    if (!ripple) {
      vectors[i].set(0, 0, 99, 0);
      continue;
    }
    const shaderFade = Math.exp(-ripple.age * (ripple.kind === "tonal" ? 0.48 : 0.64));
    vectors[i].set(ripple.origin.x, ripple.origin.y, ripple.age, ripple.strength * shaderFade * ripple.width * 1.45);
  }
}

function updateGlobs(
  globs: ChromeGlob[],
  frame: VisualSyncFrame,
  bands: AudioBands,
  roleLevels: RoleLevels,
  energy: EventEnergy,
  intensity: number,
  time: number,
  dt: number,
  motionScale: number
) {
  const globalDrive = bands.rms * 0.7 + energy.impact * 0.35 + intensity * 0.03;
  for (const glob of globs) {
    const roleDrive = driveForRole(glob.role, roleLevels, energy);
    const phase = glob.seed * tau + time * (0.12 + glob.seed * 0.08) * motionScale + frame.sectionProgress * 0.24;
    const orbit = (0.08 + roleDrive * 0.28 + globalDrive * 0.08) * motionScale;
    glob.group.position.x = THREE.MathUtils.damp(glob.group.position.x, glob.home.x + Math.sin(phase) * orbit, 4.2, dt);
    glob.group.position.z = THREE.MathUtils.damp(glob.group.position.z, glob.home.z + Math.cos(phase * 0.84) * orbit * 0.75, 4.2, dt);
    glob.core.position.y = THREE.MathUtils.damp(
      glob.core.position.y,
      glob.home.y + glob.radius * (0.55 + roleDrive * 0.08) + Math.sin(phase * 1.8) * (0.035 + roleDrive * 0.08) * motionScale,
      5.5,
      dt
    );

    const scale = glob.radius * (1 + energy.snare * 0.035 + roleDrive * 0.045 + bands.highs * 0.025);
    glob.core.scale.setScalar(scale);
    glob.core.rotation.x += dt * (0.05 + roleDrive * 0.18) * motionScale;
    glob.core.rotation.y += dt * (0.12 + bands.highs * 0.24 + glob.seed * 0.08) * motionScale;
    glob.core.material.envMapIntensity = 2.25 + roleDrive * 1.25 + bands.highs * 0.65 + energy.snare * 0.5;

    const contact = scale * (0.74 + roleDrive * 0.12);
    glob.waterline.scale.set(contact, contact, contact);
    glob.waterline.material.opacity = (0.22 + roleDrive * 0.28 + energy.kick * 0.12) * THREE.MathUtils.clamp(intensity, 0.25, 1.8);
    glob.reflection.scale.set(scale * 1.08, scale * (0.032 + roleDrive * 0.012), scale * (0.48 + roleDrive * 0.08));
    glob.reflection.material.opacity = (0.055 + roleDrive * 0.08 + bands.rms * 0.06) * THREE.MathUtils.clamp(intensity, 0.25, 1.8);
  }
}

function updateFlashStrips(strips: LightStrip[], frame: VisualSyncFrame, intensity: number, motionScale: number) {
  let index = 0;
  for (const event of frame.events) {
    if (event.role !== "drums" || !event.recent || event.timeDelta > 0) continue;
    if (!isKickEvent(event) && !isSnareEvent(event)) continue;
    const strip = strips[index++];
    if (!strip) break;

    eventWaterPosition(scratchVector2, event, frame);
    const age = Math.max(0, -event.timeDelta);
    const isKick = isKickEvent(event);
    const flash = Math.exp(-age * (isKick ? 3.0 : 5.2)) * eventStrength(event);
    const seed = seededUnit(`${event.id}:strip`);
    strip.mesh.visible = flash > 0.018;
    strip.mesh.position.set(scratchVector2.x, 0.082, scratchVector2.y);
    strip.mesh.rotation.z = seed * tau + (isKick ? 0.18 : 0.42);
    strip.mesh.scale.set((isKick ? 4.4 : 3.1) * (0.55 + flash) * motionScale, isKick ? 0.045 : 0.026, 1);
    strip.mesh.material.opacity = flash * (isKick ? 0.22 : 0.36) * THREE.MathUtils.clamp(intensity, 0.25, 1.8);
    strip.mesh.material.color.set(isKick ? "#ffffff" : "#d8f6ff");
  }

  for (let i = index; i < strips.length; i += 1) strips[i].mesh.visible = false;
}

function updateLeadTrails(
  trails: TrailLine[],
  frame: VisualSyncFrame,
  bands: AudioBands,
  intensity: number,
  time: number,
  motionScale: number
) {
  let index = 0;
  for (const event of frame.events) {
    if (event.role !== "lead" && event.role !== "counterline") continue;
    if (!event.active && !event.recent && !event.upcoming) continue;
    const trail = trails[index++];
    if (!trail) break;

    eventWaterPosition(scratchVector2, event, frame);
    const seed = seededUnit(`${event.id}:trail`);
    const active = event.active ? 0.85 - event.progress * 0.26 : 0;
    const recent = event.recent ? Math.exp(event.timeDelta * 1.8) * 0.72 : 0;
    const upcoming = event.upcoming ? THREE.MathUtils.clamp(1 - event.timeDelta / 5.5, 0, 1) * 0.2 : 0;
    const body = Math.max(active, recent, upcoming);
    const angle = seed * tau + event.pan * 0.52 + Math.sin(time * 0.18 + seed) * 0.22;
    const length = 1.3 + eventStrength(event) * 1.6 + bands.highs * 0.8;

    for (let point = 0; point < trailPointCount; point += 1) {
      const t = point / (trailPointCount - 1);
      const envelope = Math.sin(t * Math.PI);
      const curl = Math.sin(t * tau * (1.2 + seed * 1.6) + time * (1.2 + seed) + event.start) * envelope * 0.28 * motionScale;
      trail.positions[point * 3] = scratchVector2.x + (t - 0.18) * Math.cos(angle) * length + curl;
      trail.positions[point * 3 + 1] = 0.1 + envelope * (0.22 + eventStrength(event) * 0.22);
      trail.positions[point * 3 + 2] = scratchVector2.y + (t - 0.18) * Math.sin(angle) * length + Math.cos(t * tau + time) * envelope * 0.16;
    }

    trail.line.visible = body > 0.012;
    trail.line.geometry.setDrawRange(0, Math.max(2, Math.floor(trailPointCount * (0.35 + body * 0.65))));
    const attr = trail.line.geometry.getAttribute("position") as THREE.BufferAttribute;
    attr.needsUpdate = true;
    trail.line.material.opacity = body * (0.22 + bands.highs * 0.18) * THREE.MathUtils.clamp(intensity, 0.25, 1.8);
    trail.line.material.color.set(event.role === "counterline" ? "#d8f6ff" : "#ffffff");
  }

  for (let i = index; i < trails.length; i += 1) {
    trails[i].line.visible = false;
    trails[i].line.geometry.setDrawRange(0, 0);
  }
}

function updateCaustics(
  caustics: CausticPoints,
  bands: AudioBands,
  energy: EventEnergy,
  intensity: number,
  time: number,
  motionScale: number
) {
  const shimmer = (0.02 + bands.highs * 0.08 + energy.hats * 0.08) * motionScale;
  for (let i = 0; i < causticPointCount; i += 1) {
    const seed = caustics.seeds[i];
    caustics.positions[i * 3] = caustics.basePositions[i * 3] + Math.sin(time * (0.18 + seed * 0.2) + seed * tau) * shimmer;
    caustics.positions[i * 3 + 1] = caustics.basePositions[i * 3 + 1] + Math.sin(time * (1.1 + seed) + seed * 40) * shimmer * 0.36;
    caustics.positions[i * 3 + 2] = caustics.basePositions[i * 3 + 2] + Math.cos(time * (0.16 + seed * 0.18) + seed * 20) * shimmer;
  }
  const attr = caustics.points.geometry.getAttribute("position") as THREE.BufferAttribute;
  attr.needsUpdate = true;
  caustics.points.material.opacity = (0.16 + bands.highs * 0.34 + energy.hats * 0.22 + energy.snare * 0.08) * THREE.MathUtils.clamp(intensity, 0.25, 1.8);
  caustics.points.material.size = 0.024 + bands.highs * 0.03 + energy.hats * 0.018;
}

function eventWaterPosition(target: THREE.Vector2, event: VisualEvent, frame: VisualSyncFrame) {
  const seed = seededUnit(`${event.trackId}:${event.pitch}:${event.lane ?? "voice"}`);
  const seedB = seededUnit(`${event.id}:water-b`);
  const pitch = THREE.MathUtils.clamp(Math.log2(Math.max(32, event.frequency) / 220), -2.6, 2.6);
  let x = event.pan * 4.6 + (seed - 0.5) * 4.8;
  let z = -0.75 - pitch * 0.7 + Math.sin(seed * tau + frame.sectionProgress * tau * 0.35) * 1.15;

  if (event.role === "drums") {
    x = event.pan * 4.8 + (seed - 0.5) * 5.7;
    z = 0.35 + (seedB - 0.5) * 4.6;
    if (isKickEvent(event)) z += 0.7;
    if (isSnareEvent(event)) z -= 0.45;
  } else if (event.role === "bass") {
    z = 1.45 + (seedB - 0.5) * 2.4;
  } else if (event.role === "lead" || event.role === "counterline") {
    z -= 1.25;
    x += Math.sin(frame.beat * 0.06 + seed * tau) * 0.7;
  } else if (isHarmonyRole(event.role)) {
    z += 0.4 + (seedB - 0.5) * 1.6;
  }

  target.set(THREE.MathUtils.clamp(x, -7.4, 7.4), THREE.MathUtils.clamp(z, -5.85, 4.95));
}

function colorForRipple(ripple: RippleState) {
  if (ripple.kind === "kick") return scratchColor.set("#70d8ff");
  if (ripple.kind === "snare") return scratchColor.set("#38b8e8");
  if (ripple.kind === "hat") return scratchColor.set("#b9f0ff");
  return scratchColor.set("#5ec9ee");
}

function driveForRole(role: TrackRole, roleLevels: RoleLevels, energy: EventEnergy) {
  if (role === "drums") return Math.max(energy.kick, energy.snare, energy.hats * 0.7);
  if (role === "bass") return Math.max(roleLevels.bass, energy.bass);
  if (role === "lead" || role === "counterline") return Math.max(roleLevels.lead, roleLevels.counterline, energy.lead);
  if (isHarmonyRole(role)) return Math.max(roleLevels.harmony, roleLevels.pad, roleLevels.texture, energy.harmony);
  if (role === "ear_candy") return Math.max(roleLevels.ear_candy, energy.hats);
  return roleLevels[role] ?? 0;
}

function createRoleLevels(): RoleLevels {
  return {
    drums: 0,
    bass: 0,
    harmony: 0,
    lead: 0,
    counterline: 0,
    texture: 0,
    pad: 0,
    ear_candy: 0,
    custom: 0
  };
}

function emptyFrame(playing: boolean, activeSection?: Section): VisualSyncFrame {
  return {
    time: 0,
    duration: 0,
    playing,
    tempoMultiplier: 1,
    activeSection,
    sectionProgress: 0,
    beat: 0,
    beatInBar: 0,
    bar: 0,
    beatsPerBar: 4,
    beatProgress: 0,
    barProgress: 0,
    secondsPerBeat: 60 / 88,
    beatPulse: playing ? 0.12 : 0,
    barPulse: 0,
    events: [],
    tracks: []
  };
}

function writeRoleLevels(frame: VisualSyncFrame, levels: RoleLevels, targets: RoleLevels, dt: number) {
  for (const role of roleNames) targets[role] = 0;
  for (const track of frame.tracks) {
    if (!track.audible) continue;
    targets[track.role] = Math.max(targets[track.role], track.energy);
  }
  for (const role of roleNames) {
    levels[role] = THREE.MathUtils.damp(levels[role], targets[role], frame.playing ? 9.5 : 4.2, dt);
  }
}

function writeEventEnergy(frame: VisualSyncFrame, target: EventEnergy) {
  target.kick = 0;
  target.snare = 0;
  target.hats = 0;
  target.bass = 0;
  target.harmony = 0;
  target.lead = 0;
  target.impact = 0;

  for (const event of frame.events) {
    const gain = eventStrength(event);
    if (event.timeDelta <= 0) {
      const age = Math.max(0, -event.timeDelta);
      const strike = Math.exp(-age * 6.9) * gain;
      if (event.role === "drums") {
        if (isKickEvent(event)) target.kick = Math.max(target.kick, strike);
        else if (isSnareEvent(event)) target.snare = Math.max(target.snare, strike);
        else target.hats = Math.max(target.hats, strike * 0.8);
      }
    }

    if (event.active || event.recent) {
      const body = (event.active ? 0.9 - event.progress * 0.28 : Math.exp(event.timeDelta * 2.2)) * gain;
      if (event.role === "bass") target.bass = Math.max(target.bass, body);
      if (isHarmonyRole(event.role)) target.harmony = Math.max(target.harmony, body * 0.82);
      if (event.role === "lead" || event.role === "counterline") target.lead = Math.max(target.lead, body);
    }
  }
  target.impact = Math.max(target.kick, target.snare * 0.95, target.hats * 0.42);
}

function dampEventEnergy(energy: EventEnergy, target: EventEnergy, smoothing: number, dt: number) {
  energy.kick = THREE.MathUtils.damp(energy.kick, target.kick, smoothing, dt);
  energy.snare = THREE.MathUtils.damp(energy.snare, target.snare, smoothing, dt);
  energy.hats = THREE.MathUtils.damp(energy.hats, target.hats, smoothing, dt);
  energy.bass = THREE.MathUtils.damp(energy.bass, target.bass, smoothing * 0.75, dt);
  energy.harmony = THREE.MathUtils.damp(energy.harmony, target.harmony, smoothing * 0.58, dt);
  energy.lead = THREE.MathUtils.damp(energy.lead, target.lead, smoothing * 0.8, dt);
  energy.impact = THREE.MathUtils.damp(energy.impact, target.impact, smoothing, dt);
}

function isHarmonyRole(role: TrackRole) {
  return role === "harmony" || role === "pad" || role === "texture";
}

function isKickEvent(event: VisualEvent) {
  return (event.lane ?? "").toLowerCase() === "kick";
}

function isSnareEvent(event: VisualEvent) {
  const lane = event.lane?.toLowerCase() ?? "";
  return lane === "snare" || lane === "rim" || lane === "clap" || lane.includes("snare");
}

function isHatEvent(event: VisualEvent) {
  const lane = event.lane?.toLowerCase() ?? "";
  return lane.includes("hat") || lane === "ride" || lane === "crash";
}

function eventStrength(event: VisualEvent) {
  return THREE.MathUtils.clamp(event.gain * 0.55 + event.velocity * 0.65, 0.05, 1.35);
}

function seededUnit(value: string) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 100000) / 100000;
}

function average(values: Uint8Array, start: number, end: number) {
  let total = 0;
  for (let i = start; i < end; i += 1) total += values[i] ?? 0;
  return total / Math.max(1, end - start);
}

function analyzeAudio(frequencyData: Uint8Array, timeData: Uint8Array, isPlaying: boolean): AudioBands {
  if (!isPlaying) return idleAudioFeatures(false);

  const bass = average(frequencyData, 2, 24) / 255;
  const mids = average(frequencyData, 32, 170) / 255;
  const highs = average(frequencyData, 190, 470) / 255;
  const full = average(frequencyData, 2, 520) / 255;
  let weighted = 0;
  let total = 0;
  let peak = 0;
  for (let i = 2; i < 520; i += 1) {
    const value = frequencyData[i] / 255;
    weighted += value * i;
    total += value;
    peak = Math.max(peak, value);
  }

  let squareTotal = 0;
  let wavePeak = 0;
  for (const value of timeData) {
    const centered = (value - 128) / 128;
    squareTotal += centered * centered;
    wavePeak = Math.max(wavePeak, Math.abs(centered));
  }

  const rms = Math.sqrt(squareTotal / Math.max(1, timeData.length));
  const centroid = total > 0 ? THREE.MathUtils.clamp((weighted / total - 2) / 518, 0, 1) : 0.35;
  const dynamics = THREE.MathUtils.clamp((peak - full) * 1.8 + (wavePeak - rms) * 0.6, 0, 1);
  const sparse = THREE.MathUtils.clamp(1 - rms * 7 - full * 1.2, 0, 1);
  return { bass, mids, highs, rms, centroid, dynamics, sparse };
}

function idleAudioFeatures(isPlaying: boolean): AudioBands {
  return {
    bass: isPlaying ? 0.08 : 0.025,
    mids: isPlaying ? 0.07 : 0.025,
    highs: isPlaying ? 0.06 : 0.02,
    rms: isPlaying ? 0.045 : 0.018,
    centroid: 0.36,
    dynamics: 0.14,
    sparse: isPlaying ? 0.65 : 0.9
  };
}
