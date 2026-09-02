import {bundle} from "@remotion/bundler";
import {getCompositions, renderStill} from "@remotion/renderer";
import {mkdir} from "node:fs/promises";
import path from "node:path";

const workspace = path.resolve(import.meta.dirname, "../../..");
const outputDir = path.join(workspace, "artifacts", "product-marketing", "qa-stills");
await mkdir(outputDir, {recursive: true});

const serveUrl = await bundle({
  entryPoint: path.join(workspace, "packages", "video", "src", "index.ts"),
  webpackOverride: (config) => config,
});
const compositions = await getCompositions(serveUrl);
const composition = compositions.find((item) => item.id === "StoneOSPartnerMarketing");
if (!composition) throw new Error("StoneOSPartnerMarketing composition not found");

const frames = [
  ["01-intro.png", 80],
  ["02-control-room.png", 260],
  ["03-predictive.png", 650],
  ["04-ai.png", 1060],
  ["05-operations.png", 1500],
  ["06-inventory.png", 1830],
  ["07-commercial.png", 2170],
  ["08-outro.png", 2500],
];

for (const [filename, frame] of frames) {
  await renderStill({composition, serveUrl, output: path.join(outputDir, filename), frame, imageFormat: "png"});
}

console.log(`Rendered ${frames.length} partner video QA stills to ${outputDir}`);
