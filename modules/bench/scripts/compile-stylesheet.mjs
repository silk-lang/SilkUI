import { readFileSync, writeFileSync } from 'node:fs';
import { compileStylesheet } from '../../js/packages/vite/src/compiler.js';

const input = new URL('../fixtures/rows.css', import.meta.url);
const output = new URL('../fixtures/rows.sheet', import.meta.url);
const { bytes, diagnostics } = compileStylesheet(readFileSync(input, 'utf8'));
writeFileSync(output, bytes);
for (const { kind, feature, count } of diagnostics) console.warn(`${kind}: ${feature} (${count})`);
console.log(`Wrote ${bytes.length} compiled bytes`);
