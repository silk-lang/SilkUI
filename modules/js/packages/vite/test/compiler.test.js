import assert from 'node:assert/strict';
import test from 'node:test';
import { compileStylesheet } from '../src/compiler.js';

test('compiles layers, variables, conditions, and modern colors using the shipped wasm', () => {
  const source = '@layer theme, utilities; @layer theme { :root { --gap: 4px } } @layer utilities { .card:hover { padding: calc(var(--gap) * 2); color: color-mix(in oklch, red 30%, blue) } } @media (min-width: 10px) { .card { display: flex } }';
  const { bytes, diagnostics } = compileStylesheet(source, { strict: true });
  assert.equal(new TextDecoder().decode(bytes.slice(0, 8)), 'SILKCSS\0');
  assert.equal(new DataView(bytes.buffer).getUint32(8, true), 7);
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
  assert.equal(new DataView(bytes.buffer).getUint32(8, true), 7);
  assert.deepEqual(diagnostics, []);
  assert.deepEqual(compileStylesheet(source).bytes, bytes);
  const unsupported = '.card::before { content: counter(item); content: url(icon.png); }';
  assert.deepEqual(compileStylesheet(unsupported).diagnostics, [{ kind: 'feature', feature: 'content', count: 2 }]);
  assert.throws(() => compileStylesheet(unsupported, { strict: true }));
  const suffix = '.card::before:hover { color: red }';
  assert.deepEqual(compileStylesheet(suffix).diagnostics, [{ kind: 'feature', feature: 'pseudo-element state', count: 1 }]);
  assert.throws(() => compileStylesheet(suffix, { strict: true }));
});

test('ships container units and serialized condition programs', () => {
  const declarations = '.card { container: card / inline-size; width: 10cqw; height: 20cqh; padding: 1cqi 2cqb; margin: 1cqmin 2cqmax; }';
  assert.deepEqual(compileStylesheet(declarations, { strict: true }).diagnostics, []);
  const source = `${declarations} @container card (width > calc(10em + 1px)) and ((height > 20px) or unknown(value)) { .child { width: 50cqw } }`;
  const { bytes, diagnostics } = compileStylesheet(source, { strict: true });
  assert.equal(new DataView(bytes.buffer).getUint32(8, true), 7);
  assert.deepEqual(compileStylesheet(source).bytes, bytes);
  assert.deepEqual(diagnostics, []);
});


test('compiles tree part targets and reports unavailable pseudo-elements', () => {
  const css = '.input::placeholder{color:red}.input::selection{color:white;background-color:blue}.scroll::-webkit-scrollbar{width:8px}.scroll::-webkit-scrollbar-thumb{background-color:gray}.scroll::-webkit-scrollbar-track{background-color:white}';
  assert.deepEqual(compileStylesheet(css, { strict: true }).diagnostics, []);
  const unsupported = '.input::file-selector-button{color:red}.modal::backdrop{color:blue}.list::marker{color:green}';
  assert.deepEqual(compileStylesheet(unsupported).diagnostics, [
    { kind: 'feature', feature: 'file-selector-button', count: 1 },
    { kind: 'feature', feature: 'backdrop', count: 1 },
    { kind: 'feature', feature: 'marker', count: 1 },
  ]);
  assert.throws(() => compileStylesheet(unsupported, { strict: true }));
});
