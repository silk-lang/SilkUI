import assert from "node:assert/strict";
import { test } from "node:test";
import { installMock } from "./mock.js";

const mock = installMock();
const { createBox, createText, createInput, createIcon, createRichInput, createNode, OBJECT, mount, nodeById, setErrorHandler, parseMarkdown, defineKeyframes, announce } = await import("../src/index.js");

test("nodes queue their mutations", () => {
  mock.take();
  const label = createText("hi");
  const box = createBox({ width: 10, opacity: 0.5, backgroundColor: "red", gridColumn: 2 }, label);
  mount(box);
  assert.deepEqual(mock.take(), [
    ["create", label.nodeId, 1],
    ["setText", label.nodeId, "hi"],
    ["create", box.nodeId, 0],
    ["style", box.nodeId, "width:10px;opacity:0.5;background-color:red;grid-column:2;", 0],
    ["append", box.nodeId, label.nodeId],
    ["root", box.nodeId],
  ]);
  assert.equal(label.parentNode, box);
  assert.equal(nodeById(box.nodeId), box);
});

test("a style sends what changed, and removal restarts the look", () => {
  const box = createBox({ width: 10, height: 20 });
  mock.take();
  box.style.set({ width: 10, height: 30 });
  assert.deepEqual(mock.take(), [["style", box.nodeId, "height:30px;", 0]]);
  box.style.set({ width: null });
  assert.deepEqual(mock.take(), [["clearStyle", box.nodeId, 0], ["style", box.nodeId, "height:30px;", 0]]);
  box.look("hover").set({ color: "blue" });
  assert.deepEqual(mock.take(), [["style", box.nodeId, "color:blue;", 1]]);
});

test("moving a child keeps one parent", () => {
  const a = createBox();
  const b = createBox();
  const child = createBox();
  a.append(child);
  b.insertBefore(child, null);
  assert.deepEqual(a.childNodes, []);
  assert.deepEqual(b.childNodes, [child]);
  assert.throws(() => child.append(b), /own subtree/);
  child.remove();
  assert.equal(child.parentNode, null);
});

test("events run capture, target and bubble phases", () => {
  const root = createBox();
  const middle = createBox();
  const leaf = createBox();
  root.append(middle);
  middle.append(leaf);
  const log = [];
  root.addEventListener("click", (event) => log.push("root capture " + event.eventPhase), true);
  middle.addEventListener("click", (event) => log.push("middle " + event.eventPhase));
  leaf.addEventListener("click", (event) => log.push("leaf " + event.eventPhase + " " + event.clientX));
  root.addEventListener("click", (event) => log.push("root " + event.eventPhase));
  assert.equal(mock.click(leaf.nodeId, 7), false);
  assert.deepEqual(log, ["root capture 1", "leaf 2 7", "middle 3", "root 3"]);

  log.length = 0;
  middle.addEventListener("click", (event) => event.stopPropagation());
  mock.click(leaf.nodeId);
  assert.deepEqual(log, ["root capture 1", "leaf 2 0", "middle 3"]);
});

test("listen flags follow the listeners", () => {
  const box = createBox();
  mock.take();
  const listener = () => {};
  box.addEventListener("click", listener);
  box.addEventListener("keydown", listener, { once: true });
  box.removeEventListener("click", listener);
  assert.deepEqual(mock.take(), [["listen", box.nodeId, 4], ["listen", box.nodeId, 4 | 128], ["listen", box.nodeId, 128]]);
  assert.throws(() => box.addEventListener("nope", listener), /no event/);
});

test("preventDefault reaches the host for cancelable events only", () => {
  const box = createBox();
  box.addEventListener("pointerdown", (event) => event.preventDefault());
  box.addEventListener("focus", (event) => event.preventDefault());
  assert.equal(mock.native.dispatch(0, box.nodeId, 0, 0, 0, 0, 1), true);
  assert.equal(mock.native.dispatch(9, box.nodeId, 0, 0, 0, 0, 0), false);
});

test("transition events bubble with their property and elapsed time", () => {
  const outer = createBox();
  const inner = createBox();
  outer.append(inner);
  mock.take();
  let seen;
  outer.addEventListener("transitionend", (event) => (seen = [event.propertyName, event.elapsedTime, event.target]));
  assert.deepEqual(mock.take(), [["listen", outer.nodeId, 1 << 21]]);
  mock.native.dispatch(21, inner.nodeId, 0.25, 0, 0, 0, 0, "opacity");
  assert.deepEqual(seen, ["opacity", 0.25, inner]);
});

test("an input follows what the user types", () => {
  const input = createInput();
  let seen;
  input.addEventListener("input", (event) => (seen = event.value + "/" + event.inputType));
  mock.input(input.nodeId, "abc");
  assert.equal(seen, "abc/insertText");
  assert.equal(input.value, "abc");
});

test("a listener that throws does not stop the dispatch", () => {
  const box = createBox();
  const log = [];
  box.addEventListener("click", () => {
    throw new Error("boom");
  });
  box.addEventListener("click", () => log.push("second"));
  mock.click(box.nodeId);
  assert.deepEqual(log, ["second"]);
  assert.throws(() => mock.native.takeError(), /boom/);
  mock.native.takeError();

  const errors = [];
  setErrorHandler((error) => errors.push(error.message));
  mock.click(box.nodeId);
  assert.deepEqual(errors, ["boom"]);
  setErrorHandler(null);
});

test("unload destroys every node, for a reload", () => {
  const box = createBox({}, createText("bye"));
  mount(box);
  mock.take();
  mock.native.unload();
  const destroyed = mock.take().filter((call) => call[0] === "destroy").map((call) => call[1]);
  assert.ok(destroyed.includes(box.nodeId));
  assert.equal(nodeById(box.nodeId), null);
});

test("a font family list is defined once and named by number", () => {
  mock.take();
  const a = createBox({ fontFamily: "monospace" });
  const b = createBox({ fontFamily: "monospace" });
  const calls = mock.take();
  const defined = calls.filter((call) => call[0] === "fontFamily");
  assert.equal(defined.length, 1);
  assert.equal(defined[0][2], "monospace");
  const id = defined[0][1];
  assert.deepEqual(calls.filter((call) => call[0] === "style"), [
    ["style", a.nodeId, "font-family:" + id + ";", 0],
    ["style", b.nodeId, "font-family:" + id + ";", 0],
  ]);
});

test("keyframes are defined frame by frame, with CSS selectors", () => {
  mock.take();
  defineKeyframes("pulse", { "0%, 100%": { opacity: 1 }, "50%": { opacity: 0.5, width: 10 } });
  assert.deepEqual(mock.take(), [
    ["keyframe", 0, "opacity:1;"],
    ["keyframe", 1, "opacity:1;"],
    ["keyframe", 0.5, "opacity:0.5;width:10px;"],
    ["keyframes", "pulse"],
  ]);
  defineKeyframes("pulse", null);
  assert.deepEqual(mock.take(), [["keyframes", "pulse"]]);
});

test("identical icon markup shares one resource, released when no icon shows it", () => {
  mock.take();
  const check = "<svg viewBox='0 0 24 24'><path d='M20 6 9 17l-5-5'/></svg>";
  const x = "<svg viewBox='0 0 24 24'><path d='M18 6 6 18'/></svg>";
  const a = createIcon(check);
  const b = createIcon(check);
  let calls = mock.take();
  const defined = calls.filter((call) => call[0] === "defineIcon");
  assert.deepEqual(defined.map((call) => call[2]), [check]);
  const id = defined[0][1];
  assert.deepEqual(calls.filter((call) => call[0] === "source"), [["source", a.nodeId, id], ["source", b.nodeId, id]]);
  a.svg = x;
  b.svg = check;
  calls = mock.take();
  assert.equal(calls.filter((call) => call[0] === "release").length, 0, "b still shows the check");
  b.destroy();
  a.svg = "";
  calls = mock.take();
  assert.deepEqual(calls.filter((call) => call[0] === "release").map((call) => call[1]).length, 2, "both released");
  assert.deepEqual(calls.find((call) => call[0] === "source"), ["source", a.nodeId, 0]);
});

test("a click inside a link opens its address unless a listener prevents it", () => {
  const opened = [];
  globalThis.open = (url) => opened.push(url);
  const link = createBox();
  const inside = createBox();
  link.append(inside);
  mock.take();
  link.setAttribute("href", "https://example.com/");
  assert.deepEqual(mock.take(), [["listen", link.nodeId, 4], ["attribute", link.nodeId, "href", "https://example.com/"]]);
  mock.click(inside.nodeId);
  assert.deepEqual(opened, ["https://example.com/"]);

  const stop = (event) => event.preventDefault();
  link.addEventListener("click", stop);
  mock.click(inside.nodeId);
  assert.equal(opened.length, 1);
  link.removeEventListener("click", stop);
  assert.deepEqual(mock.take(), [], "the link still wants clicks");

  link.setAttribute("href", "");
  assert.deepEqual(mock.take(), [["listen", link.nodeId, 0], ["attribute", link.nodeId, "href", ""]]);
  delete globalThis.open;
});

test("role and literal ARIA values reach the native attribute pipeline", () => {
  const box = createBox();
  mock.take();
  box.setAttribute("role", "button");
  box.setAttribute("aria-label", "Save");
  box.setAttribute("ariaExpanded", true);
  box.setAttribute("aria-checked", "mixed");
  box.setAttribute("aria-selected", "true");
  box.setAttribute("ariaLevel", 2);
  box.setAttribute("aria-live", "polite");
  assert.deepEqual(mock.take(), [
    ["attribute", box.nodeId, "role", "button"],
    ["attribute", box.nodeId, "aria-label", "Save"],
    ["attribute", box.nodeId, "aria-expanded", "true"],
    ["attribute", box.nodeId, "aria-checked", "mixed"],
    ["attribute", box.nodeId, "aria-selected", "true"],
    ["attribute", box.nodeId, "aria-level", "2"],
    ["attribute", box.nodeId, "aria-live", "polite"],
  ]);
});

test("aria-value* make one range, and it clears without a value", () => {
  const box = createBox();
  mock.take();
  box.setAttribute("aria-valuenow", "30");
  box.setAttribute("ariaValueMax", 50);
  box.setAttribute("aria-valuenow", null);
  assert.deepEqual(mock.take(), [
    ["attribute", box.nodeId, "valueRange", 0, 100, 30],
    ["attribute", box.nodeId, "aria-valuenow", "30"],
    ["attribute", box.nodeId, "valueRange", 0, 50, 30],
    ["attribute", box.nodeId, "aria-valuemax", "50"],
    ["attribute", box.nodeId, "valueRange"],
    ["attribute", box.nodeId, "aria-valuenow", null],
  ]);
});

test("ARIA relations retain literal IDs while targets change", () => {
  const field = createBox();
  const title = createBox();
  const hint = createBox();
  mock.take();
  field.setAttribute("aria-labelledby", "title missing");
  title.setAttribute("id", "title");
  field.setAttribute("ariaDescribedBy", "hint");
  hint.setAttribute("id", "hint");
  hint.setAttribute("id", "");
  title.destroy();
  field.setAttribute("aria-labelledby", null);
  assert.deepEqual(mock.take(), [
    ["attribute", field.nodeId, "aria-labelledby", "title missing"],
    ["attribute", title.nodeId, "id", "title"],
    ["attribute", field.nodeId, "aria-describedby", "hint"],
    ["attribute", hint.nodeId, "id", "hint"],
    ["attribute", hint.nodeId, "id", ""],
    ["destroy", title.nodeId],
    ["attribute", field.nodeId, "aria-labelledby", null],
  ]);
});

test("unknown roles warn once while arbitrary ARIA names remain available to selectors", () => {
  const box = createBox();
  const warnings = [];
  const warn = console.warn;
  console.warn = (message) => warnings.push(message);
  try {
    mock.take();
    box.setAttribute("role", "unknown");
    box.setAttribute("role", "unknown");
    box.setAttribute("aria-braillelabel", "x");
    assert.deepEqual(mock.take(), [
      ["attribute", box.nodeId, "role", "unknown"],
      ["attribute", box.nodeId, "role", "unknown"],
      ["attribute", box.nodeId, "aria-braillelabel", "x"],
    ]);
    assert.deepEqual(warnings, ["the tree has no role 'unknown': it is ignored"]);
  } finally {
    console.warn = warn;
  }
});

test("parseMarkdown turns GFM on unless told otherwise", () => {
  mock.take();
  assert.deepEqual(parseMarkdown("# hi"), { type: "root", children: [] });
  parseMarkdown("x", { gfm: false, footnotes: true });
  parseMarkdown("x", { tables: false, alerts: true });
  assert.deepEqual(mock.take().map((call) => call[2]), [15, 16, 78]);
});

test("a rich input sends its document with UTF-8 offsets and names its marks", () => {
  const input = createRichInput();
  assert.equal(createNode("richinput").kind, "input");
  mock.take();
  input.defineMark("bold", { fontWeight: 700 });
  input.defineMark("code", { fontFamily: "monospace", backgroundColor: "#eee" });
  input.defineAtom("mention", { paddingLeft: 4, borderRadius: 4 });
  const text = "héllo " + OBJECT + " x";
  input.document = { text, marks: [{ start: 0, end: 5, marks: ["bold", "code"] }], atoms: [{ kind: "mention", label: "@ada", data: "u1" }] };
  const calls = mock.take();
  assert.deepEqual(calls[0], ["mark", input.nodeId, 0, "font-weight:700;"]);
  assert.equal(calls[1][2], 1);
  assert.deepEqual(calls[2], ["atomStyle", input.nodeId, 0, "padding-left:4px;border-radius:4px;"]);
  assert.deepEqual(calls[3], ["richText", input.nodeId, text, "0,6,3;", "0\0@ada\0u1\0"]);
  assert.equal(input.value, text);

  // An input record from the tree comes back in string indices and mark names.
  const marks = "0,6,1;";
  const atoms = "0\0@ada\0u1\0";
  const after = text + "!";
  let seen = null;
  input.addEventListener("input", (event) => (seen = event));
  globalThis.__ui.dispatch(11, input.nodeId, 13, 13, 0, 1, 0, after, "insertText", marks, atoms);
  assert.equal(seen.inputType, "insertText");
  assert.deepEqual(input.document, { text: after, marks: [{ start: 0, end: 5, marks: ["bold"] }], atoms: [{ kind: "mention", label: "@ada", data: "u1" }] });
  assert.deepEqual(input.activeMarks, ["bold"]);
  assert.equal(input.selectionStart, 10);

  mock.take();
  input.toggleMark("bold");
  input.insertAtom(8, 10, { kind: "mention", label: "@bo", data: "u2" });
  input.setSelectionRange(1, 2);
  assert.deepEqual(mock.take(), [
    ["format", input.nodeId, 0, false],
    ["insertAtom", input.nodeId, 11, 13, "0\0@bo\0u2\0"],
    ["select", input.nodeId, 1, 3],
  ]);
});

test("selectionchange moves the caret of an input and names a rich input's typing marks", () => {
  const input = createRichInput();
  input.defineMark("bold", { fontWeight: 700 });
  input.document = { text: "é" + OBJECT + "x", marks: [], atoms: [{ kind: "mention", label: "@a", data: "" }] };
  mock.take();
  let seen = null;
  input.addEventListener("selectionchange", (event) => (seen = event));
  assert.equal(mock.take()[0][0], "listen");
  // Bytes 5 and 6 are the end of the object character and of "x".
  globalThis.__ui.dispatch(27, input.nodeId, 5, 6, 0, 1, 0);
  assert.equal(seen.type, "selectionchange");
  assert.equal(seen.selectionStart, 2);
  assert.equal(input.selectionEnd, 3);
  assert.deepEqual(input.activeMarks, ["bold"]);
});

test("announce speaks through a hidden live region made before its text", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const app = mount(createBox());
  mock.take();
  announce("Saved");
  const made = mock.take();
  const region = app.childNodes.at(-1);
  assert.ok(made.some((call) => call[0] === "attribute" && call[1] === region.nodeId && call[2] === "aria-live" && call[3] === "polite"));
  assert.ok(made.some((call) => call[0] === "append" && call[1] === app.nodeId && call[2] === region.nodeId));
  assert.equal(region.childNodes.length, 0, "the text waits, so the region exists before it changes");
  t.mock.timers.tick(100);
  assert.equal(region.childNodes[0].data, "Saved");
  announce("Saved");
  t.mock.timers.tick(100);
  assert.equal(region.childNodes.length, 1, "a repeat replaces the node, so it is a change too");
  assert.equal(app.childNodes.at(-1), region, "one region per politeness");
  announce("Failed", { politeness: "assertive" });
  assert.notEqual(app.childNodes.at(-1), region);
  t.mock.timers.tick(7100);
  assert.equal(region.childNodes.length, 0, "messages go after a while");
});

test("CSS identity is independent from protocol identity", () => {
  const box = createBox();
  const number = box.nodeId;
  box.id = "save";
  assert.equal(box.getAttribute("id"), "save");
  assert.equal(box.nodeId, number);
  assert.equal(nodeById(number), box);
  assert.throws(() => { box.nodeId = 1000; }, TypeError);
  box.className = "button\tprimary button";
  const list = box.classList;
  assert.equal(list.length, 2);
  assert.deepEqual([...list], ["button", "primary"]);
  list.add("wide", "primary");
  assert.equal(box.className, "button primary wide");
  assert.equal(list.toggle("wide", false), false);
  assert.equal(list.toggle("active"), true);
  assert.equal(list.replace("button", "primary"), true);
  assert.equal(list.replace("absent", "other"), false);
  assert.deepEqual([...list], ["primary", "active"]);
  const before = box.className;
  assert.throws(() => list.add("valid", "two words"), { name: "InvalidCharacterError" });
  assert.throws(() => list.remove(""), { name: "SyntaxError" });
  assert.equal(box.className, before);
  box.setAttribute("className", "new");
  assert.deepEqual([...list], ["new"]);
  box.removeAttribute("class");
  box.removeAttribute("id");
  assert.equal(box.classList, list);
  assert.equal(list.length, 0);
  assert.equal(box.id, "");
  assert.equal(box.hasAttribute("class"), false);
  assert.equal(box.hasAttribute("id"), false);
  assert.equal(box.nodeId, number);
});

test("named attributes preserve false, empty, replacement and absence", () => {
  const box = createBox();
  mock.take();
  box.setAttribute("data-state", false);
  box.setAttribute("data-empty", "");
  box.setAttribute("ariaExpanded", false);
  assert.equal(box.getAttribute("data-state"), "false");
  assert.equal(box.getAttribute("data-empty"), "");
  assert.equal(box.getAttribute("aria-expanded"), "false");
  box.setAttribute("data-state", "open");
  box.removeAttribute("data-empty");
  box.removeAttribute("aria-expanded");
  assert.equal(box.getAttribute("data-state"), "open");
  assert.equal(box.getAttribute("data-empty"), null);
  assert.equal(box.getAttribute("ariaExpanded"), null);
  assert.deepEqual(mock.take(), [
    ["attribute", box.nodeId, "data-state", "false"],
    ["attribute", box.nodeId, "data-empty", ""],
    ["attribute", box.nodeId, "aria-expanded", "false"],
    ["attribute", box.nodeId, "data-state", "open"],
    ["attribute", box.nodeId, "data-empty", null],
    ["attribute", box.nodeId, "aria-expanded", null],
  ]);
});


test("custom properties preserve case and unitless numeric tokens", () => {
  mock.take();
  const box = createBox({ "--Scale": 2, "--Gap": "8px", width: "calc(var(--Gap) * var(--Scale))" });
  assert.deepEqual(mock.take(), [
    ["create", box.nodeId, 0],
    ["style", box.nodeId, "--Scale:2;--Gap:8px;width:calc(var(--Gap) * var(--Scale));", 0],
  ]);
  box.style.set({ "--Scale": null });
  assert.deepEqual(mock.take(), [
    ["clearStyle", box.nodeId, 0],
    ["style", box.nodeId, "--Gap:8px;width:calc(var(--Gap) * var(--Scale));", 0],
  ]);
});
