// React rendered into `document.body`, written as for a browser page: a keydown listener on
// `document`, the count in `localStorage` and in the hash, `:root` styled through
// `documentElement`, and a MutationObserver that sees React's commits.
import "@silkui/core/globals";
import { useEffect, useState } from "react";
import { createRoot } from "@silkui/react";

function App() {
  const [keys, setKeys] = useState(() => Number(localStorage.getItem("keys") ?? 0));
  const [hash, setHash] = useState(location.hash);
  useEffect(() => {
    const onKey = () => setKeys((count) => count + 1);
    const onHash = () => setHash(location.hash);
    document.addEventListener("keydown", onKey);
    window.addEventListener("hashchange", onHash);
    window.addEventListener("popstate", onHash);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("hashchange", onHash);
      window.removeEventListener("popstate", onHash);
    };
  }, []);
  useEffect(() => {
    if (keys === 0) return;
    localStorage.setItem("keys", String(keys));
    history.pushState({ keys }, "", "#/keys/" + keys);
    setHash(location.hash);
    document.documentElement.classList.toggle("odd", keys % 2 === 1);
    document.documentElement.style.setProperty("--keys", String(keys));
  }, [keys]);
  const wide = innerWidth > 0 && document.body instanceof HTMLElement ? "sized" : "unsized";
  return (
    <box style={{ padding: 24, gap: 8, display: "flex", flexDirection: "column" }}>
      <box>{"keys " + keys}</box>
      <box>{"hash " + (hash || "none")}</box>
      <box>{"root " + (document.documentElement.className || "even") + " " + wide}</box>
    </box>
  );
}

let commits = 0;
new MutationObserver((records) => {
  commits += records.length;
  if (commits > 0) document.title = "mutations seen";
}).observe(document.body, { childList: true, subtree: true, characterData: true });

createRoot(document.body).render(<App />);
