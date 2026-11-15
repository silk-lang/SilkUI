import { readFileSync } from 'node:fs';

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const kinds = ['at-rule', 'selector', 'property', 'value', 'feature'];
let compiler;

export function compileStylesheet(css, { strict = false } = {}) {
  compiler ??= createCompiler();
  return compiler(css, strict);
}

function createCompiler() {
  let input, result, diagnostics, instance;
  const module = new WebAssembly.Module(readFileSync(new URL('./compiler.wasm', import.meta.url)));
  instance = new WebAssembly.Instance(module, {
    stylesheet: {
      input_length: () => input.length,
      input_read: (pointer, length) => new Uint8Array(instance.exports.memory.buffer, pointer, length).set(input),
      output: (pointer, length) => { result = new Uint8Array(instance.exports.memory.buffer, pointer, length).slice(); },
      diagnostic: (kind, pointer, length, count) => {
        diagnostics.push({ kind: kinds[kind], feature: decoder.decode(new Uint8Array(instance.exports.memory.buffer, pointer, length)), count });
      },
    },
  });
  return (css, strict) => {
    input = encoder.encode(css);
    if (input.length > 64 * 1024 * 1024) throw new RangeError('Stylesheet exceeds the 64 MiB compiler input limit');
    result = null;
    diagnostics = [];
    const status = instance.exports.compile_stylesheet(strict ? 1 : 0);
    input = null;
    if (status !== 0 || !result) {
      const error = new Error(status === 1 ? 'Stylesheet contains unsupported CSS in strict mode' : 'Stylesheet compilation failed');
      error.diagnostics = diagnostics;
      throw error;
    }
    return { bytes: result, diagnostics };
  };
}
