import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const repo = "sgossner/VSCO-2-CE";
const ref = "SFZ";

const packs = [
  {
    name: "VSCO 2 CE Violin Section Sustain",
    kind: "cinematic_strings",
    sourcePath: "Strings/Violin Section",
    articulationDir: "susVib",
    target: "vsco-violin-section-sustain"
  },
  {
    name: "VSCO 2 CE Cello Section Sustain",
    kind: "solo_cello",
    sourcePath: "Strings/Cello Section",
    articulationDir: "susvib",
    target: "vsco-cello-section-sustain"
  }
];

for (const pack of packs) {
  await installPack(pack);
}

async function installPack(pack) {
  const tree = await githubJson(`https://api.github.com/repos/${repo}/contents/${encodeURIComponentPath(pack.sourcePath)}?ref=${ref}`);
  const dir = tree.find((entry) => entry.name === pack.articulationDir);
  if (!dir) throw new Error(`Could not find ${pack.sourcePath}/${pack.articulationDir}`);

  const files = await githubJson(dir.url);
  const wavs = files
    .filter((entry) => entry.type === "file" && entry.name.endsWith(".wav"))
    .filter((entry) => parseSampleName(entry.name))
    .sort((a, b) => {
      const left = parseSampleName(a.name);
      const right = parseSampleName(b.name);
      return left.midi - right.midi || left.velocity - right.velocity || left.roundRobin - right.roundRobin;
    });

  const targetDir = path.join(root, "public", "samples", pack.target);
  fs.mkdirSync(targetDir, { recursive: true });
  for (const file of wavs) {
    const targetPath = path.join(targetDir, file.name);
    if (fs.existsSync(targetPath)) continue;
    const response = await fetch(file.download_url);
    if (!response.ok) throw new Error(`Download failed ${file.download_url}: ${response.status}`);
    fs.writeFileSync(targetPath, Buffer.from(await response.arrayBuffer()));
  }

  const groups = wavs.map((file) => ({ ...parseSampleName(file.name), file: file.name }));
  const byMidi = new Map(groups.map((item) => [item.midi, item.note]));
  const midis = Array.from(byMidi.keys()).sort((a, b) => a - b);
  const regions = groups.map((item) => {
    const index = midis.indexOf(item.midi);
    const previous = midis[index - 1] ?? item.midi - 2;
    const next = midis[index + 1] ?? item.midi + 2;
    const low = Math.max(0, index === 0 ? item.midi - 1 : Math.floor((previous + item.midi) / 2) + 1);
    const high = Math.min(127, index === midis.length - 1 ? item.midi + 1 : Math.floor((item.midi + next) / 2));
    const level = velocityRange(item.velocity);
    return `  - { sample: ${item.file}, root: ${item.note}, lokey: ${low}, hikey: ${high}, lovel: ${level.low}, hivel: ${level.high}, gain: 1, attack: 0.04, release: 1.8, roundRobin: ${item.note}-v${item.velocity} }`;
  });

  fs.writeFileSync(
    path.join(targetDir, "manifest.yaml"),
    [`name: ${pack.name}`, `kind: ${pack.kind}`, `baseUrl: /samples/${pack.target}/`, "regions:", ...regions, ""].join("\n")
  );
}

async function githubJson(url) {
  const response = await fetch(url, { headers: { "User-Agent": "agent-written-music-studio" } });
  if (!response.ok) throw new Error(`GitHub request failed ${url}: ${response.status}`);
  return response.json();
}

function encodeURIComponentPath(value) {
  return value.split("/").map(encodeURIComponent).join("/");
}

function parseSampleName(name) {
  const match = name.match(/_([A-G](?:#|b)?\d)_v(\d+)(?:_?[Rr][Rr]?|_)?(\d+)?\.wav$/);
  if (!match) return undefined;
  return {
    note: match[1],
    midi: toMidi(match[1]),
    velocity: Number(match[2]),
    roundRobin: Number(match[3] ?? 1)
  };
}

function velocityRange(velocity) {
  if (velocity <= 1) return { low: 0, high: 0.62 };
  if (velocity === 2) return { low: 0.5, high: 1 };
  return { low: 0.5, high: 1 };
}

function toMidi(note) {
  const match = note.match(/^([A-G](?:#|b)?)(-?\d)$/);
  if (!match) return 0;
  const pitchClass = {
    C: 0,
    "C#": 1,
    Db: 1,
    D: 2,
    "D#": 3,
    Eb: 3,
    E: 4,
    F: 5,
    "F#": 6,
    Gb: 6,
    G: 7,
    "G#": 8,
    Ab: 8,
    A: 9,
    "A#": 10,
    Bb: 10,
    B: 11
  }[match[1]];
  return (Number(match[2]) + 1) * 12 + pitchClass;
}
