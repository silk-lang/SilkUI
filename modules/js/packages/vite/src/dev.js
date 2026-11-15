// The development side of @silkui/vite: a Vite environment whose modules run in a ui-js host,
// reached over a local TCP connection the host opens (`--dev <port>`).
import { spawn } from "node:child_process";
import net from "node:net";
import { fileURLToPath } from "node:url";
import { build, DevEnvironment } from "vite";
import { resolveOptions } from "./resolve.js";

// The longest text on one line: the host reads lines of up to one mebibyte.
const CHUNK = 256 * 1024;

/** The lines that carry `text` as a message of `kind`. */
export function frames(kind, text) {
  const bytes = Buffer.from(text, "utf8");
  const lines = [];
  let at = 0;
  do {
    let end = Math.min(at + CHUNK, bytes.length);
    // Not inside a UTF-8 sequence: each line is text of its own.
    while (end < bytes.length && (bytes[end] & 0xc0) === 0x80) end--;
    lines.push(`${kind}${end < bytes.length ? "+" : "."}${bytes.toString("utf8", at, end)}\n`);
    at = end;
  } while (at < bytes.length);
  return lines;
}

/** The hot channel of the environment: every connected host is a client. */
function createChannel() {
  const sockets = new Set();
  const listeners = new Map();
  const emit = (event, data, client) => {
    for (const listener of listeners.get(event) ?? []) listener(data, client);
  };
  const write = (socket, kind, text) => {
    for (const line of frames(kind, text)) socket.write(line);
  };
  return {
    channel: {
      skipFsCheck: true,
      send(payload) {
        const text = JSON.stringify(payload);
        for (const socket of sockets) write(socket, "m", text);
      },
      on(event, listener) {
        if (!listeners.has(event)) listeners.set(event, new Set());
        listeners.get(event).add(listener);
      },
      off(event, listener) {
        listeners.get(event)?.delete(listener);
      },
    },
    /** Takes a host's connection: `bootstrap` first, then messages both ways. */
    accept(socket, bootstrap) {
      sockets.add(socket);
      socket.setNoDelay(true);
      const client = { send: (payload) => write(socket, "m", JSON.stringify(payload)) };
      let pending = "";
      socket.setEncoding("utf8");
      socket.on("data", (text) => {
        pending += text;
        let end;
        while ((end = pending.indexOf("\n")) !== -1) {
          const line = pending.slice(0, end);
          pending = pending.slice(end + 1);
          let payload;
          try {
            payload = JSON.parse(line);
          } catch {
            continue;
          }
          if (payload.type === "custom") emit(payload.event, payload.data, client);
        }
      });
      const gone = () => sockets.delete(socket);
      socket.on("close", gone);
      socket.on("error", gone);
      write(socket, "b", JSON.stringify(bootstrap));
      emit("connection", undefined, client);
    },
  };
}

/** The script a host runs first in each realm: the module runner, then the application. */
async function bootstrapScript(modules) {
  const output = await build({
    configFile: false,
    logLevel: "silent",
    root: fileURLToPath(new URL(".", import.meta.url)),
    build: {
      write: false,
      minify: false,
      target: "es2022",
      lib: { entry: "dev-client.js", formats: ["iife"], name: "__silkDev" },
      rolldownOptions: { output: { codeSplitting: false } },
    },
  });
  const code = (Array.isArray(output) ? output[0] : output).output[0].code;
  return `${code}\n__ui.devStart(${JSON.stringify(modules)});`;
}

/**
 * The plugins of `vite` (serve) for a ui-js application.
 * @param {{ entry: string, port: number, host?: { command: string, args?: readonly string[], cwd?: string } }} options
 */
export function devPlugins(options) {
  const { channel, accept } = createChannel();
  let listener = null;
  let child = null;
  // Modules other plugins ask to run before the entry, such as a framework's refresh runtime.
  let preload = [];

  const main = {
    name: "silk:dev",
    apply: "serve",
    // For tests and tools: the TCP server hosts connect to, once the dev server is set up.
    api: { listener: () => listener },

    config() {
      const define = { "process.env.NODE_ENV": JSON.stringify("development") };
      return {
        appType: "custom",
        environments: {
          silk: {
            define,
            // Nothing is left to the host to load: it has no module resolution of its own.
            resolve: { ...resolveOptions, noExternal: true },
            optimizeDeps: { noDiscovery: false, rolldownOptions: { transform: { define } } },
            dev: {
              createEnvironment: (name, config) => new DevEnvironment(name, config, { hot: true, transport: channel }),
            },
          },
        },
      };
    },

    configResolved(config) {
      preload = config.plugins.flatMap((plugin) => plugin.api?.silkPreload ?? []);
    },

    async configureServer(server) {
      const entry = options.entry.startsWith("/") ? options.entry : `/${options.entry}`;
      const bootstrap = await bootstrapScript([...preload, entry]);
      listener = net.createServer((socket) => accept(socket, bootstrap));
      await new Promise((resolve, reject) => {
        listener.once("error", reject);
        listener.listen(options.port, "127.0.0.1", resolve);
      });
      const { port } = listener.address();
      // Closes with the dev server, whether or not that has an HTTP server of its own.
      const close = server.close.bind(server);
      server.close = async () => {
        listener.close();
        await close();
      };
      if (!options.host) {
        server.config.logger.info(`  [silk] waiting for a ui-js host: start one with --dev ${port}`);
        return;
      }
      const { command, args = [], cwd } = options.host;
      child = spawn(command, [...args, "--dev", String(port)], { cwd, stdio: "inherit" });
      child.on("error", (error) => server.config.logger.error(`[silk] could not start ${command}: ${error.message}`));
      // Closing the window ends the dev session.
      child.on("exit", (code) => process.exit(code ?? 0));
      process.on("exit", () => child.kill());
    },
  };

  return [main];
}
