import assert from "node:assert/strict";
import { test } from "node:test";
import { installMock } from "./mock.js";

const mock = installMock();
// The tree's document selection, as selection.test.js keeps it.
const tree = { ends: null };
let numbers = [];
const native = mock.native;
native.geometry = (index) => numbers[index] ?? 0;
native.selection = () => {
  if (!tree.ends) return (numbers = [], 0);
  numbers = [...tree.ends, ...tree.ends];
  return 1;
};
native.setSelection = (anchor, anchorOffset, focus, focusOffset) => {
  tree.ends = anchor === 0 ? null : [anchor, anchorOffset, focus, focusOffset];
  return 1;
};
const { createElement, createText, mount, getSelection, LineBreak } = await import("../src/index.js");

const BEFORE_INPUT = 37;
const FOCUS = 9;
const LISTEN_BEFORE_INPUT = 2 ** 31;

// The tree asking host `node` for edit `inputType` with `data`; returns whether it was prevented.
const edit = (node, inputType, data = "") => native.dispatch(BEFORE_INPUT, node.nodeId, 0, 0, 0, 0, 0, data, inputType);

function element(tag, ...children) {
  const node = createElement(tag);
  for (const child of children) node.appendChild(typeof child === "string" ? createText(child) : child);
  return node;
}

// An editor: a host holding paragraphs, mounted, with what its events reported.
function editor(...paragraphs) {
  const host = element("div", ...paragraphs.map((text) => (text === null ? element("p", new LineBreak()) : element("p", text))));
  host.setAttribute("contenteditable", "true");
  mount(element("div", host));
  const heard = [];
  for (const type of ["beforeinput", "input", "compositionstart", "compositionupdate", "compositionend"]) {
    host.addEventListener(type, (event) => heard.push(type + ":" + (event.inputType ?? event.data)));
  }
  mock.take();
  return { host, heard };
}

// The host's content as markup, with `|` at the caret.
function markup(node) {
  const selection = getSelection();
  const caret = selection.rangeCount ? [selection.focusNode, selection.focusOffset] : [];
  const walk = (at) => {
    if (at.nodeType === 3) {
      return at === caret[0] ? at.data.slice(0, caret[1]) + "|" + at.data.slice(caret[1]) : at.data;
    }
    let out = "";
    at.childNodes.forEach((child, index) => {
      if (at === caret[0] && index === caret[1]) out += "|";
      out += walk(child);
    });
    if (at === caret[0] && caret[1] === at.childNodes.length) out += "|";
    return at.localName === "div" ? out : "<" + at.localName + ">" + out + (at.localName === "br" ? "" : "</" + at.localName + ">");
  };
  return walk(node);
}

test("contenteditable makes an editing host that takes focus and hears edits", () => {
  const host = createElement("div");
  const inner = createElement("span");
  host.appendChild(inner);
  assert.equal(host.contentEditable, "inherit");
  assert.equal(inner.isContentEditable, false);
  host.contentEditable = "true";
  const calls = mock.take();
  assert.ok(calls.some((call) => call[0] === "attribute" && call[1] === host.nodeId && call[2] === "tabIndex" && call[3] === 0), "a host is a tab stop");
  assert.ok(calls.some((call) => call[0] === "listen" && call[1] === host.nodeId && (call[2] & LISTEN_BEFORE_INPUT) !== 0), "a host hears beforeinput");
  assert.equal(host.contentEditable, "true");
  assert.equal(inner.isContentEditable, true);
  inner.contentEditable = "false";
  assert.equal(inner.isContentEditable, false);
  assert.throws(() => { host.contentEditable = "yes"; }, { name: "SyntaxError" });
  host.contentEditable = "inherit";
  assert.equal(host.hasAttribute("contenteditable"), false);
});

test("a br is a line-breaking text node to the tree and an empty element to scripts", () => {
  const br = createElement("br");
  assert.ok(br instanceof LineBreak);
  assert.equal(br.nodeType, 1);
  assert.equal(br.tagName, "BR");
  assert.equal(br.childNodes.length, 0);
  br.className = "ProseMirror-trailingBreak";
  assert.equal(br.getAttribute("class"), "ProseMirror-trailingBreak");
  assert.ok(mock.take().some((call) => call[0] === "setText" && call[1] === br.nodeId && call[2] === " "));
  // The tree's points in a br read as points in its parent.
  const p = element("p", "a", br);
  mount(element("div", p));
  tree.ends = [br.nodeId, 1, br.nodeId, 1];
  assert.equal(getSelection().focusNode, p);
  assert.equal(getSelection().focusOffset, 2);
});

test("typing inserts text at the caret and fires beforeinput then input", () => {
  const { host, heard } = editor("Hello world");
  const text = host.firstChild.firstChild;
  getSelection().collapse(text, 5);
  edit(host, "insertText", ",");
  assert.equal(markup(host), "<p>Hello,| world</p>");
  assert.deepEqual(heard, ["beforeinput:insertText", "input:insertText"]);
  getSelection().setBaseAndExtent(text, 0, text, 6);
  edit(host, "insertText", "Bye");
  assert.equal(markup(host), "<p>Bye| world</p>");
});

test("a host focused with no selection inside takes typing at its start", () => {
  const { host, heard } = editor("Hello");
  tree.ends = null;
  native.dispatch(FOCUS, host.nodeId, 0, 0, 0, 0, 0);
  edit(host, "insertText", "> ");
  assert.equal(markup(host), "<p>> |Hello</p>");
  assert.deepEqual(heard, ["beforeinput:insertText", "input:insertText"]);
});

test("a prevented beforeinput changes nothing", () => {
  const { host, heard } = editor("Hello");
  host.addEventListener("beforeinput", (event) => event.preventDefault());
  getSelection().collapse(host.firstChild.firstChild, 5);
  assert.equal(edit(host, "insertText", "!"), true);
  assert.equal(markup(host), "<p>Hello|</p>");
  assert.deepEqual(heard, ["beforeinput:insertText"]);
});

test("typing in an empty paragraph goes before its br", () => {
  const { host } = editor(null);
  getSelection().collapse(host.firstChild, 0);
  edit(host, "insertText", "a");
  assert.equal(markup(host), "<p>a|<br></p>");
});

test("Backspace and Delete remove a character, a word, and join paragraphs", () => {
  const { host } = editor("Hello brave", "world");
  const first = host.firstChild.firstChild;
  getSelection().collapse(first, 5);
  edit(host, "deleteContentBackward");
  assert.equal(markup(host), "<p>Hell| brave</p><p>world</p>");
  edit(host, "deleteContentForward");
  assert.equal(markup(host), "<p>Hell|brave</p><p>world</p>");
  getSelection().collapse(first, first.length);
  edit(host, "deleteWordBackward");
  assert.equal(markup(host), "<p>|<br></p><p>world</p>", "an emptied paragraph keeps its line");
  getSelection().collapse(host.lastChild.firstChild, 0);
  edit(host, "deleteContentBackward");
  assert.equal(markup(host), "<p>|world</p>");
  assert.equal(host.childNodes.length, 1);
});

test("Backspace at the start of a paragraph after an empty one removes the empty one", () => {
  const { host } = editor(null, "text");
  getSelection().collapse(host.lastChild.firstChild, 0);
  edit(host, "deleteContentBackward");
  assert.equal(markup(host), "<p>|text</p>");
});

test("Enter splits the paragraph and Shift+Enter breaks the line", () => {
  const { host } = editor("Hello world");
  getSelection().collapse(host.firstChild.firstChild, 5);
  edit(host, "insertParagraph");
  assert.equal(markup(host), "<p>Hello</p><p>| world</p>");
  getSelection().collapse(host.lastChild.firstChild, 6);
  edit(host, "insertParagraph");
  assert.equal(markup(host), "<p>Hello</p><p> world</p><p>|<br></p>");
  getSelection().collapse(host.firstChild.firstChild, 2);
  edit(host, "insertLineBreak");
  assert.equal(markup(host), "<p>He<br>|llo</p><p> world</p><p><br></p>");
});

test("a paste inserts its lines with breaks, and a cut deletes the selection", () => {
  const { host } = editor("ab");
  const text = host.firstChild.firstChild;
  getSelection().collapse(text, 1);
  edit(host, "insertFromPaste", "x\ny");
  assert.equal(markup(host), "<p>ax<br>y|b</p>");
  const last = host.firstChild.lastChild;
  getSelection().setBaseAndExtent(host.firstChild.firstChild, 0, last, 1);
  edit(host, "deleteByCut");
  assert.equal(markup(host), "<p>|b</p>");
});

test("composition text replaces itself until it is committed", () => {
  const { host, heard } = editor("ab");
  getSelection().collapse(host.firstChild.firstChild, 1);
  edit(host, "insertCompositionText", "k");
  assert.equal(markup(host), "<p>ak|b</p>");
  edit(host, "insertCompositionText", "ka");
  assert.equal(markup(host), "<p>aka|b</p>");
  edit(host, "insertText", "か");
  assert.equal(markup(host), "<p>aか|b</p>");
  assert.deepEqual(heard, [
    "compositionstart:", "compositionupdate:k", "beforeinput:insertCompositionText", "input:insertCompositionText",
    "compositionupdate:ka", "beforeinput:insertCompositionText", "input:insertCompositionText",
    "beforeinput:insertFromComposition", "input:insertFromComposition", "compositionend:か",
  ]);
  edit(host, "insertCompositionText", "x");
  edit(host, "insertCompositionText", "");
  assert.equal(markup(host), "<p>aか|b</p>", "an empty composition removes what it showed");
});
