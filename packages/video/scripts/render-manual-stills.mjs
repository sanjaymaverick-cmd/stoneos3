import {bundle} from "@remotion/bundler";
import {getCompositions, renderStill} from "@remotion/renderer";
import {mkdir} from "node:fs/promises";
import path from "node:path";

const workspace = path.resolve(import.meta.dirname, "../../..");
const outputDir = path.join(workspace, "artifacts", "product-manual", "screens");
await mkdir(outputDir, {recursive: true});

const serveUrl = await bundle({
  entryPoint: path.join(workspace, "packages", "video", "src", "index.ts"),
  webpackOverride: (config) => config,
});
const compositions = await getCompositions(serveUrl);
const composition = compositions.find((item) => item.id === "StoneOSProductManual");
if (!composition) throw new Error("StoneOSProductManual composition not found");

const frames = [
  ["01-control-room.png", 360],
  ["02-receive.png", 780],
  ["03-cutting.png", 1180],
  ["04-lpm.png", 1760],
  ["05-inventory.png", 2290],
  ["06-sales.png", 2810],
  ["07-roles.png", 3270],
];

for (const [filename, frame] of frames) {
  await renderStill({
    composition,
    serveUrl,
    output: path.join(outputDir, filename),
    frame,
    imageFormat: "png",
  });
}

console.log(`Rendered ${frames.length} manual screens to ${outputDir}`);
