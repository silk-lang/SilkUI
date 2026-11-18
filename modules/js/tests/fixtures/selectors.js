// matches, closest, querySelector and querySelectorAll through the tree's selector matcher.
import { createBox, createText, mount } from "@silkui/core";

const check = (label, got, want) => {
  if (got !== want) throw new Error(label + ": got '" + got + "', want '" + want + "'");
};

const root = createBox();
root.id = "list";
const items = [];
for (let i = 0; i < 4; i++) {
  const item = createBox();
  item.className = i % 2 ? "row odd" : "row";
  item.setAttribute("data-index", String(i));
  item.appendChild(createText("item " + i));
  root.appendChild(item);
  items.push(item);
}
const inner = createBox();
inner.className = "badge";
items[2].appendChild(inner);
mount(root);

check("matches a class", items[1].matches(".row.odd"), true);
check("webkitMatchesSelector", items[0].webkitMatchesSelector(".odd"), false);
check("matches an attribute", items[3].matches("[data-index='3']"), true);
check("matches structure", items[0].matches("#list > .row:first-child"), true);
check("matches :has()", items[2].matches(":has(> .badge)"), true);
check("matches :not()", items[2].matches(".row:not(.odd)"), true);
check("closest is the node itself", items[1].closest(".row"), items[1]);
check("closest ancestor", inner.closest("#list"), root);
check("closest none", inner.closest(".missing"), null);
check("querySelector in tree order", root.querySelector(".odd"), items[1]);
check("querySelector a nested match", root.querySelector(".row .badge"), inner);
check("querySelector none", root.querySelector(".missing"), null);
check("querySelectorAll", root.querySelectorAll(".odd").map((item) => item.getAttribute("data-index")).join(), "1,3");
check(":scope", root.querySelectorAll(":scope > .row").length, 4);
check("the scope is not its own descendant", items[2].querySelectorAll(".row").length, 0);
// The pending batch reaches the tree before a query.
items[0].className = "row odd";
check("a class set just now", root.querySelector(".odd"), items[0]);
let threw = "";
try { root.querySelector("..bad"); } catch (error) { threw = error.name; }
check("an invalid selector throws", threw, "SyntaxError");
globalThis.selectorsChecked = true;
