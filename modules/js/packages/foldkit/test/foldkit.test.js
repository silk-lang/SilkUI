import assert from "node:assert/strict";
import { after, test } from "node:test";
import { installMock } from "../../core/test/mock.js";

const ui = installMock();
// Frames run when a test asks: Foldkit renders in one.
let frames = [];
globalThis.requestAnimationFrame = (callback) => frames.push(callback);
const { HoverStyle } = await import("../src/index.js");
const { Schema } = await import("effect");
const { Runtime } = await import("foldkit");
const { defineMessageUnion } = await import("foldkit/message");

// Lets Foldkit's fibers run, then the frames they asked for, until nothing is left.
async function settle() {
  for (let round = 0; round < 20; round++) {
    await new Promise((resolve) => setImmediate(resolve));
    if (frames.length === 0) return;
    const due = frames;
    frames = [];
    for (const callback of due) callback(performance.now());
  }
}

const calls = (name) => ui.calls.filter((call) => call[0] === name);

const Model = Schema.Struct({ count: Schema.Number, text: Schema.String, items: Schema.Array(Schema.String) });
const Message = defineMessageUnion({ Clicked: {}, Typed: { value: Schema.String }, Reversed: {}, Entered: {} });
const update = (model, message) =>
  Message.match(message, {
    Clicked: () => ({ model: { ...model, count: model.count + 1 } }),
    Typed: ({ value }) => ({ model: { ...model, text: value.toUpperCase() } }),
    Reversed: () => ({ model: { ...model, items: model.items.toReversed() } }),
    Entered: () => ({ model: { ...model, count: model.count + 100 } }),
  });
const view = (model, h) => ({
  title: "count " + model.count,
  body: h.div(
    [h.Id("page"), h.Style({ display: "flex", fontSize: "13px" })],
    [
      h.p([], [String(model.count)]),
      h.button(
        [h.Id("add"), h.OnClick(Message.Clicked()), h.OnMouseEnter(Message.Entered()), h.Disabled(model.count >= 2), HoverStyle(model.count === 0 ? { color: "red", backgroundColor: "blue" } : { color: "red" })],
        ["add"],
      ),
      h.input([h.Id("field"), h.Value(model.text), h.Placeholder("type"), h.OnInput((value) => Message.Typed({ value }))]),
      h.button([h.Id("reverse"), h.OnClick(Message.Reversed())], []),
      h.ul([], model.items.map((item) => h.keyed("li")(item, [h.DataAttribute("item", item)], [item]))),
      model.count === 1 ? h.span([h.Id("once")], ["once"]) : h.empty,
    ],
  ),
});

Runtime.run(Runtime.makeApplication({ Model, init: () => ({ model: { count: 0, text: "", items: ["a", "b", "c"] } }), update, view, container: document.getElementById("root") }));
await settle();

// A running program holds the process open, as a page stays open.
after(() => setImmediate(() => process.exit()));

const tree = (id) => document.getElementById(id).node.id;

test("the first render replaces #root with the view, made of tree nodes", () => {
  const page = document.getElementById("page");
  assert.equal(page.parentNode, document.body);
  assert.equal(document.getElementById("root"), null);
  assert.deepEqual(calls("style").filter((call) => call[1] === page.node.id).map((call) => call[2]), ["display:flex;", "font-size:13px;"]);
  assert.equal(document.getElementById("field").node.kind, "input");
  assert.equal(page.textContent, "0addabc");
  assert.equal(document.title, "count 0");
  // What the tags mean, as HTML has it.
  assert.ok(ui.calls.some((call) => call[0] === "attribute" && call[1] === tree("add") && call[2] === "role" && call[3] === "button"));
  assert.ok(ui.calls.some((call) => call[0] === "attribute" && call[1] === tree("add") && call[2] === "tabIndex" && call[3] === 0));
  assert.ok(ui.calls.some((call) => call[0] === "attribute" && call[1] === tree("field") && call[2] === "placeholder" && call[3] === "type"));
  assert.deepEqual(calls("style").find((call) => call[3] === 1), ["style", tree("add"), "color:red;background-color:blue;", 1]);
});

test("a click runs update and the next frame patches the tree", async () => {
  ui.take();
  ui.click(tree("add"));
  await settle();
  assert.equal(document.getElementById("page").textContent, "1addabconce");
  assert.equal(document.title, "count 1");
  // The hover look lost a property the new view does not have.
  assert.ok(calls("clearStyle").some((call) => call[1] === tree("add") && call[2] === 1));
});

test("an element the view drops is freed, with its subtree", async () => {
  const once = document.getElementById("once").node.id;
  ui.take();
  ui.click(tree("add"));
  await settle();
  assert.equal(document.getElementById("once"), null);
  assert.ok(calls("destroy").some((call) => call[1] === once));
  // Disabled reflects as the tree attribute.
  assert.ok(ui.calls.some((call) => call[0] === "attribute" && call[1] === tree("add") && call[2] === "disabled" && call[3] === true));
});

test("mouse events arrive under the names Foldkit listens for", async () => {
  ui.native.dispatch(4, tree("add"), 0, 0, 0, 0, 0);
  await settle();
  assert.equal(document.title, "count 102");
});

test("a controlled input shows what the Model holds", async () => {
  ui.take();
  ui.input(tree("field"), "abc");
  await settle();
  assert.equal(document.getElementById("field").value, "ABC");
  assert.equal(ui.textOf(tree("field")), "ABC");
});

test("keyed children move instead of being made again", async () => {
  const before = document.querySelectorAll("li").map((item) => item.node.id);
  ui.take();
  ui.click(tree("reverse"));
  await settle();
  assert.deepEqual(document.querySelectorAll("li").map((item) => item.node.id), before.toReversed());
  assert.equal(document.querySelector('ul [data-item="c"]').nextSibling.textContent, "b");
  assert.equal(calls("create").length, 0);
  assert.equal(calls("destroy").length, 0);
});
