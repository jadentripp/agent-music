import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { Section } from "../types";

type VisualizerStageProps = {
  analyser?: AnalyserNode;
  activeSection?: Section;
  intensity: number;
  playing: boolean;
};

const scenePalettes: Record<string, { primary: string; secondary: string; fog: string }> = {
  aurora: { primary: "#48f0d7", secondary: "#f5d56a", fog: "#061410" },
  cathedral: { primary: "#e8ecff", secondary: "#d6a54f", fog: "#111115" },
  tunnel: { primary: "#ff3d81", secondary: "#3df2ff", fog: "#07080d" },
  nebula: { primary: "#fcf0a8", secondary: "#ff5f7e", fog: "#130914" }
};

export default function VisualizerStage({ analyser, activeSection, intensity, playing }: VisualizerStageProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const stateRef = useRef({ analyser, activeSection, intensity, playing });

  useEffect(() => {
    stateRef.current = { analyser, activeSection, intensity, playing };
  }, [analyser, activeSection, intensity, playing]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.18;
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2("#08070a", 0.028);

    const camera = new THREE.PerspectiveCamera(55, mount.clientWidth / mount.clientHeight, 0.1, 120);
    camera.position.set(0, 0.5, 14);

    const group = new THREE.Group();
    scene.add(group);

    const particleCount = 2200;
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i += 1) {
      const radius = 2.2 + Math.random() * 14;
      const angle = Math.random() * Math.PI * 2;
      const z = (Math.random() - 0.5) * 58;
      positions[i * 3] = Math.cos(angle) * radius;
      positions[i * 3 + 1] = Math.sin(angle) * radius * 0.68;
      positions[i * 3 + 2] = z;
      colors[i * 3] = 0.35 + Math.random() * 0.65;
      colors[i * 3 + 1] = 0.35 + Math.random() * 0.65;
      colors[i * 3 + 2] = 0.35 + Math.random() * 0.65;
    }
    const particleGeometry = new THREE.BufferGeometry();
    particleGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    particleGeometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const particleMaterial = new THREE.PointsMaterial({
      size: 0.045,
      vertexColors: true,
      transparent: true,
      opacity: 0.86,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const particles = new THREE.Points(particleGeometry, particleMaterial);
    group.add(particles);

    const ringGroup = new THREE.Group();
    for (let i = 0; i < 22; i += 1) {
      const geometry = new THREE.TorusGeometry(3.2 + i * 0.13, 0.008, 8, 96);
      const material = new THREE.MeshBasicMaterial({
        color: i % 2 === 0 ? "#48f0d7" : "#f5d56a",
        transparent: true,
        opacity: 0.14,
        blending: THREE.AdditiveBlending
      });
      const ring = new THREE.Mesh(geometry, material);
      ring.position.z = -i * 1.55;
      ring.rotation.x = Math.PI / 2;
      ringGroup.add(ring);
    }
    group.add(ringGroup);

    const waveformGeometry = new THREE.BufferGeometry();
    const waveformPositions = new Float32Array(128 * 3);
    waveformGeometry.setAttribute("position", new THREE.BufferAttribute(waveformPositions, 3));
    const waveformMaterial = new THREE.LineBasicMaterial({
      color: "#ffffff",
      transparent: true,
      opacity: 0.65
    });
    const waveform = new THREE.Line(waveformGeometry, waveformMaterial);
    waveform.position.y = -3.5;
    scene.add(waveform);

    const ambient = new THREE.AmbientLight("#ffffff", 0.7);
    scene.add(ambient);

    const frequencyData = new Uint8Array(1024);
    const timeData = new Uint8Array(1024);
    let raf = 0;
    let lastPalette = "";

    const render = (time: number) => {
      const { analyser: liveAnalyser, activeSection: section, intensity: visualIntensity, playing: isPlaying } = stateRef.current;
      let bass = 0.08;
      let mids = 0.08;
      let highs = 0.08;

      if (liveAnalyser) {
        liveAnalyser.getByteFrequencyData(frequencyData);
        liveAnalyser.getByteTimeDomainData(timeData);
        bass = average(frequencyData, 2, 24) / 255;
        mids = average(frequencyData, 32, 160) / 255;
        highs = average(frequencyData, 180, 430) / 255;
      }

      const paletteKey = section?.scene ?? "aurora";
      if (paletteKey !== lastPalette) {
        const palette = scenePalettes[paletteKey];
        scene.fog = new THREE.FogExp2(palette.fog, 0.025);
        particleMaterial.color = new THREE.Color(palette.primary);
        waveformMaterial.color = new THREE.Color(palette.secondary);
        ringGroup.children.forEach((child, index) => {
          const mesh = child as THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>;
          mesh.material.color = new THREE.Color(index % 2 === 0 ? palette.primary : palette.secondary);
        });
        lastPalette = paletteKey;
      }

      const sectionIntensity = section?.intensity ?? 1;
      const drive = Math.max(0.2, visualIntensity * sectionIntensity);
      const t = time * 0.001;
      group.rotation.z = Math.sin(t * 0.16) * 0.08 + bass * 0.22;
      group.rotation.y = Math.sin(t * 0.12) * 0.18;
      particles.rotation.z += 0.0008 + bass * 0.0035;
      particles.position.z = ((t * (isPlaying ? 2.2 : 0.28)) % 8) - 4;
      particleMaterial.size = 0.032 + bass * 0.08 * drive;
      particleMaterial.opacity = 0.5 + Math.min(0.42, highs * drive);

      ringGroup.children.forEach((child, index) => {
        const mesh = child as THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>;
        mesh.scale.setScalar(1 + bass * drive * 0.18 + Math.sin(t * 1.4 + index) * 0.018);
        mesh.position.z += 0.018 + mids * 0.08;
        if (mesh.position.z > 5) mesh.position.z = -34;
        mesh.material.opacity = 0.08 + mids * 0.25 * drive;
      });

      const positionAttribute = waveformGeometry.getAttribute("position") as THREE.BufferAttribute;
      for (let i = 0; i < 128; i += 1) {
        const x = (i / 127 - 0.5) * 12;
        const y = ((timeData[i * 8] ?? 128) - 128) / 28;
        positionAttribute.setXYZ(i, x, y * (0.5 + drive), Math.sin(i * 0.1 + t) * 0.2);
      }
      positionAttribute.needsUpdate = true;

      camera.position.x = Math.sin(t * 0.18) * 0.9 + highs * 0.8;
      camera.position.y = 0.6 + Math.cos(t * 0.21) * 0.45 + bass * 0.45;
      camera.lookAt(0, 0, -8);
      renderer.render(scene, camera);
      raf = window.requestAnimationFrame(render);
    };

    const resize = () => {
      renderer.setSize(mount.clientWidth, mount.clientHeight);
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
    };

    window.addEventListener("resize", resize);
    raf = window.requestAnimationFrame(render);

    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      renderer.dispose();
      particleGeometry.dispose();
      particleMaterial.dispose();
      waveformGeometry.dispose();
      waveformMaterial.dispose();
      ringGroup.children.forEach((child) => {
        const mesh = child as THREE.Mesh<THREE.BufferGeometry, THREE.Material>;
        mesh.geometry.dispose();
        mesh.material.dispose();
      });
      mount.removeChild(renderer.domElement);
    };
  }, []);

  return <div className="visualizer-stage" ref={mountRef} />;
}

function average(values: Uint8Array, start: number, end: number) {
  let total = 0;
  for (let i = start; i < end; i += 1) total += values[i] ?? 0;
  return total / Math.max(1, end - start);
}
