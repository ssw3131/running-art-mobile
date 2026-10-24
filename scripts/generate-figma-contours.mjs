// Source conversion only, not a test/build. Original SVGs are never rewritten.
import fs from 'node:fs';
const names = ['heart','star','cloud','crown','icecream','strawberry','fish','bone','whale','turtle','cat','dog'];
const contours = {};
for (const name of names) {
  const svg = fs.readFileSync(new URL(`../assets/generation/figma-20261024/${name}.svg`, import.meta.url), 'utf8');
  // Last path is the displayed outline; earlier paths in cat/dog are stroke masks.
  const path = [...svg.matchAll(/\sd="([^"]+)"/g)].at(-1)?.[1];
  if (!path) throw Error(`Missing outline: ${name}`);
  const tokens = path.match(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/g);
  let x = 0, y = 0, i = 0, command;
  const points = [];
  while (i < tokens.length) {
    if (/^[A-Za-z]$/.test(tokens[i])) command = tokens[i++];
    if (command === 'Z') { points.push([...points[0]]); command = undefined; continue; }
    if (command === 'M' || command === 'L') { x = Number(tokens[i++]); y = Number(tokens[i++]); if (command === 'M') command = 'L'; }
    else if (command === 'H') x = Number(tokens[i++]);
    else if (command === 'V') y = Number(tokens[i++]);
    else throw Error(`Unsupported source command: ${name}/${command}`);
    points.push([x, y]);
  }
  const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
  const cx = (Math.min(...xs) + Math.max(...xs))/2, cy = (Math.min(...ys) + Math.max(...ys))/2;
  const span = Math.max(Math.max(...xs)-Math.min(...xs),Math.max(...ys)-Math.min(...ys))/2;
  // Figma parents mirror crown and bone horizontally.
  contours[name] = points.map(([px,py]) => [Number(((px-cx)/span*(['crown','bone'].includes(name)?-1:1)).toFixed(7)),Number(((py-cy)/span).toFixed(7))]);
}
fs.writeFileSync(new URL('../src/modules/route-engine/figma-contours.ts', import.meta.url),
  `// Derived from Figma GEN-1 original polygon outlines; see scripts/generate-figma-contours.mjs.\nimport type { Point } from './types.ts';\nexport const FIGMA_SHAPE_VERSION = 'figma-20261024' as const;\nconst contours: Record<string, number[][]> = ${JSON.stringify(contours,null,2)};\nexport function figmaTemplate(shape: string): Point[] | null {\n  return contours[shape]?.map(([x,y]) => ({x,y})) ?? null;\n}\n`);
