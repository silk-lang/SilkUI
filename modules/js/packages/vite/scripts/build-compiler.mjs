import { spawnSync } from 'node:child_process';
import { copyFileSync, chmodSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const result = spawnSync(process.env.SILK ?? 'silk', ['build', '--manifest-path', root + 'compiler/silk.toml', '--target', 'wasm32-unknown-unknown', '--release', '--debug', 'false'], { stdio: 'inherit' });
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
copyFileSync(root + 'compiler/build/wasm32-unknown-unknown/release/silkui-css-compiler.wasm', root + 'src/compiler.wasm');
chmodSync(root + 'src/compiler.wasm', 0o644);
