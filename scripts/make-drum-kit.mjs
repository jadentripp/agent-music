import fs from "node:fs";
import path from "node:path";

const sampleRate = 44100;
const outDir = path.join(process.cwd(), "public", "samples", "dusty-kit");
fs.mkdirSync(outDir, { recursive: true });

const specs = [
  ["kick-soft.wav", 0.62, 0.52, kick(50, 0.64, 0.42)],
  ["kick-hard.wav", 0.84, 1, kick(54, 0.8, 0.5)],
  ["snare-soft.wav", 0, 0.68, snare(180, 0.36, 0.55)],
  ["snare-hard.wav", 0.58, 1, snare(205, 0.44, 0.75)],
  ["hat-1.wav", 0, 1, hat(0.08, 7200, 0.32)],
  ["hat-2.wav", 0, 1, hat(0.075, 8400, 0.28)],
  ["open-hat.wav", 0, 1, hat(0.32, 6200, 0.3)],
  ["clap.wav", 0, 1, clap()],
  ["rim.wav", 0, 1, rim()],
  ["perc.wav", 0, 1, perc()],
  ["tom.wav", 0, 1, tom()],
  ["crash.wav", 0, 1, crash()]
];

for (const [file, , , samples] of specs) {
  fs.writeFileSync(path.join(outDir, file), encodeWav(samples));
}

function kick(freq, punch, seconds) {
  return render(seconds, (t) => {
    const sweep = freq * Math.pow(0.34, Math.min(1, t / 0.18));
    const body = Math.sin(2 * Math.PI * sweep * t) * env(t, 0.004, seconds, 3.8);
    const click = filteredNoise(t, 0.018, 11000) * 0.18;
    return softClip(body * punch + click);
  });
}

function snare(toneFreq, seconds, amount) {
  return render(seconds, (t) => {
    const body = Math.sin(2 * Math.PI * toneFreq * t) * env(t, 0.003, 0.16, 4.5);
    const noise = filteredNoise(t, seconds, 5200) * env(t, 0.001, seconds, 2.4);
    return softClip(body * 0.32 + noise * amount);
  });
}

function hat(seconds, cutoff, amount) {
  return render(seconds, (t) => filteredNoise(t, seconds, cutoff) * env(t, 0.001, seconds, 6) * amount);
}

function clap() {
  return render(0.34, (t) => {
    const bursts = burst(t, 0.012) + burst(t - 0.018, 0.012) + burst(t - 0.038, 0.018);
    return softClip(filteredNoise(t, 0.34, 3600) * bursts * 0.62);
  });
}

function rim() {
  return render(0.16, (t) => {
    const tone = Math.sin(2 * Math.PI * 1800 * t) + Math.sin(2 * Math.PI * 2450 * t) * 0.45;
    return softClip(tone * env(t, 0.001, 0.13, 7) * 0.5);
  });
}

function perc() {
  return render(0.22, (t) => {
    const tone = Math.sin(2 * Math.PI * 760 * t) * env(t, 0.002, 0.18, 6);
    return softClip(tone * 0.55 + filteredNoise(t, 0.07, 5000) * 0.08);
  });
}

function tom() {
  return render(0.42, (t) => {
    const sweep = 150 * Math.pow(0.48, Math.min(1, t / 0.24));
    return softClip(Math.sin(2 * Math.PI * sweep * t) * env(t, 0.003, 0.38, 4) * 0.75);
  });
}

function crash() {
  return render(1.2, (t) => softClip(filteredNoise(t, 1.2, 9000) * env(t, 0.001, 1.1, 1.8) * 0.34));
}

function render(seconds, fn) {
  const length = Math.floor(sampleRate * seconds);
  const samples = new Float32Array(length);
  for (let i = 0; i < length; i += 1) samples[i] = fn(i / sampleRate, i);
  return samples;
}

function env(t, attack, duration, curve) {
  if (t < attack) return Math.max(0.001, t / attack);
  return Math.pow(Math.max(0, 1 - (t - attack) / Math.max(0.001, duration - attack)), curve);
}

function burst(t, seconds) {
  if (t < 0 || t > seconds) return 0;
  return env(t, 0.001, seconds, 2);
}

function filteredNoise(t, seconds, cutoff) {
  const n = Math.sin((t * 12345.678 + Math.sin(t * 991.1)) * 43758.5453);
  const bright = n - Math.sin((Math.max(0, t - 1 / cutoff) * 12345.678) * 43758.5453) * 0.48;
  return bright * env(t, 0.001, seconds, 1.4);
}

function softClip(value) {
  return Math.tanh(value * 1.8) * 0.85;
}

function encodeWav(samples) {
  const bytes = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(bytes);
  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, "data");
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i += 1) {
    view.setInt16(44 + i * 2, Math.max(-1, Math.min(1, samples[i])) * 0x7fff, true);
  }
  return Buffer.from(bytes);
}

function writeString(view, offset, text) {
  for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
}
