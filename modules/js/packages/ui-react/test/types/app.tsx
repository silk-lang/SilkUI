// Compiled by types.test.js: what an application writes against the packages' types.
import { useRef, useState } from "react";
import { createBox, createIcon, mount, parseMarkdown, OBJECT, type Input, type RichDocument, type Style } from "@silk/ui";
import { createRoot, flushSync } from "@silk/ui-react";

const card: Style = { display: "flex", padding: 8, gridTemplateColumns: "1fr 2fr", opacity: 0.5, color: null };
const box = createBox(card, "text", createIcon("<svg/>", { width: 16 }));
box.style.set({ width: 120 });
box.style = { height: 40 };
box.addEventListener("keydown", (event) => event.key.toUpperCase());
box.addEventListener("click", (event) => event.clientX + event.detail, { once: true });
mount(box);

const tree = parseMarkdown("# hi", { footnotes: true });
tree.children.length;

function App() {
  const input = useRef<Input>(null);
  const [document, setDocument] = useState<RichDocument>({ text: `a${OBJECT}`, marks: [], atoms: [{ kind: "mention", label: "x", data: "" }] });
  return (
    <box
      style={{ flexDirection: "column", gap: 4 }}
      hoverStyle={{ backgroundColor: "#eee" }}
      role="list"
      aria-label="Rows"
      onClick={(event) => event.preventDefault()}
      onKeyDownCapture={(event) => event.shiftKey}
      onLayout={(event) => event.bounds.width}
    >
      <input ref={input} value="x" placeholder="Type" onInput={(event) => event.target.value} />
      {/* @ts-expect-error: a plain input's event may have no document */}
      <input onInput={(event) => setDocument(event.document)} />
      <richinput document={document} marks={{ bold: { fontWeight: 700 } }} onInput={(event) => setDocument(event.document)} onSelectionChange={(event) => event.target.document.text} />
      <icon svg="<svg/>" style={{ width: 16 }} />
      <image />
      {/* @ts-expect-error: the tree has no such style property */}
      <box style={{ notAProperty: 1 }} />
      {/* @ts-expect-error: a key event has no clientX */}
      <box onKeyDown={(event) => event.clientX} />
      {/* @ts-expect-error: no such element */}
      <div />
    </box>
  );
}

createRoot().render(<App />);
flushSync(() => 1).toFixed();
