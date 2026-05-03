import fs from "node:fs/promises";
import path from "node:path";
import yaml from "js-yaml";

const repoRaw = "https://raw.githubusercontent.com/sfzinstruments/virtuosity_drums/master/Samples";
const outDir = path.join(process.cwd(), "public", "samples", "virtuosity-kit");

const regions = [
  ...layered("kick", "close", "kickmic/kick", "kickmic_kick_snon", [2, 3, 4], [1, 2], 1.06),
  ...layered("kick", "overhead", "oh/kick", "oh_kick_snon", [2, 3, 4], [1, 2], 0.34),

  ...single("snare", "close", "snaremic/snare", "snaremic_snare_center", [12, 18, 24, 30, 34], 1.0),
  ...single("snare", "overhead", "oh/snare", "oh_snare_center", [12, 18, 24, 30, 34], 0.42),

  ...layered("hat", "overhead", "oh/hh", "oh_hh_closed", [2, 3, 4], [1, 2, 3, 4], 0.66),
  ...layered("closed_hat", "overhead", "oh/hh", "oh_hh_closed", [2, 3, 4], [1, 2, 3, 4], 0.66),
  ...layered("open_hat", "overhead", "oh/hh", "oh_hh_open", [2, 3, 4], [1, 2, 3], 0.62),

  ...single("rim", "close", "snaremic/snare", "snaremic_snare_crossstick", [6, 10, 14, 16], 0.76),
  ...single("perc", "close", "snaremic/snare", "snaremic_snare_stickshot1", [3, 5, 7, 8], 0.56),

  ...single("tom", "overhead", "oh/ltom", "oh_ltom_center", [6, 10, 13, 16], 0.82),
  ...single("high_tom", "overhead", "oh/htom", "oh_htom_center", [6, 10, 13, 16], 0.78),

  ...layered("ride", "overhead", "oh/ride", "oh_ride_ride", [1, 2, 3], [1, 2, 3, 4], 0.56),
  ...layered("crash", "overhead", "oh/crash", "oh_crash_crash", [1, 2, 3], [1, 2, 3, 4], 0.58)
];

await fs.rm(outDir, { recursive: true, force: true });
await fs.mkdir(outDir, { recursive: true });

for (const region of regions) {
  await download(region.source, path.join(outDir, region.sample));
  delete region.source;
}

const manifest = {
  name: "Virtuosity Kit",
  kind: "drum_kit",
  source: "Virtuosity Drums by Versilian Studios and Karoryfer Samples, CC0-1.0",
  baseUrl: "/samples/virtuosity-kit/",
  regions
};

await fs.writeFile(path.join(outDir, "manifest.yaml"), yaml.dump(manifest, { lineWidth: 120 }), "utf8");

console.log(`Installed Virtuosity Kit: ${regions.length} regions in ${path.relative(process.cwd(), outDir)}`);

function layered(lane, layer, sourceDir, prefix, velocityLayers, roundRobins, gain) {
  return velocityLayers.flatMap((velocityLayer, layerIndex) =>
    roundRobins.map((roundRobin) =>
      region({
        lane,
        layer,
        sourceDir,
        filename: `${prefix}_vl${velocityLayer}_rr${roundRobin}.flac`,
        layerIndex,
        layerCount: velocityLayers.length,
        gain,
        roundRobin: `${lane}:${layer}`
      })
    )
  );
}

function single(lane, layer, sourceDir, prefix, velocityLayers, gain) {
  return velocityLayers.map((velocityLayer, layerIndex) =>
    region({
      lane,
      layer,
      sourceDir,
      filename: `${prefix}_vl${velocityLayer}.flac`,
      layerIndex,
      layerCount: velocityLayers.length,
      gain
    })
  );
}

function region({ lane, layer, sourceDir, filename, layerIndex, layerCount, gain, roundRobin }) {
  const { low, high } = velocityBand(layerIndex, layerCount);
  return {
    lane,
    layer,
    sample: filename,
    source: `${repoRaw}/${sourceDir}/${filename}`,
    lovel: low,
    hivel: high,
    gain,
    oneShot: true,
    roundRobin
  };
}

function velocityBand(layerIndex, layerCount) {
  const bandSize = 1 / layerCount;
  return {
    low: Number((layerIndex * bandSize).toFixed(3)),
    high: Number((layerIndex === layerCount - 1 ? 1 : (layerIndex + 1) * bandSize + 0.001).toFixed(3))
  };
}

async function download(url, destination) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.status} ${response.statusText}`);
  }
  await fs.writeFile(destination, Buffer.from(await response.arrayBuffer()));
}
