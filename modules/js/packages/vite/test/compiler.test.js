import assert from 'node:assert/strict';
import test from 'node:test';
import { compileStylesheet } from '../src/compiler.js';

test('compiles layers, variables, conditions, and modern colors using the shipped wasm', () => {
  const source = '@layer theme, utilities; @layer theme { :root { --gap: 4px } } @layer utilities { .card:hover { padding: calc(var(--gap) * 2); color: color-mix(in oklch, red 30%, blue) } } @media (min-width: 10px) { .card { display: flex } }';
  const { bytes, diagnostics } = compileStylesheet(source, { strict: true });
  assert.equal(new TextDecoder().decode(bytes.slice(0, 8)), 'SILKCSS\0');
  assert.equal(new DataView(bytes.buffer).getUint32(8, true), 5);
  assert.deepEqual(diagnostics, []);
  assert.deepEqual(compileStylesheet(source).bytes, bytes);
  assert.equal(new TextDecoder().decode(bytes).includes(source), false);
});

test('reports aggregated dropped features and strict mode rejects them', () => {
  const css = '.a { made-up-property: 1 } .b { made-up-property: 2 }';
  const result = compileStylesheet(css);
  assert.deepEqual(result.diagnostics, [{ kind: 'property', feature: 'made-up-property', count: 2 }]);
  assert.throws(() => compileStylesheet(css, { strict: true }), error => error.diagnostics[0].count === 2);
  assert.deepEqual(compileStylesheet('.valid { width: 3px }', { strict: true }).diagnostics, []);
});

test('results keep their bytes after subsequent compilations and memory growth', () => {
  const first = compileStylesheet('.a { color: red }').bytes;
  const saved = first.slice();
  const css = Array.from({ length: 500 }, (_, i) => `.rule-${i} { width: ${i}px; }`).join('\n');
  assert.ok(compileStylesheet(css).bytes.length > first.length);
  assert.deepEqual(first, saved);
});


test('ships generated pseudo programs and diagnoses unsupported content', () => {
  const source = `.card { &::before { content: ""; } &::after { content: attr(data-label, "fallback"); color: red; } }`;
  const { bytes, diagnostics } = compileStylesheet(source, { strict: true });
  assert.equal(new DataView(bytes.buffer).getUint32(8, true), 5);
  assert.deepEqual(diagnostics, []);
  assert.deepEqual(compileStylesheet(source).bytes, bytes);
  const unsupported = '.card::before { content: counter(item); content: url(icon.png); }';
  assert.deepEqual(compileStylesheet(unsupported).diagnostics, [{ kind: 'feature', feature: 'content', count: 2 }]);
  assert.throws(() => compileStylesheet(unsupported, { strict: true }));
});
