import assert from "node:assert/strict";
import { test } from "node:test";
import { installMock } from "../../core/test/mock.js";

const mock = installMock();
const { createElement: h, useState } = await import("react");
const { createRoot, createPortal } = await import("../src/index.js");
const { createBox, CheckInput, Input } = await import("@silkui/core");

const attributes = (calls, id) => calls.filter((call) => call[0] === "attribute" && call[1] === id).map((call) => [call[2], call[3]]);
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

test("HTML elements are tagged boxes with React DOM's props", () => {
  const container = createBox();
  mock.take();
  createRoot(container).render(
    h("div", { className: "row", title: "Tip", htmlFor: "x", hidden: true, "data-state": "open", style: { "--gap": 4, marginTop: 2 } }, h("span", null, "hi")),
  );
  const calls = mock.take();
  const div = container.firstChild;
  assert.equal(div.tagName, "DIV");
  assert.equal(div.firstChild.localName, "span");
  assert.deepEqual(attributes(calls, div.nodeId), [
    ["element", "div"], ["class", "row"], ["title", "Tip"], ["for", "x"], ["hidden", ""], ["data-state", "open"],
  ]);
  assert.ok(calls.some((call) => call[0] === "style" && call[1] === div.nodeId && call[2] === "--gap:4;margin-top:2px;"));
  assert.equal(div.getAttribute("for"), "x");
});

test("onChange on a controlled text field sees the typed value and keeps what state accepts", async () => {
  let field;
  const seen = [];
  function Form() {
    const [text, setText] = useState("");
    return h("input", { ref: (node) => (field = node), value: text, onChange: (event) => { seen.push(event.target.value); setText(event.target.value.toUpperCase()); } });
  }
  createRoot(createBox()).render(h(Form));
  assert.ok(field instanceof Input);
  mock.input(field.nodeId, "ab");
  await tick();
  assert.deepEqual(seen, ["ab"]);
  assert.equal(field.value, "AB");
});

test("a checkbox checks on click and a controlled one follows its state", async () => {
  let box;
  const changes = [];
  function Toggle() {
    const [on, setOn] = useState(false);
    return h("label", null, h("input", { type: "checkbox", ref: (node) => (box = node), checked: on, onChange: (event) => { changes.push(event.target.checked); setOn(event.target.checked); } }), "Remember");
  }
  const container = createBox();
  createRoot(container).render(h(Toggle));
  assert.ok(box instanceof CheckInput);
  mock.click(box.nodeId);
  await tick();
  assert.equal(box.checked, true);
  // A click on the label's text checks its control too.
  mock.click(container.firstChild.lastChild.nodeId);
  await tick();
  assert.deepEqual(changes, [true, false]);
  assert.equal(box.checked, false);
});

test("dangerouslySetInnerHTML parses markup into nodes", () => {
  const container = createBox();
  createRoot(container).render(h("pre", { dangerouslySetInnerHTML: { __html: '<code class="x"><span style="color: red">a &amp; b</span><br>c</code><!-- c --><script>bad()</script>' } }));
  const pre = container.firstChild;
  const code = pre.firstChild;
  assert.equal(code.localName, "code");
  assert.equal(code.className, "x");
  assert.equal(code.firstChild.firstChild.data, "a & b");
  assert.equal(code.firstChild.style.get("color"), "red");
  assert.equal(pre.childNodes.length, 1);
  assert.equal(pre.innerHTML, '<code class="x"><span style="color:red;">a &amp; b</span><br>c</code>');
});

test("onFocus and onBlur bubble, and a portal renders into its container", () => {
  const events = [];
  const elsewhere = createBox();
  let button;
  createRoot(createBox()).render(
    h("div", { onFocus: (event) => events.push("focus " + event.target.localName), onBlur: () => events.push("blur") },
      h("button", { ref: (node) => (button = node) }, "Go"),
      createPortal(h("p", null, "floating"), elsewhere)),
  );
  mock.native.dispatch(9, button.nodeId, 0, 0, 0, 0, 0);
  assert.deepEqual(events, ["focus button"]);
  assert.equal(elsewhere.firstChild.localName, "p");
});
