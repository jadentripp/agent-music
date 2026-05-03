import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

syncSalamanderVelocity8();

function syncSalamanderVelocity8() {
  const sourceDir = path.join(root, "node_modules", "@audio-samples", "piano-velocity8", "audio");
  const targetDir = path.join(root, "public", "samples", "salamander-grand-v8");
  if (!fs.existsSync(sourceDir)) {
    throw new Error("Missing @audio-samples/piano-velocity8. Run bun install first.");
  }

  fs.mkdirSync(targetDir, { recursive: true });
  const files = fs
    .readdirSync(sourceDir)
    .filter((file) => file.endsWith(".ogg"))
    .sort(noteSort);

  for (const file of files) {
    fs.copyFileSync(path.join(sourceDir, file), path.join(targetDir, file));
  }

  const roots = files.map((file) => ({
    file,
    note: file.replace(/v8\.ogg$/, ""),
    midi: toMidi(file.replace(/v8\.ogg$/, ""))
  }));

  const regions = roots.map(({ file, note, midi }, index) => {
    const previous = roots[index - 1]?.midi ?? 21;
    const next = roots[index + 1]?.midi ?? 108;
    const low = index === 0 ? 21 : Math.floor((previous + midi) / 2) + 1;
    const high = index === roots.length - 1 ? 108 : Math.floor((midi + next) / 2);
    const rootNote = file.replace(/v8\.ogg$/, "");
    return `  - { sample: ${file}, root: ${rootNote}, lokey: ${low}, hikey: ${high}, lovel: 0, hivel: 1, gain: 1, release: 1.4 }`;
  });

  fs.writeFileSync(
    path.join(targetDir, "manifest.yaml"),
    [
      "name: Salamander Grand Piano V3 Velocity 8",
      "kind: grand_piano",
      "baseUrl: /samples/salamander-grand-v8/",
      "regions:",
      ...regions,
      ""
    ].join("\n")
  );
}

function noteSort(a, b) {
  return toMidi(a.replace(/v8\.ogg$/, "")) - toMidi(b.replace(/v8\.ogg$/, ""));
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
