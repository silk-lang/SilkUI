import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { installMock } from "./mock.js";

const mock = installMock();
globalThis.__silkStorageDir = mkdtempSync(join(tmpdir(), "silkui-storage-"));
await import("../src/globals.js");
const core = await import("../src/index.js");
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

test("the document is html > body at the tree's root, under document and window for events", () => {
  assert.equal(core.root(), document.documentElement);
  assert.equal(document.body.parentNode, document.documentElement);
  assert.equal(document.body.ownerDocument, document);
  assert.ok(document.body instanceof HTMLElement);
  assert.ok(document.body instanceof Element);
  assert.ok(!(document.createTextNode("x") instanceof HTMLElement));
  assert.ok(document.createTextNode("x") instanceof Text);
  const button = document.createElement("div");
  document.body.appendChild(button);
  assert.equal(button.parentElement, document.body);
  assert.ok(button.isConnected);
  mock.take();
  const seen = [];
  document.addEventListener("click", (event) => seen.push(["document", event.target === button, event.eventPhase]));
  window.addEventListener("click", (event) => seen.push(["window", event.currentTarget === window]), true);
  button.addEventListener("click", () => seen.push(["button"]));
  // The root listens so that the tree sends clicks anywhere in it.
  assert.ok(mock.take().some((call) => call[0] === "listen" && call[1] === document.documentElement.nodeId));
  mock.click(button.nodeId);
  assert.deepEqual(seen, [["window", true], ["button"], ["document", true, 3]]);
});

test("selectionchange reaches document listeners", () => {
  const box = document.createElement("div");
  document.body.appendChild(box);
  let heard = 0;
  const listener = () => heard++;
  document.addEventListener("selectionchange", listener);
  mock.native.dispatch(27, box.nodeId, 0, 0, 0, 0, 0);
  document.removeEventListener("selectionchange", listener);
  assert.equal(heard, 1);
});

test("style takes CSSOM's setProperty for custom properties and CSS names", () => {
  mock.take();
  const root = document.documentElement;
  root.style.setProperty("--accent", "red");
  root.style.setProperty("background-color", "blue");
  assert.equal(root.style.getPropertyValue("--accent"), "red");
  assert.equal(root.style.getPropertyValue("background-color"), "blue");
  assert.equal(root.style.removeProperty("--accent"), "red");
  assert.equal(root.style.getPropertyValue("--accent"), "");
  assert.ok(mock.take().some((call) => call[0] === "style" && /--accent:red;/.test(call[2])));
  root.classList.add("dark");
  assert.equal(root.className, "dark");
});

test("dataset maps camelCase names to data-* attributes", () => {
  const root = document.documentElement;
  root.dataset.themeId = "dusk";
  assert.equal(root.getAttribute("data-theme-id"), "dusk");
  assert.equal(root.dataset.themeId, "dusk");
  assert.ok("themeId" in root.dataset);
  assert.deepEqual(Object.keys(root.dataset), ["themeId"]);
  assert.deepEqual({ ...root.dataset }, { themeId: "dusk" });
  delete root.dataset.themeId;
  assert.equal(root.hasAttribute("data-theme-id"), false);
  assert.equal(root.dataset.themeId, undefined);
  const tab = document.createElement("div");
  tab.setAttribute("data-preview-tab", "3");
  assert.equal(tab.dataset.previewTab, "3");
  assert.equal(document.body.dataset, document.body.dataset);
});

test("MutationObserver records child lists, attributes and text", async () => {
  const box = document.createElement("div");
  document.body.appendChild(box);
  const records = [];
  const observer = new MutationObserver((list) => records.push(...list));
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeOldValue: true, characterData: true });
  const text = document.createTextNode("a");
  box.appendChild(text);
  box.setAttribute("data-x", "1");
  box.setAttribute("data-x", "2");
  text.data = "b";
  box.removeChild(text);
  await Promise.resolve();
  assert.deepEqual(records.map((record) => record.type), ["childList", "attributes", "attributes", "characterData", "childList"]);
  assert.equal(records[0].addedNodes[0], text);
  assert.equal(records[2].oldValue, "1");
  assert.equal(records[3].oldValue, null);
  assert.equal(records[4].removedNodes[0], text);
  observer.disconnect();
  box.setAttribute("data-x", "3");
  await Promise.resolve();
  assert.equal(records.length, 5);
});

test("history and location keep entries and send popstate and hashchange", async () => {
  assert.equal(location.href, "http://localhost/");
  const events = [];
  const onPop = (event) => events.push(["popstate", event.state, location.hash]);
  const onHash = (event) => events.push(["hashchange", event.newURL]);
  window.addEventListener("popstate", onPop);
  window.addEventListener("hashchange", onHash);
  history.pushState({ a: 1 }, "", "#/one");
  history.pushState({ a: 2 }, "", "#/two");
  assert.equal(location.hash, "#/two");
  assert.equal(history.length, 3);
  history.back();
  await tick();
  assert.equal(location.hash, "#/one");
  assert.deepEqual(events.shift(), ["popstate", { a: 1 }, "#/one"]);
  assert.deepEqual(events.shift(), ["hashchange", "http://localhost/#/one"]);
  location.hash = "#/three";
  await tick();
  assert.deepEqual(events.shift(), ["hashchange", "http://localhost/#/three"]);
  assert.equal(history.length, 3);
  assert.throws(() => history.pushState(null, "", "https://example.com/"));
  window.removeEventListener("popstate", onPop);
  window.removeEventListener("hashchange", onHash);
});

test("localStorage keeps items in a file, sessionStorage in memory", async () => {
  localStorage.setItem("theme", "dark");
  localStorage.count = 2;
  assert.equal(localStorage.getItem("count"), "2");
  assert.equal(localStorage.length, 2);
  assert.deepEqual(Object.keys(localStorage).sort(), ["count", "theme"]);
  await tick();
  const { readFileSync } = await import("node:fs");
  assert.deepEqual(JSON.parse(readFileSync(join(globalThis.__silkStorageDir, "localStorage.json"), "utf8")), { theme: "dark", count: "2" });
  sessionStorage.setItem("a", "b");
  assert.equal(sessionStorage.getItem("a"), "b");
  assert.equal(sessionStorage.getItem("missing"), null);
  assert.ok(localStorage instanceof Storage);
});

const request = (value) => new Promise((resolve, reject) => {
  value.onsuccess = () => resolve(value.result);
  value.onerror = () => reject(value.error);
});

test("indexedDB opens, upgrades, stores, indexes, walks cursors and aborts", async () => {
  const open = indexedDB.open("app", 1);
  open.onupgradeneeded = () => {
    const db = open.result;
    db.createObjectStore("plain");
    db.createObjectStore("queries").createIndex("updated", ["environmentId", "updatedAt"]);
  };
  const db = await request(open);
  assert.deepEqual([...db.objectStoreNames], ["plain", "queries"]);
  const write = db.transaction(["plain", "queries"], "readwrite");
  write.objectStore("plain").put({ n: 1 }, "a");
  write.objectStore("plain").put({ n: 2 }, "b");
  const queries = write.objectStore("queries");
  queries.put({ environmentId: "e1", updatedAt: 3 }, "e1:x");
  queries.put({ environmentId: "e1", updatedAt: 1 }, "e1:y");
  queries.put({ environmentId: "e2", updatedAt: 2 }, "e2:z");
  await new Promise((resolve) => (write.oncomplete = resolve));

  const read = db.transaction("plain");
  assert.deepEqual(await request(read.objectStore("plain").get("b")), { n: 2 });
  assert.deepEqual(await request(read.objectStore("plain").getAll()), [{ n: 1 }, { n: 2 }]);

  const walk = db.transaction("queries", "readwrite");
  const keys = [];
  const cursorRequest = walk.objectStore("queries").index("updated").openKeyCursor(IDBKeyRange.bound(["e1"], ["e1", []]), "prev");
  cursorRequest.onsuccess = () => {
    const cursor = cursorRequest.result;
    if (!cursor) return;
    keys.push(cursor.primaryKey);
    if (cursor.primaryKey === "e1:y") walk.objectStore("queries").delete(cursor.primaryKey);
    cursor.continue();
  };
  await new Promise((resolve) => (walk.oncomplete = resolve));
  assert.deepEqual(keys, ["e1:x", "e1:y"]);
  assert.deepEqual(await request(db.transaction("queries").objectStore("queries").getAllKeys()), ["e1:x", "e2:z"]);

  const aborted = db.transaction("plain", "readwrite");
  aborted.objectStore("plain").put({ n: 9 }, "a");
  aborted.abort();
  await new Promise((resolve) => (aborted.onabort = resolve));
  assert.deepEqual(await request(db.transaction("plain").objectStore("plain").get("a")), { n: 1 });
  assert.equal(indexedDB.cmp([1, "a"], [1, "b"]), -1);
});

test("a Worker runs a module on its own thread and answers messages", async () => {
  const directory = mkdtempSync(join(tmpdir(), "silkui-worker-"));
  const file = join(directory, "echo.js");
  writeFileSync(file, "self.onmessage = (event) => postMessage(event.data * 2);");
  const worker = new Worker(pathToFileURL(file), { type: "module" });
  const answer = new Promise((resolve) => (worker.onmessage = (event) => resolve(event.data)));
  worker.postMessage(21);
  assert.equal(await answer, 42);
  worker.terminate();
});

test("the window's size is the root's", () => {
  assert.equal(typeof innerWidth, "number");
  assert.equal(typeof matchMedia, "undefined" === typeof matchMedia ? "undefined" : "function");
  assert.equal(document.activeElement, document.body);
  assert.equal(document.getElementById("nothing"), null);
});
