// A terminal-like drawing with Canvas 2D, as a web page draws one: rows of text on a dark
// background, a cursor, shapes, a clip and an image. Click and it reads a pixel back.
// Run from the repository root:
//   silk run --manifest-path modules/js/demo/silk.toml -- modules/js/examples/canvas2d/app.js
import { createBox, createNode, createText, mount } from "@silkui/core";

const words = createText("CANVAS 2D");
const label = createBox({ color: "rgb(250, 250, 250)", fontSize: 20, fontFamily: "Geist Mono, monospace" }, words);
const canvas = createNode("canvas");
const ratio = globalThis.devicePixelRatio || 1;
canvas.width = 480 * ratio;
canvas.height = 300 * ratio;
canvas.style = { width: 480, height: 300 };
const page = createBox(
  { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 24, width: "100%", height: "100%", backgroundColor: "rgb(4, 4, 5)" },
  canvas,
  label,
);
page.setAttribute("testId", "counter");
mount(page);

const context = canvas.getContext("2d", { alpha: false });
context.setTransform(ratio, 0, 0, ratio, 0, 0);
context.fillStyle = "rgb(16, 18, 24)";
context.fillRect(0, 0, 480, 300);

const font = "normal 400 14px monospace";
context.font = font;
const cell = context.measureText("M");
const metrics = context.measureText("Mg");
const height = Math.max(Math.round(14 * 1.35), Math.ceil(metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent));
const lines = [
  ["$ ", "rgb(120, 220, 140)", "silk run --manifest-path modules/js/demo/silk.toml"],
  ["  ", "rgb(200, 200, 210)", "Compiling ui-js-demo ... done"],
  ["  ", "rgb(240, 200, 90)", "warning: 2 canvases drew this frame"],
  ["$ ", "rgb(120, 220, 140)", "echo été → λ"],
];
context.textBaseline = "alphabetic";
lines.forEach(([prompt, color, text], row) => {
  const top = 16 + row * height;
  context.fillStyle = "rgb(16, 18, 24)";
  context.fillRect(0, top, 480, height);
  context.fillStyle = "rgb(120, 220, 140)";
  context.fillText(prompt, 16, top + height - 5);
  context.fillStyle = color;
  context.font = row === 2 ? "italic 700 14px monospace" : font;
  context.fillText(text, 16 + cell.width * 2, top + height - 5);
  context.font = font;
});
// A block cursor, and its text in the background color.
const cursorTop = 16 + lines.length * height;
context.fillStyle = "rgb(230, 230, 240)";
context.fillRect(16, cursorTop, cell.width, height);
context.strokeStyle = "rgb(90, 140, 255)";
context.lineWidth = 2;
context.strokeRect(12, 12, 456, cursorTop + height - 4);

// Shapes: a circle, a rounded rectangle and a powerline arrow, one of them clipped.
context.fillStyle = "rgb(255, 90, 120)";
context.beginPath();
context.arc(400, 230, 40, 0, Math.PI * 2);
context.fill();
context.save();
context.beginPath();
context.rect(40, 200, 120, 30);
context.clip();
context.fillStyle = "rgba(90, 140, 255, 0.8)";
context.beginPath();
context.roundRect(30, 190, 180, 80, 16);
context.fill();
context.restore();
context.fillStyle = "#f0c";
context.beginPath();
context.moveTo(240, 200);
context.lineTo(280, 230);
context.lineTo(240, 260);
context.closePath();
context.fill();
context.textAlign = "center";
context.fillStyle = "white";
context.fillText("centered", 400, 290);
context.textAlign = "start";

// An image: a 2 by 2 checker scaled into the corner.
const image = context.createImageData(2, 2);
image.data.set([255, 255, 255, 255, 0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 255, 255]);
context.drawImage(image, 300, 190, 40, 40);

page.addEventListener("click", () => {
  // The background is opaque, the circle red.
  const background = context.getImageData(2 * ratio, 2 * ratio, 1, 1).data;
  const circle = context.getImageData(400 * ratio, 230 * ratio, 1, 1).data;
  const ok = background[3] === 255 && background[0] === 16 && circle[0] === 255 && circle[1] === 90 && cell.width > 0;
  words.data = ok ? "CLICKED" : "WRONG PIXEL " + [...background].join(",") + " " + [...circle].join(",") + " " + cell.width;
});
