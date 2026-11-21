// Canvas 2D for a ui-js realm: `canvas.getContext("2d")`, `Path2D`, `ImageData`, with the
// names and behavior of the HTML canvas API. The prelude evaluates this on first use. It is a
// function of `__ui`.
//
// The context keeps its state here (transform, clip, styles, the current path) and writes each
// draw as a command in device pixels into a byte stream. The stream goes to the host at the end
// of the JavaScript job (`__ui.canvas2d(bytes)`), or before a read such as `getImageData`, and
// the host draws it at once into the canvas's bitmap (ui_tree canvas2d.silk), which the window
// shows as it shows a GPU canvas.
//
// Not drawn as in a browser: gradients and patterns paint their first color, a clip is the
// bounding box of its path, shadows and filters are ignored, rotated text keeps its glyphs
// upright, and only source-over compositing exists.
//
// Edit this, then run `silk task embed-assets` to regenerate generated_canvas2d_api.silk.
(function (native) {
  const SIZE = 1, FILL_RECT = 2, CLEAR_RECT = 3, FILL_PATH = 4, STROKE_PATH = 5, FILL_TEXT = 6;
  const PUT_PIXELS = 7, DRAW_PIXELS = 8, DRAW_CANVAS = 9;
  const MOVE = 0, LINE = 1, QUAD = 2, CUBIC = 3, CLOSE = 4;
  const CAPS = { butt: 0, round: 1, square: 2 };
  const JOINS = { miter: 0, round: 2, bevel: 3 };
  const ALIGNS = { start: 0, left: 0, center: 1, end: 2, right: 2 };
  const BASELINES = { alphabetic: 0, top: 1, hanging: 2, middle: 3, ideographic: 4, bottom: 5 };
  const HUGE = 1e9;

  let encoder = null;
  const utf8 = (text) => (encoder ??= new TextEncoder()).encode(text);

  class Writer {
    constructor(size) {
      this.buffer = new ArrayBuffer(size);
      this.bytes = new Uint8Array(this.buffer);
      this.view = new DataView(this.buffer);
      this.at = 0;
    }
    need(count) {
      if (this.at + count <= this.buffer.byteLength) return;
      let size = this.buffer.byteLength * 2;
      while (size < this.at + count) size *= 2;
      const grown = new ArrayBuffer(size);
      new Uint8Array(grown).set(this.bytes.subarray(0, this.at));
      this.buffer = grown;
      this.bytes = new Uint8Array(grown);
      this.view = new DataView(grown);
    }
    u32(value) {
      this.need(4);
      this.view.setUint32(this.at, value >>> 0, true);
      this.at += 4;
    }
    f64(value) {
      this.need(8);
      this.view.setFloat64(this.at, +value, true);
      this.at += 8;
    }
    str(text) {
      const encoded = utf8(String(text));
      this.u32(encoded.length);
      this.raw(encoded);
    }
    raw(bytes) {
      this.need(bytes.length);
      this.bytes.set(bytes, this.at);
      this.at += bytes.length;
    }
    rect(x0, y0, x1, y1) {
      this.f64(x0);
      this.f64(y0);
      this.f64(x1);
      this.f64(y1);
    }
    color(rgba, alpha) {
      this.f64(rgba[0]);
      this.f64(rgba[1]);
      this.f64(rgba[2]);
      this.f64(rgba[3] * alpha);
    }
  }

  // The stream to the host. It leaves at the end of the job that wrote its first command.
  const main = new Writer(1 << 16);
  let leaving = false;
  let started = -1;
  function close() {
    if (started < 0) return;
    main.view.setUint32(started, main.at - started - 4, true);
    started = -1;
  }
  function send() {
    leaving = false;
    close();
    if (main.at === 0) return;
    native.canvas2d(main.bytes.subarray(0, main.at));
    main.at = 0;
    if (main.buffer.byteLength > 1 << 22) {
      main.buffer = new ArrayBuffer(1 << 16);
      main.bytes = new Uint8Array(main.buffer);
      main.view = new DataView(main.buffer);
    }
  }
  function command(op, node) {
    if (!leaving) {
      leaving = true;
      queueMicrotask(send);
    }
    close();
    started = main.at;
    main.u32(0);
    main.u32(op);
    main.u32(node);
    return main;
  }

  // CSS colors, as straight [r, g, b, a] floats.
  const NAMED = {
    black: "#000", white: "#fff", red: "#f00", green: "#008000", blue: "#00f", yellow: "#ff0",
    cyan: "#0ff", aqua: "#0ff", magenta: "#f0f", fuchsia: "#f0f", gray: "#808080", grey: "#808080",
    silver: "#c0c0c0", maroon: "#800000", olive: "#808000", lime: "#0f0", teal: "#008080",
    navy: "#000080", purple: "#800080", orange: "#ffa500", pink: "#ffc0cb", brown: "#a52a2a",
    darkgray: "#a9a9a9", darkgrey: "#a9a9a9", lightgray: "#d3d3d3", lightgrey: "#d3d3d3",
    gold: "#ffd700", indigo: "#4b0082", violet: "#ee82ee", coral: "#ff7f50", salmon: "#fa8072",
    tomato: "#ff6347", crimson: "#dc143c", khaki: "#f0e68c", beige: "#f5f5dc", ivory: "#fffff0",
    lavender: "#e6e6fa", tan: "#d2b48c", chocolate: "#d2691e", orchid: "#da70d6", plum: "#dda0dd",
    turquoise: "#40e0d0", skyblue: "#87ceeb", steelblue: "#4682b4", royalblue: "#4169e1",
    slategray: "#708090", darkblue: "#00008b", darkred: "#8b0000", darkgreen: "#006400",
    whitesmoke: "#f5f5f5", gainsboro: "#dcdcdc", dimgray: "#696969", rebeccapurple: "#663399",
  };
  const colors = new Map();
  const channel = (text, scale) => {
    text = text.trim();
    if (text.endsWith("%")) return Math.min(Math.max(parseFloat(text) / 100, 0), 1);
    return Math.min(Math.max(parseFloat(text) / scale, 0), 1);
  };
  function hue(h, s, l) {
    const k = (n) => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return [f(0), f(8), f(4)];
  }
  function parseColor(text) {
    if (typeof text !== "string") return null;
    let found = colors.get(text);
    if (found !== undefined) return found;
    let value = text.trim().toLowerCase();
    if (value === "transparent") found = [0, 0, 0, 0];
    else if (value === "currentcolor") found = [0, 0, 0, 1];
    else {
      if (NAMED[value]) value = NAMED[value];
      if (value[0] === "#") {
        const hex = value.slice(1);
        const digits = hex.length === 3 || hex.length === 4 ? [...hex].map((c) => c + c) : hex.match(/../g);
        if (/^[0-9a-f]+$/.test(hex) && digits && (hex.length === 3 || hex.length === 4 || hex.length === 6 || hex.length === 8)) {
          const n = digits.map((d) => parseInt(d, 16) / 255);
          found = [n[0], n[1], n[2], n.length > 3 ? n[3] : 1];
        }
      } else {
        const match = /^(rgba?|hsla?)\(([^)]*)\)$/.exec(value);
        if (match) {
          const parts = match[2].split(/[\s,/]+/).filter((part) => part.length > 0);
          if (parts.length >= 3) {
            const alpha = parts.length > 3 ? channel(parts[3], 1) : 1;
            if (match[1].startsWith("rgb")) {
              found = [channel(parts[0], 255), channel(parts[1], 255), channel(parts[2], 255), alpha];
            } else {
              const [r, g, b] = hue(((parseFloat(parts[0]) % 360) + 360) % 360, channel(parts[1], 100), channel(parts[2], 100));
              found = [r, g, b, alpha];
            }
            if (found.some((n) => !Number.isFinite(n))) found = undefined;
          }
        }
      }
    }
    found ??= null;
    if (colors.size > 4096) colors.clear();
    colors.set(text, found);
    return found;
  }

  class CanvasGradient {
    constructor() {
      this._stops = [];
    }
    addColorStop(offset, color) {
      const parsed = parseColor(String(color));
      if (!parsed) throw new SyntaxError("'" + color + "' is not a color");
      this._stops.push([+offset, parsed]);
      this._stops.sort((a, b) => a[0] - b[0]);
    }
  }
  class CanvasPattern {
    setTransform() {}
  }
  // The color a style paints: a gradient paints its first stop.
  function paintOf(style) {
    if (style instanceof CanvasGradient) return style._stops.length ? style._stops[0][1] : [0, 0, 0, 0];
    if (style instanceof CanvasPattern) return [0, 0, 0, 0];
    return parseColor(style) ?? [0, 0, 0, 1];
  }

  // CSS `font`: [style] [variant] [weight] [stretch] size[/line-height] family, as
  // "style weight size families" for the host, or null when it is not a font.
  const fonts = new Map();
  function parseFont(text) {
    let found = fonts.get(text);
    if (found !== undefined) return found;
    found = null;
    const match = /^\s*((?:(?:normal|italic|oblique|small-caps|bold|bolder|lighter|[1-9]00|ultra-condensed|extra-condensed|condensed|semi-condensed|semi-expanded|expanded|extra-expanded|ultra-expanded)\s+)*)([\d.]+)(px|pt|em|rem|%|pc|in|cm|mm)?(?:\s*\/\s*[^\s]+)?\s+(.+)$/i.exec(String(text));
    if (match) {
      let italic = false;
      let weight = 400;
      for (const word of match[1].toLowerCase().split(/\s+/)) {
        if (word === "italic" || word === "oblique") italic = true;
        else if (word === "bold" || word === "bolder") weight = 700;
        else if (word === "lighter") weight = 300;
        else if (/^[1-9]00$/.test(word)) weight = +word;
      }
      const unit = (match[3] ?? "px").toLowerCase();
      const scale = { px: 1, pt: 4 / 3, pc: 16, in: 96, cm: 96 / 2.54, mm: 96 / 25.4, em: 10, rem: 16, "%": 0.1 }[unit];
      const size = parseFloat(match[2]) * scale;
      if (Number.isFinite(size)) found = (italic ? "italic " : "normal ") + weight + " " + size + " " + match[4].trim();
    }
    if (fonts.size > 1024) fonts.clear();
    fonts.set(text, found);
    return found;
  }
  const DEFAULT_FONT = "10px sans-serif";

  // A path as numbers: a verb and its points.
  function arcPoints(out, transform, cx, cy, rx, ry, rotation, start, end, counterclockwise, connect) {
    let sweep = end - start;
    const full = Math.PI * 2;
    if (!counterclockwise && sweep < 0) sweep = (sweep % full) + full;
    if (counterclockwise && sweep > 0) sweep = (sweep % full) - full;
    if (Math.abs(end - start) >= full) sweep = counterclockwise ? -full : full;
    const cos = Math.cos(rotation), sin = Math.sin(rotation);
    const at = (angle) => {
      const x = rx * Math.cos(angle), y = ry * Math.sin(angle);
      return [cx + x * cos - y * sin, cy + x * sin + y * cos];
    };
    const first = at(start);
    pushPoint(out, transform, connect ? LINE : MOVE, first);
    const segments = Math.max(1, Math.ceil(Math.abs(sweep) / (Math.PI / 2) - 1e-9));
    const step = sweep / segments;
    const k = (4 / 3) * Math.tan(step / 4);
    let angle = start;
    for (let i = 0; i < segments; i++) {
      const next = angle + step;
      const a = Math.cos(angle), b = Math.sin(angle), c = Math.cos(next), d = Math.sin(next);
      const p1 = [rx * (a - k * b), ry * (b + k * a)];
      const p2 = [rx * (c + k * d), ry * (d - k * c)];
      const rot = (p) => [cx + p[0] * cos - p[1] * sin, cy + p[0] * sin + p[1] * cos];
      const e = at(next);
      const q1 = apply(transform, rot(p1)), q2 = apply(transform, rot(p2)), q3 = apply(transform, e);
      out.push(CUBIC, q1[0], q1[1], q2[0], q2[1], q3[0], q3[1]);
      angle = next;
    }
  }
  const apply = (m, p) => [m[0] * p[0] + m[2] * p[1] + m[4], m[1] * p[0] + m[3] * p[1] + m[5]];
  function pushPoint(out, transform, verb, p) {
    const q = apply(transform, p);
    out.push(verb, q[0], q[1]);
  }
  const IDENTITY = [1, 0, 0, 1, 0, 0];
  const finite = (...values) => values.every((value) => Number.isFinite(value));

  // The path methods of a context and of `Path2D`, which keep points in device pixels under
  // `_transform()` and remember the last point in user space for arcTo.
  const pathMethods = {
    _begin() {
      this._points = [];
      this._open = false;
      this._last = [0, 0];
      this._first = [0, 0];
    },
    moveTo(x, y) {
      if (!finite(x, y)) return;
      pushPoint(this._points, this._transform(), MOVE, [x, y]);
      this._open = true;
      this._last = [x, y];
      this._first = [x, y];
    },
    lineTo(x, y) {
      if (!finite(x, y)) return;
      pushPoint(this._points, this._transform(), this._open ? LINE : MOVE, [x, y]);
      if (!this._open) this._first = [x, y];
      this._open = true;
      this._last = [x, y];
    },
    quadraticCurveTo(x1, y1, x, y) {
      if (!finite(x1, y1, x, y)) return;
      if (!this._open) this.moveTo(x1, y1);
      const m = this._transform();
      const a = apply(m, [x1, y1]), b = apply(m, [x, y]);
      this._points.push(QUAD, a[0], a[1], b[0], b[1]);
      this._last = [x, y];
    },
    bezierCurveTo(x1, y1, x2, y2, x, y) {
      if (!finite(x1, y1, x2, y2, x, y)) return;
      if (!this._open) this.moveTo(x1, y1);
      const m = this._transform();
      const a = apply(m, [x1, y1]), b = apply(m, [x2, y2]), c = apply(m, [x, y]);
      this._points.push(CUBIC, a[0], a[1], b[0], b[1], c[0], c[1]);
      this._last = [x, y];
    },
    closePath() {
      if (!this._open) return;
      this._points.push(CLOSE);
      this._last = this._first;
      pushPoint(this._points, this._transform(), MOVE, this._first);
    },
    rect(x, y, w, h) {
      if (!finite(x, y, w, h)) return;
      this.moveTo(x, y);
      this.lineTo(x + w, y);
      this.lineTo(x + w, y + h);
      this.lineTo(x, y + h);
      this.closePath();
    },
    roundRect(x, y, w, h, radii = 0) {
      if (!finite(x, y, w, h)) return;
      const list = Array.isArray(radii) ? radii : [radii];
      const r = list.map((value) => (typeof value === "object" && value !== null ? +value.x || 0 : +value || 0));
      const [tl, tr, br, bl] = r.length === 1 ? [r[0], r[0], r[0], r[0]] : r.length === 2 ? [r[0], r[1], r[0], r[1]] : r.length === 3 ? [r[0], r[1], r[2], r[1]] : r;
      const limit = Math.min(Math.abs(w), Math.abs(h)) / 2;
      const c = (value) => Math.min(Math.max(value, 0), limit);
      this.moveTo(x + c(tl), y);
      this.arcTo(x + w, y, x + w, y + h, c(tr));
      this.arcTo(x + w, y + h, x, y + h, c(br));
      this.arcTo(x, y + h, x, y, c(bl));
      this.arcTo(x, y, x + w, y, c(tl));
      this.closePath();
    },
    arc(x, y, radius, start, end, counterclockwise = false) {
      this.ellipse(x, y, radius, radius, 0, start, end, counterclockwise);
    },
    ellipse(x, y, rx, ry, rotation, start, end, counterclockwise = false) {
      if (!finite(x, y, rx, ry, rotation, start, end)) return;
      if (rx < 0 || ry < 0) throw new RangeError("The radius is negative.");
      arcPoints(this._points, this._transform(), x, y, rx, ry, rotation, start, end, counterclockwise, this._open);
      if (!this._open) this._first = [x + rx * Math.cos(start), y + ry * Math.sin(start)];
      this._open = true;
      const cos = Math.cos(rotation), sin = Math.sin(rotation);
      const px = rx * Math.cos(end), py = ry * Math.sin(end);
      this._last = [x + px * cos - py * sin, y + px * sin + py * cos];
    },
    arcTo(x1, y1, x2, y2, radius) {
      if (!finite(x1, y1, x2, y2, radius)) return;
      if (!this._open) this.moveTo(x1, y1);
      const [x0, y0] = this._last;
      const ax = x0 - x1, ay = y0 - y1, bx = x2 - x1, by = y2 - y1;
      const la = Math.hypot(ax, ay), lb = Math.hypot(bx, by);
      const cross = ax * by - ay * bx;
      if (radius === 0 || la === 0 || lb === 0 || Math.abs(cross) < 1e-9) {
        this.lineTo(x1, y1);
        return;
      }
      const angle = Math.acos(Math.max(-1, Math.min(1, (ax * bx + ay * by) / (la * lb))));
      const distance = radius / Math.tan(angle / 2);
      const t0 = [x1 + (ax / la) * distance, y1 + (ay / la) * distance];
      const t1 = [x1 + (bx / lb) * distance, y1 + (by / lb) * distance];
      const ux = ax / la + bx / lb, uy = ay / la + by / lb;
      const lu = Math.hypot(ux, uy);
      const center = radius / Math.sin(angle / 2);
      const cx = x1 + (ux / lu) * center, cy = y1 + (uy / lu) * center;
      const start = Math.atan2(t0[1] - cy, t0[0] - cx);
      const end = Math.atan2(t1[1] - cy, t1[0] - cx);
      this.lineTo(t0[0], t0[1]);
      arcPoints(this._points, this._transform(), cx, cy, radius, radius, 0, start, end, cross > 0, true);
      this._last = t1;
    },
  };

  class Path2D {
    constructor(path) {
      this._begin();
      if (path instanceof Path2D) {
        this._points = path._points.slice();
        this._open = path._open;
        this._last = path._last;
        this._first = path._first;
      }
    }
    _transform() {
      return IDENTITY;
    }
    addPath(path, transform) {
      if (!(path instanceof Path2D)) return;
      const m = transform ? [transform.a ?? 1, transform.b ?? 0, transform.c ?? 0, transform.d ?? 1, transform.e ?? 0, transform.f ?? 0] : IDENTITY;
      this._points.push(...mapPoints(path._points, m));
    }
  }
  Object.assign(Path2D.prototype, pathMethods);

  // `points` (made under the identity) under `m`.
  function mapPoints(points, m) {
    const out = [];
    let i = 0;
    while (i < points.length) {
      const verb = points[i++];
      out.push(verb);
      const count = verb === MOVE || verb === LINE ? 1 : verb === QUAD ? 2 : verb === CUBIC ? 3 : 0;
      for (let k = 0; k < count; k++) {
        const q = apply(m, [points[i], points[i + 1]]);
        out.push(q[0], q[1]);
        i += 2;
      }
    }
    return out;
  }
  function segmentCount(points) {
    let count = 0;
    let i = 0;
    while (i < points.length) {
      const verb = points[i++];
      i += verb === MOVE || verb === LINE ? 2 : verb === QUAD ? 4 : verb === CUBIC ? 6 : 0;
      count++;
    }
    return count;
  }
  function boundsOf(points) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    let i = 0;
    while (i < points.length) {
      const verb = points[i++];
      const count = verb === MOVE || verb === LINE ? 1 : verb === QUAD ? 2 : verb === CUBIC ? 3 : 0;
      for (let k = 0; k < count; k++) {
        x0 = Math.min(x0, points[i]);
        x1 = Math.max(x1, points[i]);
        y0 = Math.min(y0, points[i + 1]);
        y1 = Math.max(y1, points[i + 1]);
        i += 2;
      }
    }
    return x0 <= x1 ? [x0, y0, x1, y1] : [0, 0, 0, 0];
  }

  class ImageData {
    constructor(dataOrWidth, widthOrHeight, height) {
      if (typeof dataOrWidth === "number") {
        this.width = dataOrWidth >>> 0;
        this.height = widthOrHeight >>> 0;
        this.data = new Uint8ClampedArray(this.width * this.height * 4);
      } else {
        this.data = dataOrWidth;
        this.width = widthOrHeight >>> 0;
        this.height = height ?? this.data.length / 4 / this.width;
      }
      this.colorSpace = "srgb";
    }
  }

  class TextMetrics {
    constructor(values) {
      const [width, ascent, descent, left, right, inkAscent, inkDescent] = values;
      this.width = width;
      this.actualBoundingBoxLeft = left;
      this.actualBoundingBoxRight = right;
      this.actualBoundingBoxAscent = inkAscent;
      this.actualBoundingBoxDescent = inkDescent;
      this.fontBoundingBoxAscent = ascent;
      this.fontBoundingBoxDescent = descent;
      this.emHeightAscent = ascent;
      this.emHeightDescent = descent;
      this.alphabeticBaseline = 0;
      this.hangingBaseline = ascent * 0.8;
      this.ideographicBaseline = -descent;
    }
  }

  const matrix = (m) => {
    const value = typeof DOMMatrix === "function" ? new DOMMatrix(m) : {};
    if (typeof DOMMatrix !== "function") {
      [value.a, value.b, value.c, value.d, value.e, value.f] = m;
      [value.m11, value.m12, value.m21, value.m22, value.m41, value.m42] = m;
      value.is2D = true;
      value.isIdentity = m[0] === 1 && m[1] === 0 && m[2] === 0 && m[3] === 1 && m[4] === 0 && m[5] === 0;
    }
    return value;
  };
  const multiply = (m, n) => [
    m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
  ];

  function initialState(width, height) {
    return {
      transform: IDENTITY,
      clip: [0, 0, width, height],
      fillStyle: "#000000",
      fill: [0, 0, 0, 1],
      strokeStyle: "#000000",
      stroke: [0, 0, 0, 1],
      globalAlpha: 1,
      lineWidth: 1,
      lineCap: "butt",
      lineJoin: "miter",
      miterLimit: 10,
      lineDash: [],
      lineDashOffset: 0,
      font: DEFAULT_FONT,
      fontKey: parseFont(DEFAULT_FONT),
      textAlign: "start",
      textBaseline: "alphabetic",
      direction: "inherit",
      globalCompositeOperation: "source-over",
      imageSmoothingEnabled: true,
      imageSmoothingQuality: "low",
      shadowBlur: 0,
      shadowColor: "rgba(0, 0, 0, 0)",
      shadowOffsetX: 0,
      shadowOffsetY: 0,
      filter: "none",
      letterSpacing: "0px",
      wordSpacing: "0px",
      fontKerning: "auto",
      fontStretch: "normal",
      fontVariantCaps: "normal",
      textRendering: "auto",
    };
  }

  const PLAIN = ["globalAlpha", "lineWidth", "miterLimit", "lineDashOffset", "shadowBlur", "shadowOffsetX", "shadowOffsetY"];
  const WORDS = {
    lineCap: CAPS, lineJoin: JOINS, textAlign: ALIGNS, textBaseline: BASELINES,
    direction: { ltr: 1, rtl: 1, inherit: 1 }, imageSmoothingQuality: { low: 1, medium: 1, high: 1 },
    fontKerning: { auto: 1, normal: 1, none: 1 }, textRendering: { auto: 1, optimizeSpeed: 1, optimizeLegibility: 1, geometricPrecision: 1 },
  };
  const OTHER = ["globalCompositeOperation", "imageSmoothingEnabled", "shadowColor", "filter", "letterSpacing", "wordSpacing", "fontStretch", "fontVariantCaps"];

  class CanvasRenderingContext2D {
    constructor(canvas, options) {
      this.canvas = canvas;
      this._alpha = options?.alpha !== false;
      this._node = canvas.nodeId;
      this._reset();
    }
    _reset() {
      const width = Math.max(1, this.canvas.width | 0);
      const height = Math.max(1, this.canvas.height | 0);
      this._state = initialState(width, height);
      this._stack = [];
      this._begin();
      const w = command(SIZE, this._node);
      w.u32(width);
      w.u32(height);
      w.u32(this._alpha ? 0 : 1);
    }
    // The canvas's width or height was set: the bitmap and the state start again.
    _resized() {
      this._reset();
    }
    _transform() {
      return this._state.transform;
    }
    getContextAttributes() {
      return { alpha: this._alpha, desynchronized: false, colorSpace: "srgb", willReadFrequently: false };
    }
    reset() {
      this._reset();
    }
    isContextLost() {
      return false;
    }

    save() {
      this._stack.push({ ...this._state, lineDash: this._state.lineDash.slice() });
    }
    restore() {
      if (this._stack.length) this._state = this._stack.pop();
    }

    get fillStyle() {
      return this._state.fillStyle;
    }
    set fillStyle(value) {
      if (value instanceof CanvasGradient || value instanceof CanvasPattern) {
        this._state.fillStyle = value;
        this._state.fill = paintOf(value);
        return;
      }
      const parsed = parseColor(String(value));
      if (!parsed) return;
      this._state.fillStyle = String(value);
      this._state.fill = parsed;
    }
    get strokeStyle() {
      return this._state.strokeStyle;
    }
    set strokeStyle(value) {
      if (value instanceof CanvasGradient || value instanceof CanvasPattern) {
        this._state.strokeStyle = value;
        this._state.stroke = paintOf(value);
        return;
      }
      const parsed = parseColor(String(value));
      if (!parsed) return;
      this._state.strokeStyle = String(value);
      this._state.stroke = parsed;
    }
    get font() {
      return this._state.font;
    }
    set font(value) {
      const parsed = parseFont(value);
      if (!parsed) return;
      this._state.font = String(value);
      this._state.fontKey = parsed;
    }

    setLineDash(segments) {
      const values = Array.from(segments, Number);
      if (values.some((value) => !Number.isFinite(value) || value < 0)) return;
      this._state.lineDash = values.length % 2 ? values.concat(values) : values;
    }
    getLineDash() {
      return this._state.lineDash.slice();
    }

    // Transforms.
    setTransform(a, b, c, d, e, f) {
      if (typeof a === "object" && a !== null) ({ a = 1, b = 0, c = 0, d = 1, e = 0, f = 0 } = a);
      else if (a === undefined) [a, b, c, d, e, f] = IDENTITY;
      if (!finite(a, b, c, d, e, f)) return;
      this._state.transform = [+a, +b, +c, +d, +e, +f];
    }
    getTransform() {
      return matrix(this._state.transform);
    }
    resetTransform() {
      this._state.transform = IDENTITY;
    }
    transform(a, b, c, d, e, f) {
      if (!finite(a, b, c, d, e, f)) return;
      this._state.transform = multiply(this._state.transform, [a, b, c, d, e, f]);
    }
    translate(x, y) {
      this.transform(1, 0, 0, 1, x, y);
    }
    scale(x, y) {
      this.transform(x, 0, 0, y, 0, 0);
    }
    rotate(angle) {
      const cos = Math.cos(angle), sin = Math.sin(angle);
      this.transform(cos, sin, -sin, cos, 0, 0);
    }

    // Paths.
    beginPath() {
      this._begin();
    }
    // The points of `path` (a Path2D) under the current transform, or the current path.
    _pointsOf(path) {
      return path instanceof Path2D ? mapPoints(path._points, this._state.transform) : this._points;
    }
    _clipped(w) {
      const clip = this._state.clip;
      w.rect(clip[0], clip[1], clip[2], clip[3]);
      return w;
    }
    fill(path, rule) {
      if (typeof path === "string") [path, rule] = [undefined, path];
      const points = this._pointsOf(path);
      if (!points.length) return;
      const w = this._clipped(command(FILL_PATH, this._node));
      w.color(this._state.fill, this._state.globalAlpha);
      w.u32(rule === "evenodd" ? 1 : 0);
      writePath(w, points);
    }
    stroke(path) {
      const points = this._pointsOf(path);
      if (!points.length) return;
      const s = this._state;
      const scale = Math.sqrt(Math.abs(s.transform[0] * s.transform[3] - s.transform[1] * s.transform[2])) || 1;
      const w = this._clipped(command(STROKE_PATH, this._node));
      w.color(s.stroke, s.globalAlpha);
      w.u32(0);
      w.f64(s.lineWidth * scale);
      w.u32(CAPS[s.lineCap]);
      w.u32(JOINS[s.lineJoin]);
      w.f64(s.miterLimit);
      w.u32(s.lineDash.length);
      for (const value of s.lineDash) w.f64(value * scale);
      w.f64(s.lineDashOffset * scale);
      writePath(w, points);
    }
    clip(path, rule) {
      if (typeof path === "string") path = undefined;
      const bounds = boundsOf(this._pointsOf(path));
      const clip = this._state.clip;
      this._state.clip = [Math.max(clip[0], bounds[0]), Math.max(clip[1], bounds[1]), Math.min(clip[2], bounds[2]), Math.min(clip[3], bounds[3])];
      void rule;
    }
    isPointInPath() {
      return false;
    }
    isPointInStroke() {
      return false;
    }

    // Rectangles.
    _axisAligned() {
      const m = this._state.transform;
      return m[1] === 0 && m[2] === 0;
    }
    _deviceRect(x, y, w, h) {
      const m = this._state.transform;
      const a = apply(m, [x, y]), b = apply(m, [x + w, y + h]);
      return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])];
    }
    fillRect(x, y, w, h) {
      if (!finite(x, y, w, h) || w === 0 || h === 0) return;
      if (!this._axisAligned()) {
        const path = new Path2D();
        path.rect(x, y, w, h);
        return this.fill(path);
      }
      const r = this._deviceRect(x, y, w, h);
      const writer = this._clipped(command(FILL_RECT, this._node));
      writer.color(this._state.fill, this._state.globalAlpha);
      writer.rect(r[0], r[1], r[2], r[3]);
    }
    strokeRect(x, y, w, h) {
      if (!finite(x, y, w, h)) return;
      const path = new Path2D();
      path.rect(x, y, w, h);
      this.stroke(path);
    }
    clearRect(x, y, w, h) {
      if (!finite(x, y, w, h) || w === 0 || h === 0) return;
      const r = this._axisAligned() ? this._deviceRect(x, y, w, h) : boundsOf(mapPoints([MOVE, x, y, LINE, x + w, y, LINE, x + w, y + h, LINE, x, y + h], this._state.transform));
      const writer = this._clipped(command(CLEAR_RECT, this._node));
      writer.rect(r[0], r[1], r[2], r[3]);
    }

    // Text.
    fillText(text, x, y, maxWidth) {
      if (!finite(x, y)) return;
      const s = this._state;
      const m = s.transform;
      const origin = apply(m, [x, y]);
      const scale = Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) || 1;
      const w = this._clipped(command(FILL_TEXT, this._node));
      w.color(s.fill, s.globalAlpha);
      w.str(s.fontKey);
      w.str(String(text).replace(/[\t\n\f\r]/g, " "));
      w.f64(origin[0]);
      w.f64(origin[1]);
      w.f64(scale);
      w.u32(ALIGNS[s.direction === "rtl" && (s.textAlign === "start" || s.textAlign === "end") ? (s.textAlign === "start" ? "end" : "start") : s.textAlign]);
      w.u32(BASELINES[s.textBaseline]);
      w.f64(maxWidth === undefined || !Number.isFinite(+maxWidth) ? -1 : Math.max(0, +maxWidth));
    }
    strokeText(text, x, y, maxWidth) {
      const fill = this._state.fill;
      this._state.fill = this._state.stroke;
      this.fillText(text, x, y, maxWidth);
      this._state.fill = fill;
    }
    measureText(text) {
      native.canvas2dText(this._state.fontKey, String(text));
      const values = [];
      for (let i = 0; i < 7; i++) values.push(native.geometry(i));
      return new TextMetrics(values);
    }

    // Images.
    createImageData(width, height) {
      if (typeof width === "object") return new ImageData(width.width, width.height);
      return new ImageData(Math.abs(width) | 0, Math.abs(height) | 0);
    }
    getImageData(x, y, w, h) {
      send();
      const image = new ImageData(Math.abs(w) | 0, Math.abs(h) | 0);
      native.canvas2dRead(this._node, x | 0, y | 0, image.width, image.height, image.data);
      return image;
    }
    putImageData(image, x, y, dirtyX = 0, dirtyY = 0, dirtyWidth = image.width, dirtyHeight = image.height) {
      const writer = command(PUT_PIXELS, this._node);
      const x0 = x + Math.max(0, dirtyX), y0 = y + Math.max(0, dirtyY);
      writer.rect(x0, y0, Math.min(x + image.width, x0 + dirtyWidth), Math.min(y + image.height, y0 + dirtyHeight));
      writer.f64(x);
      writer.f64(y);
      writer.u32(image.width);
      writer.u32(image.height);
      writer.u32(image.data.length);
      writer.raw(new Uint8Array(image.data.buffer, image.data.byteOffset, image.data.byteLength));
    }
    drawImage(image, ...args) {
      const context = image?.getContext?.("2d");
      const source = context instanceof CanvasRenderingContext2D ? context : image instanceof ImageData || (image?.data && image.width && image.height) ? image : null;
      if (!source) return;
      const width = source instanceof CanvasRenderingContext2D ? image.width : source.width;
      const height = source instanceof CanvasRenderingContext2D ? image.height : source.height;
      let sx = 0, sy = 0, sw = width, sh = height, dx, dy, dw, dh;
      if (args.length <= 2) [dx, dy, dw, dh] = [args[0], args[1], width, height];
      else if (args.length <= 4) [dx, dy, dw, dh] = args;
      else [sx, sy, sw, sh, dx, dy, dw, dh] = args;
      if (!finite(sx, sy, sw, sh, dx, dy, dw, dh)) return;
      const r = this._deviceRect(dx, dy, dw, dh);
      const w = this._clipped(command(source instanceof CanvasRenderingContext2D ? DRAW_CANVAS : DRAW_PIXELS, this._node));
      w.f64(this._state.globalAlpha);
      w.rect(sx, sy, sx + sw, sy + sh);
      w.rect(r[0], r[1], r[2], r[3]);
      if (source instanceof CanvasRenderingContext2D) {
        w.u32(source._node);
      } else {
        w.u32(source.width);
        w.u32(source.height);
        w.u32(source.data.length);
        w.raw(new Uint8Array(source.data.buffer, source.data.byteOffset, source.data.byteLength));
      }
    }

    createLinearGradient() {
      return new CanvasGradient();
    }
    createRadialGradient() {
      return new CanvasGradient();
    }
    createConicGradient() {
      return new CanvasGradient();
    }
    createPattern() {
      return new CanvasPattern();
    }
    drawFocusIfNeeded() {}
    scrollPathIntoView() {}
  }
  Object.assign(CanvasRenderingContext2D.prototype, pathMethods);
  for (const name of PLAIN) {
    Object.defineProperty(CanvasRenderingContext2D.prototype, name, {
      get() {
        return this._state[name];
      },
      set(value) {
        value = +value;
        if (!Number.isFinite(value)) return;
        if (name === "globalAlpha" && (value < 0 || value > 1)) return;
        if ((name === "lineWidth" || name === "miterLimit") && value <= 0) return;
        this._state[name] = value;
      },
      configurable: true,
    });
  }
  for (const [name, values] of Object.entries(WORDS)) {
    Object.defineProperty(CanvasRenderingContext2D.prototype, name, {
      get() {
        return this._state[name];
      },
      set(value) {
        if (Object.prototype.hasOwnProperty.call(values, value)) this._state[name] = value;
      },
      configurable: true,
    });
  }
  for (const name of OTHER) {
    Object.defineProperty(CanvasRenderingContext2D.prototype, name, {
      get() {
        return this._state[name];
      },
      set(value) {
        this._state[name] = name === "imageSmoothingEnabled" ? !!value : String(value);
      },
      configurable: true,
    });
  }

  function writePath(w, points) {
    w.u32(segmentCount(points));
    let i = 0;
    while (i < points.length) {
      const verb = points[i++];
      w.u32(verb);
      const count = verb === MOVE || verb === LINE ? 2 : verb === QUAD ? 4 : verb === CUBIC ? 6 : 0;
      for (let k = 0; k < count; k++) w.f64(points[i++]);
    }
  }

  const contexts = new WeakMap();
  return {
    context(canvas, options) {
      let context = contexts.get(canvas);
      if (!context) contexts.set(canvas, (context = new CanvasRenderingContext2D(canvas, options)));
      return context;
    },
    globals: { CanvasRenderingContext2D, Path2D, ImageData, TextMetrics, CanvasGradient, CanvasPattern },
  };
});
