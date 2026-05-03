import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { Section } from "../types";

type VisualizerStageProps = {
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

const ribbonSegments = 128;
const dustCount = 1200;
const sparkleCount = 400;

export default function VisualizerStage({ analyser, intensity, playing }: VisualizerStageProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const stateRef = useRef({ analyser, intensity, playing });

  useEffect(() => {
    stateRef.current = { analyser, intensity, playing };
  }, [analyser, intensity, playing]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2("#06090a", 0.034);

    const camera = new THREE.PerspectiveCamera(50, mount.clientWidth / mount.clientHeight, 0.1, 140);
    camera.position.set(0, 1.25, 15);

    const root = new THREE.Group();
    scene.add(root);

    const dust = createDustField(dustCount, 17, 74, 11, 19);
    const dustMaterial = new THREE.PointsMaterial({
      size: 0.027,
      color: "#42eadf",
      transparent: true,
      opacity: 0.42,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      vertexColors: true
    });
    const dustPoints = new THREE.Points(dust.geometry, dustMaterial);
    dustPoints.position.z = -18;
    root.add(dustPoints);

    const sparkle = createDustField(sparkleCount, 10, 44, 7, 37);
    const sparkleMaterial = new THREE.PointsMaterial({
      size: 0.052,
      color: "#e4c268",
      transparent: true,
      opacity: 0.28,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      vertexColors: true
    });
    const sparklePoints = new THREE.Points(sparkle.geometry, sparkleMaterial);
    sparklePoints.position.z = -8;
    root.add(sparklePoints);

    const horizonMaterial = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uBass: { value: 0 },
        uMids: { value: 0 },
        uHighs: { value: 0 },
        uPrimary: { value: new THREE.Color("#42eadf") },
        uSecondary: { value: new THREE.Color("#e4c268") },
        uHorizon: { value: new THREE.Color("#0b1514") }
      },
      vertexShader: `
        varying vec2 vUv;
        uniform float uTime;
        uniform float uBass;
        uniform float uMids;
        void main() {
          vUv = uv;
          vec3 p = position;
          float wave = sin((p.x * 0.42) + uTime * 0.95) * 0.28;
          wave += sin((p.y * 0.28) - uTime * 0.54) * 0.22;
          p.z += wave * (0.4 + uBass * 1.8 + uMids * 0.8);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }
      `,
      fragmentShader: `
        varying vec2 vUv;
        uniform float uBass;
        uniform float uHighs;
        uniform vec3 uPrimary;
        uniform vec3 uSecondary;
        uniform vec3 uHorizon;
        void main() {
          float radial = distance(vUv, vec2(0.5, 0.25));
          float glow = smoothstep(0.86, 0.12, radial);
          float line = smoothstep(0.018, 0.0, abs(vUv.y - 0.5));
          vec3 color = mix(uHorizon, uPrimary, glow);
          color = mix(color, uSecondary, line * (0.35 + uBass));
          float alpha = (glow * 0.26 + line * 0.14) * (0.72 + uHighs);
          gl_FragColor = vec4(color, alpha);
        }
      `
    });
    const horizon = new THREE.Mesh(new THREE.PlaneGeometry(42, 28, 64, 32), horizonMaterial);
    horizon.rotation.x = -Math.PI / 2.35;
    horizon.position.set(0, -4.4, -16);
    scene.add(horizon);

    const ringGroup = new THREE.Group();
    const rings: THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>[] = [];
    for (let i = 0; i < 12; i += 1) {
      const radius = 3.15 + i * 0.22;
      const geometry = new THREE.TorusGeometry(radius, 0.01 + i * 0.001, 8, 72);
      const material = new THREE.MeshBasicMaterial({
        color: i % 2 === 0 ? "#42eadf" : "#e4c268",
        transparent: true,
        opacity: 0.06 + (18 - i) * 0.004,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });
      const ring = new THREE.Mesh(geometry, material);
      ring.rotation.x = Math.PI / 2;
      ring.position.z = -i * 1.85 - 1.2;
      ringGroup.add(ring);
      rings.push(ring);
    }
    root.add(ringGroup);

    const ribs = createLightRibs();
    const ribMaterial = new THREE.LineBasicMaterial({
      color: "#dffcf8",
      transparent: true,
      opacity: 0.16,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const ribLines = new THREE.LineSegments(ribs, ribMaterial);
    ribLines.position.z = -11;
    root.add(ribLines);

    const ribbon = createRibbon();
    const ribbonMaterial = new THREE.MeshBasicMaterial({
      color: "#e4c268",
      transparent: true,
      opacity: 0.74,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const ribbonMesh = new THREE.Mesh(ribbon.geometry, ribbonMaterial);
    ribbonMesh.position.set(0, -1.1, -2.4);
    scene.add(ribbonMesh);

    const glowRibbon = createRibbon();
    const glowRibbonMaterial = new THREE.MeshBasicMaterial({
      color: "#42eadf",
      transparent: true,
      opacity: 0.16,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const glowRibbonMesh = new THREE.Mesh(glowRibbon.geometry, glowRibbonMaterial);
    glowRibbonMesh.position.set(0, -1.1, -2.46);
    glowRibbonMesh.scale.y = 1.7;
    scene.add(glowRibbonMesh);

    const keyLight = new THREE.PointLight("#42eadf", 4.2, 54);
    keyLight.position.set(-7, 5, 2);
    scene.add(keyLight);

    const rimLight = new THREE.PointLight("#e4c268", 2.7, 62);
    rimLight.position.set(8, -2, -10);
    scene.add(rimLight);

    const frequencyData = new Uint8Array(1024);
    const timeData = new Uint8Array(1024);
    const bands: AudioBands = { bass: 0.08, mids: 0.08, highs: 0.08, rms: 0.06, centroid: 0.35, dynamics: 0.2, sparse: 0.5 };
    const raw = { bass: 0.08, energy: 0.08 };
    const energyHistory: number[] = [];
    const impulses = { ring: 0, flash: 0, burst: 0 };
    const colors = {
      primary: new THREE.Color("#42eadf"),
      secondary: new THREE.Color("#e4c268"),
      accent: new THREE.Color("#dffcf8"),
      fog: new THREE.Color("#06090a"),
      horizon: new THREE.Color("#0b1514")
    };
    let raf = 0;
    let lastFrame = 0;

    const render = (time: number) => {
      const { analyser: liveAnalyser, intensity: visualIntensity, playing: isPlaying } = stateRef.current;
      const t = time * 0.001;
      const dt = lastFrame ? Math.min(0.05, Math.max(0.001, (time - lastFrame) / 1000)) : 1 / 60;
      lastFrame = time;
      const drive = Math.max(0.18, visualIntensity);

      let next = idleAudioFeatures(isPlaying);
      if (liveAnalyser) {
        liveAnalyser.getByteFrequencyData(frequencyData);
        liveAnalyser.getByteTimeDomainData(timeData);
        next = analyzeAudio(frequencyData, timeData, isPlaying);
      }

      const smoothing = isPlaying ? 5.8 : 2.8;
      bands.bass = THREE.MathUtils.damp(bands.bass, next.bass, smoothing, dt);
      bands.mids = THREE.MathUtils.damp(bands.mids, next.mids, smoothing, dt);
      bands.highs = THREE.MathUtils.damp(bands.highs, next.highs, smoothing, dt);
      bands.rms = THREE.MathUtils.damp(bands.rms, next.rms, smoothing, dt);
      bands.centroid = THREE.MathUtils.damp(bands.centroid, next.centroid, 3.6, dt);
      bands.dynamics = THREE.MathUtils.damp(bands.dynamics, next.dynamics, 4.2, dt);
      bands.sparse = THREE.MathUtils.damp(bands.sparse, next.sparse, 4.4, dt);

      const energy = next.rms * 0.9 + next.bass * 0.45 + next.mids * 0.32 + next.highs * 0.18;
      energyHistory.push(energy);
      if (energyHistory.length > 240) energyHistory.shift();

      const recentEnergy = trailingAverage(energyHistory, 36, 0);
      const olderEnergy = trailingAverage(energyHistory, 120, 42);
      const energyRise = THREE.MathUtils.clamp((recentEnergy - olderEnergy) * 4.5, -0.55, 0.85);
      const energyDrop = THREE.MathUtils.clamp((olderEnergy - recentEnergy) * 4.2, 0, 0.75);
      const bassDelta = next.bass - raw.bass;
      const energyDelta = energy - raw.energy;
      raw.bass = next.bass;
      raw.energy = energy;

      if (isPlaying && (bassDelta > 0.11 || energyDelta > 0.13)) impulses.ring = Math.min(1, impulses.ring + 0.75);
      if (isPlaying && energyDelta > 0.16) impulses.flash = Math.min(1, impulses.flash + 0.55);
      if (isPlaying && bassDelta > 0.16) impulses.burst = Math.min(1, impulses.burst + 0.85);
      impulses.ring = Math.max(0, impulses.ring - dt * 1.9);
      impulses.flash = Math.max(0, impulses.flash - dt * 3.8);
      impulses.burst = Math.max(0, impulses.burst - dt * 2.4);

      const palette = paletteFromAudio(bands, impulses, energyRise, energyDrop);
      colors.primary.lerp(palette.primary, 0.045);
      colors.secondary.lerp(palette.secondary, 0.045);
      colors.accent.lerp(palette.accent, 0.045);
      colors.fog.lerp(palette.fog, 0.045);
      colors.horizon.lerp(palette.horizon, 0.045);

      const bloom = THREE.MathUtils.clamp(0.62 + energyRise + impulses.burst * 0.45 - energyDrop * 0.35, 0.42, 1.85);
      const openness = THREE.MathUtils.clamp(1 + energyDrop * 0.5 - energyRise * 0.22 - bands.rms * 0.12, 0.82, 1.38);
      scene.fog = new THREE.FogExp2(colors.fog, 0.024 + bands.rms * 0.018 + bands.bass * 0.01 - energyDrop * 0.006);
      dustMaterial.color.copy(colors.primary);
      sparkleMaterial.color.copy(colors.secondary);
      ribbonMaterial.color.copy(colors.secondary);
      glowRibbonMaterial.color.copy(colors.primary);
      ribMaterial.color.copy(colors.accent);
      keyLight.color.copy(colors.primary);
      rimLight.color.copy(colors.secondary);
      horizonMaterial.uniforms.uPrimary.value.copy(colors.primary);
      horizonMaterial.uniforms.uSecondary.value.copy(colors.secondary);
      horizonMaterial.uniforms.uHorizon.value.copy(colors.horizon);
      horizonMaterial.uniforms.uTime.value = t;
      horizonMaterial.uniforms.uBass.value = (bands.bass + impulses.ring * 0.35) * drive;
      horizonMaterial.uniforms.uMids.value = (bands.mids + energyRise * 0.22) * drive;
      horizonMaterial.uniforms.uHighs.value = (bands.highs + impulses.flash * 0.5) * drive;

      const travel = isPlaying ? 0.35 + bands.rms * 2.4 + bands.mids * 1.2 : 0.12;
      dustPoints.rotation.z = Math.sin(t * 0.055) * 0.08;
      dustPoints.position.z = -24 + ((t * travel * (1.15 + bands.mids * 2.5)) % 16);
      dustPoints.scale.setScalar(openness * (1 + bloom * 0.08 + impulses.burst * 0.16));
      dustMaterial.size = 0.019 + bands.highs * drive * 0.044 + impulses.flash * 0.018;
      dustMaterial.opacity = 0.18 + bands.highs * drive * 0.2 + bloom * 0.08 + impulses.burst * 0.18;

      sparklePoints.rotation.z = -t * 0.018;
      sparklePoints.position.z = -14 + ((t * travel * (2.4 + bands.highs * 4.8 + impulses.burst * 3.8)) % 22);
      sparklePoints.scale.setScalar(openness * (1 + bands.mids * drive * 0.1 + impulses.burst * 0.28));
      sparkleMaterial.opacity = 0.08 + bands.highs * drive * 0.36 + impulses.flash * 0.32;

      ringGroup.rotation.z = Math.sin(t * 0.12) * 0.05 + bands.bass * 0.1 + impulses.ring * 0.08;
      rings.forEach((ring, index) => {
        const depth = index / Math.max(1, rings.length - 1);
        ring.material.color.copy(index % 2 === 0 ? colors.primary : colors.secondary);
        ring.material.opacity = 0.035 + (1 - depth) * 0.065 + bands.mids * drive * 0.14 + impulses.ring * (0.22 - depth * 0.1);
        ring.scale.setScalar(
          openness +
            bands.bass * drive * (0.13 + depth * 0.24) +
            impulses.ring * (0.28 + depth * 0.45) +
            Math.sin(t * 1.1 + index) * 0.012
        );
        ring.position.z += (0.014 + bands.mids * 0.13) * travel;
        if (ring.position.z > 4.8) ring.position.z = -34;
      });

      const ribbonThinness = THREE.MathUtils.lerp(0.56, 1.12, 1 - bands.sparse);
      updateRibbon(ribbon, timeData, t, drive, bands, 0.13 * ribbonThinness + impulses.ring * 0.08);
      updateRibbon(glowRibbon, timeData, t, drive, bands, 0.34 * ribbonThinness + impulses.ring * 0.16);
      ribbonMaterial.opacity = 0.32 + bands.mids * drive * 0.28 + impulses.flash * 0.18;
      glowRibbonMaterial.opacity = 0.06 + bands.bass * drive * 0.16 + impulses.ring * 0.16;

      ribLines.rotation.z = Math.sin(t * 0.09) * 0.035;
      ribLines.position.y = -0.2 + bands.bass * drive * 0.55 + energyRise * 0.28;
      ribMaterial.opacity = 0.04 + bands.highs * drive * 0.22 + impulses.flash * 0.2;

      moveCamera(camera, t, drive, bands, impulses, energyRise, energyDrop);
      renderer.toneMappingExposure = 0.96 + bands.rms * drive * 0.34 + bands.dynamics * 0.14 + impulses.flash * 0.42;

      renderer.render(scene, camera);
      raf = window.requestAnimationFrame(render);
    };

    const resize = () => {
      const width = Math.max(1, mount.clientWidth);
      const height = Math.max(1, mount.clientHeight);
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };

    window.addEventListener("resize", resize);
    raf = window.requestAnimationFrame(render);

    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      renderer.dispose();
      dust.geometry.dispose();
      dustMaterial.dispose();
      sparkle.geometry.dispose();
      sparkleMaterial.dispose();
      horizon.geometry.dispose();
      horizonMaterial.dispose();
      rings.forEach((ring) => {
        ring.geometry.dispose();
        ring.material.dispose();
      });
      ribs.dispose();
      ribMaterial.dispose();
      ribbon.geometry.dispose();
      ribbonMaterial.dispose();
      glowRibbon.geometry.dispose();
      glowRibbonMaterial.dispose();
      mount.removeChild(renderer.domElement);
    };
  }, []);

  return <div className="visualizer-stage" ref={mountRef} />;
}

function createDustField(count: number, radius: number, depth: number, vertical: number, seed: number) {
  const random = seededRandom(seed);
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    const angle = random() * Math.PI * 2;
    const band = Math.pow(random(), 0.72);
    const xRadius = 2.2 + band * radius;
    const yRadius = 1.4 + band * vertical;
    positions[i * 3] = Math.cos(angle) * xRadius + (random() - 0.5) * 1.6;
    positions[i * 3 + 1] = Math.sin(angle) * yRadius * 0.48 + (random() - 0.5) * 1.2;
    positions[i * 3 + 2] = -random() * depth;

    const shade = 0.46 + random() * 0.54;
    colors[i * 3] = shade;
    colors[i * 3 + 1] = shade * (0.72 + random() * 0.22);
    colors[i * 3 + 2] = shade * (0.82 + random() * 0.18);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return { geometry };
}

function createLightRibs() {
  const positions: number[] = [];
  for (let i = 0; i < 26; i += 1) {
    const side = i % 2 === 0 ? -1 : 1;
    const row = Math.floor(i / 2);
    const x = side * (3.4 + row * 0.48);
    const z = -3.5 - row * 1.7;
    positions.push(x, -4.4, z, x * 0.72, 4.6, z - 1.2);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  return geometry;
}

function createRibbon() {
  const positions = new Float32Array(ribbonSegments * 2 * 3);
  const indices: number[] = [];
  for (let i = 0; i < ribbonSegments - 1; i += 1) {
    const a = i * 2;
    indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  return { geometry };
}

function updateRibbon(
  ribbon: { geometry: THREE.BufferGeometry },
  timeData: Uint8Array,
  time: number,
  drive: number,
  bands: { bass: number; mids: number; highs: number },
  thickness: number
) {
  const position = ribbon.geometry.getAttribute("position") as THREE.BufferAttribute;
  for (let i = 0; i < ribbonSegments; i += 1) {
    const progress = i / (ribbonSegments - 1);
    const sample = ((timeData[Math.floor(progress * (timeData.length - 1))] ?? 128) - 128) / 128;
    const x = (progress - 0.5) * 13.8;
    const body = sample * (0.75 + bands.mids * drive * 1.65);
    const drift = Math.sin(progress * Math.PI * 5.5 + time * 1.4) * bands.bass * drive * 0.46;
    const y = body + drift;
    const z = Math.sin(progress * Math.PI * 2 + time * 0.7) * (0.18 + bands.highs * 0.42);
    const width = thickness + bands.bass * drive * 0.24 + Math.sin(progress * Math.PI) * thickness;
    position.setXYZ(i * 2, x, y - width, z);
    position.setXYZ(i * 2 + 1, x, y + width, z);
  }
  position.needsUpdate = true;
  ribbon.geometry.computeBoundingSphere();
}

function moveCamera(
  camera: THREE.PerspectiveCamera,
  time: number,
  drive: number,
  bands: AudioBands,
  impulses: { ring: number; flash: number; burst: number },
  energyRise: number,
  energyDrop: number
) {
  const bassPush = bands.bass * drive + impulses.ring * 0.45;
  const highDrift = bands.highs * drive + impulses.flash * 0.32;
  const quietPullback = energyDrop * 2.2 + bands.sparse * 0.9;
  const midsWiden = bands.mids * drive * 7 + energyRise * 8;
  camera.fov = THREE.MathUtils.damp(camera.fov, 48 + midsWiden + quietPullback * 2, 3.2, 1 / 60);
  camera.position.x = Math.sin(time * 0.12) * (0.58 + quietPullback * 0.32) + Math.sin(time * 5.4) * highDrift * 0.045;
  camera.position.y = 0.76 + Math.cos(time * 0.15) * 0.32 + bassPush * 0.35 + energyRise * 0.26;
  camera.position.z = 15.4 + quietPullback * 1.65 - bassPush * 2.15 - impulses.burst * 0.75;
  camera.updateProjectionMatrix();
  camera.lookAt(Math.sin(time * 0.08) * 0.18, -0.46 + bassPush * 0.2, -9.5);
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
    centroid: 0.38,
    dynamics: 0.16,
    sparse: isPlaying ? 0.65 : 0.9
  };
}

function paletteFromAudio(
  bands: AudioBands,
  impulses: { ring: number; flash: number; burst: number },
  energyRise: number,
  energyDrop: number
) {
  const warmth = THREE.MathUtils.clamp(bands.bass * 1.15 + bands.rms * 2.2 + impulses.ring * 0.35, 0, 1);
  const air = THREE.MathUtils.clamp(bands.highs * 1.35 + bands.centroid * 0.75 + impulses.flash * 0.3, 0, 1);
  const contrast = THREE.MathUtils.clamp(0.28 + bands.dynamics * 0.58 + energyRise * 0.18 - energyDrop * 0.12, 0.18, 0.92);
  const hue = THREE.MathUtils.euclideanModulo(0.52 + bands.centroid * 0.28 - warmth * 0.12, 1);
  return {
    primary: new THREE.Color().setHSL(hue, 0.64 + contrast * 0.24, 0.34 + air * 0.22 + impulses.flash * 0.08),
    secondary: new THREE.Color().setHSL(0.1 - warmth * 0.08 + bands.centroid * 0.04, 0.78, 0.32 + warmth * 0.34),
    accent: new THREE.Color().setHSL(0.55 + bands.centroid * 0.08, 0.42 + air * 0.24, 0.68 + impulses.flash * 0.22),
    fog: new THREE.Color().setHSL(0.56 + bands.centroid * 0.08, 0.38 + contrast * 0.18, 0.028 + bands.rms * 0.04),
    horizon: new THREE.Color().setHSL(0.08 + warmth * 0.02, 0.58, 0.05 + warmth * 0.09 + energyRise * 0.035)
  };
}

function trailingAverage(values: number[], count: number, offset: number) {
  if (values.length === 0) return 0;
  const end = Math.max(0, values.length - offset);
  const start = Math.max(0, end - count);
  if (end <= start) return values[values.length - 1] ?? 0;
  let total = 0;
  for (let i = start; i < end; i += 1) total += values[i] ?? 0;
  return total / (end - start);
}

function seededRandom(seed: number) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}
