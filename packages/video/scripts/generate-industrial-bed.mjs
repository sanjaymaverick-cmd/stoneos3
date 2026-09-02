import {mkdir, writeFile} from "node:fs/promises";
import path from "node:path";

const sampleRate = 44100;
const seconds = 90;
const samples = sampleRate * seconds;
const output = Buffer.alloc(44 + samples * 2);

output.write("RIFF", 0);
output.writeUInt32LE(36 + samples * 2, 4);
output.write("WAVE", 8);
output.write("fmt ", 12);
output.writeUInt32LE(16, 16);
output.writeUInt16LE(1, 20);
output.writeUInt16LE(1, 22);
output.writeUInt32LE(sampleRate, 24);
output.writeUInt32LE(sampleRate * 2, 28);
output.writeUInt16LE(2, 32);
output.writeUInt16LE(16, 34);
output.write("data", 36);
output.writeUInt32LE(samples * 2, 40);

let seed = 20260715;
const noise = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 0xffffffff * 2 - 1;
};

for (let i = 0; i < samples; i++) {
  const t = i / sampleRate;
  const beat = t % 0.75;
  const bar = t % 3;
  const kick = beat < 0.19 ? Math.sin(2 * Math.PI * (72 - beat * 170) * beat) * Math.exp(-beat * 27) : 0;
  const metalT = (bar + 3 - 1.5) % 3;
  const metal = metalT < 0.13 ? (Math.sin(2 * Math.PI * 530 * metalT) + .45 * Math.sin(2 * Math.PI * 790 * metalT)) * Math.exp(-metalT * 32) : 0;
  const hum = Math.sin(2 * Math.PI * 48 * t) * .13 + Math.sin(2 * Math.PI * 96 * t) * .05;
  const texture = noise() * .012;
  const fadeIn = Math.min(1, t / 2.2);
  const fadeOut = Math.min(1, (seconds - t) / 3.5);
  const pulse = .72 + .16 * Math.sin(2 * Math.PI * t / 12);
  const value = Math.max(-1, Math.min(1, (kick * .30 + metal * .105 + hum + texture) * fadeIn * fadeOut * pulse));
  output.writeInt16LE(Math.round(value * 32767), 44 + i * 2);
}

const outputDir = path.resolve(import.meta.dirname, "../public/audio");
await mkdir(outputDir, {recursive: true});
const outputPath = path.join(outputDir, "marketing-bed.wav");
await writeFile(outputPath, output);
console.log(`Generated ${seconds}s industrial bed at ${outputPath}`);
