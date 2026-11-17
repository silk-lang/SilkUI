#!/usr/bin/env node
// silkui runs this before it bundles and builds an app: it describes the Silk functions the
// project exports to JavaScript and writes `.silk/natives/` under the project root:
// natives.json (what `.silk` imports become), natives.silk (the host's dispatcher) and
// types/<source>.d.silk.ts (declarations for a tsconfig `rootDirs` without the content mapper).
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { NATIVES_DIR, declarations, describeProject, hasFunctions, silkGlue } from "../src/natives.js";

const root = resolve(process.argv[2] ?? ".");
try {
  const description = await describeProject(root);
  const out = join(root, NATIVES_DIR);
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "natives.json"), `${JSON.stringify(description, null, 2)}\n`);
  if (hasFunctions(description)) {
    if (!description.library) throw new Error("silk.toml exports modules to JavaScript, so the package must be a library: set `kind = \"library\"` and give the tasks their own profile (`[profiles.tasks] main = \"tasks.silk\"`)");
    writeFileSync(join(out, "natives.silk"), silkGlue(description));
  }
  for (const module of description.modules) {
    const types = join(out, "types", `${relative(root, module.file).replace(/\.silk$/, "")}.d.silk.ts`);
    mkdirSync(join(types, ".."), { recursive: true });
    writeFileSync(types, declarations(module));
    for (const fn of module.functions) {
      if (fn.unsupported) console.warn(`silkui: ${module.module}.${fn.name} is not available to JavaScript: ${fn.unsupported}`);
    }
  }
} catch (error) {
  console.error(`silkui: ${error.message}`);
  process.exit(1);
}
