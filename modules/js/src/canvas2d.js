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
// A draw that needs more than a color over the bitmap (a gradient or pattern, a clip shaped like
// its path, a shadow, another composite operation) goes first with an EFFECTS command, and a clip
// that is not a rectangle goes as a CLIP_MASK command the first time a draw uses it. Not drawn as
<<<<<<< HEAD
// in a browser: `filter`, `letterSpacing` and `wordSpacing`, and images other than 2D canvases
// and `ImageData`.
=======
// in a browser: `filter`, `letterSpacing` and `wordSpacing`, and images other than 2D canvases,
// `ImageData` and `ImageBitmap`.
>>>>>>> origin/main
//
// Edit this, then run `silk task embed-assets` to regenerate generated_canvas2d_api.silk.
(function (native) {
  const SIZE = 1, FILL_RECT = 2, CLEAR_RECT = 3, FILL_PATH = 4, STROKE_PATH = 5, FILL_TEXT = 6;
  const PUT_PIXELS = 7, DRAW_PIXELS = 8, DRAW_CANVAS = 9, CLIP_MASK = 10, EFFECTS = 11;
  const COMPOSITE = {
    "source-over": 0, "source-in": 1, "source-out": 2, "source-atop": 3, "destination-over": 4,
    "destination-in": 5, "destination-out": 6, "destination-atop": 7, lighter: 8, copy: 9, xor: 10,
    multiply: 11, screen: 12, overlay: 13, darken: 14, lighten: 15, "color-dodge": 16,
    "color-burn": 17, "hard-light": 18, "soft-light": 19, difference: 20, exclusion: 21, hue: 22,
    saturation: 23, color: 24, luminosity: 25,
  };
  const REPEAT = { repeat: 3, "repeat-x": 1, "repeat-y": 2, "no-repeat": 0, "": 3 };
  const LINEAR = 1, RADIAL = 2, CONIC = 3, PATTERN = 4;
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

  // `kind` is LINEAR (x0, y0, x1, y1), RADIAL (x0, y0, r0, x1, y1, r1) or CONIC (angle, x, y).
  class CanvasGradient {
    constructor(kind, geometry) {
      this._kind = kind;
      this._geometry = geometry;
      this._stops = [];
    }
    addColorStop(offset, color) {
      offset = +offset;
      if (!(offset >= 0 && offset <= 1)) throw new RangeError("The offset is outside 0 to 1.");
      const parsed = parseColor(String(color));
      if (!parsed) throw new SyntaxError("'" + color + "' is not a color");
      let at = this._stops.length;
      while (at > 0 && this._stops[at - 1][0] > offset) at--;
      this._stops.splice(at, 0, [offset, parsed]);
    }
  }
  // `source` is a context (another canvas) or an ImageData.
  class CanvasPattern {
    constructor(source, repeat) {
      this._source = source;
      this._repeat = repeat;
      this._matrix = IDENTITY;
    }
    setTransform(m) {
      if (m === undefined) this._matrix = IDENTITY;
      else this._matrix = [m.a ?? m.m11 ?? 1, m.b ?? m.m12 ?? 0, m.c ?? m.m21 ?? 0, m.d ?? m.m22 ?? 1, m.e ?? m.m41 ?? 0, m.f ?? m.m42 ?? 0];
    }
  }
  // The color a style paints, or null when it is a gradient or a pattern.
  function paintOf(style) {
    if (style instanceof CanvasGradient || style instanceof CanvasPattern) return null;
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
      // Clips that are not rectangles, in device pixels: [{ points, rule }], and their number.
      clipPaths: [],
      clipId: 0,
      shadow: [0, 0, 0, 0],
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
      // The clip whose mask the host keeps for this canvas.
      this._sentClip = 0;
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
    // Sends what the next draw needs beyond a color over the bitmap: the clip mask, and EFFECTS
    // (`style` a gradient or pattern, a shadow, another operation). Returns the alpha the draw's
    // own colors carry (EFFECTS carries globalAlpha), or -1 when nothing would be drawn.
    // `op` overrides the composite operation with no shadow and no globalAlpha (clearRect).
    _effects(style, op) {
      const s = this._state;
      const clip = s.clip;
      if (!(clip[0] < clip[2] && clip[1] < clip[3])) return -1;
      const plain = op !== undefined;
      op ??= COMPOSITE[s.globalCompositeOperation];
      const masked = s.clipPaths.length > 0;
      if (masked && this._sentClip !== s.clipId) {
        const w = this._clipped(command(CLIP_MASK, this._node));
        w.u32(s.clipPaths.length);
        for (const { points, rule } of s.clipPaths) {
          w.u32(rule);
          writePath(w, points);
        }
        this._sentClip = s.clipId;
      }
      const shadow = !plain && s.shadow[3] > 0 && (s.shadowBlur > 0 || s.shadowOffsetX !== 0 || s.shadowOffsetY !== 0);
      const painted = style instanceof CanvasGradient || style instanceof CanvasPattern;
      if (!masked && !shadow && op === 0 && !painted) return s.globalAlpha;
      let inverse = null;
      if (painted) {
        inverse = invert(style instanceof CanvasPattern ? multiply(s.transform, style._matrix) : s.transform);
        if (!inverse) return -1;
      }
      const w = this._clipped(command(EFFECTS, this._node));
      w.u32(op);
      w.f64(plain ? 1 : s.globalAlpha);
      w.u32(masked ? 1 : 0);
      w.u32(s.imageSmoothingEnabled ? 1 : 0);
      w.color(shadow ? s.shadow : [0, 0, 0, 0], 1);
      w.f64(s.shadowBlur);
      w.f64(s.shadowOffsetX);
      w.f64(s.shadowOffsetY);
      if (!painted) {
        w.u32(0);
        return 1;
      }
      w.u32(style instanceof CanvasGradient ? style._kind : PATTERN);
      for (const value of inverse) w.f64(value);
      if (style instanceof CanvasGradient) {
        for (let i = 0; i < 6; i++) w.f64(style._geometry[i] ?? 0);
        w.u32(style._stops.length);
        for (const [offset, color] of style._stops) {
          w.f64(offset);
          w.color(color, 1);
        }
      } else {
        const image = style._source;
        w.u32(REPEAT[style._repeat]);
        w.u32(image.width);
        w.u32(image.height);
        w.u32(image.data.length);
        w.raw(new Uint8Array(image.data.buffer, image.data.byteOffset, image.data.byteLength));
      }
      return 1;
    }
    _strokeStyle(w) {
      const s = this._state;
      w.f64(s.lineWidth);
      w.u32(CAPS[s.lineCap]);
      w.u32(JOINS[s.lineJoin]);
      w.f64(s.miterLimit);
      w.u32(s.lineDash.length);
      for (const value of s.lineDash) w.f64(value);
      w.f64(s.lineDashOffset);
    }
    fill(path, rule) {
      if (typeof path === "string") [path, rule] = [undefined, path];
      const points = this._pointsOf(path);
      if (!points.length) return;
      const alpha = this._effects(this._state.fillStyle);
      if (alpha < 0) return;
      const w = this._clipped(command(FILL_PATH, this._node));
      w.color(this._state.fill ?? WHITE, alpha);
      w.u32(rule === "evenodd" ? 1 : 0);
      writePath(w, points);
    }
    // The path goes in user space with the transform, so the line width, dashes and joins follow
    // the transform as a browser strokes them.
    stroke(path) {
      const points = this._pointsOf(path);
      if (!points.length) return;
      const s = this._state;
      const inverse = invert(s.transform);
      if (!inverse) return;
      const alpha = this._effects(s.strokeStyle);
      if (alpha < 0) return;
      const w = this._clipped(command(STROKE_PATH, this._node));
      w.color(s.stroke ?? WHITE, alpha);
      w.u32(0);
      this._strokeStyle(w);
      for (const value of s.transform) w.f64(value);
      writePath(w, mapPoints(points, inverse));
    }
    clip(path, rule) {
      if (typeof path === "string") [path, rule] = [undefined, path];
      const points = this._pointsOf(path);
      const rect = rectOf(points);
      const bounds = rect ?? boundsOf(points);
      const s = this._state;
      const clip = s.clip;
      s.clip = [Math.max(clip[0], bounds[0]), Math.max(clip[1], bounds[1]), Math.min(clip[2], bounds[2]), Math.min(clip[3], bounds[3])];
      if (!rect) {
        s.clipPaths = s.clipPaths.concat([{ points: points.slice(), rule: rule === "evenodd" ? 1 : 0 }]);
        s.clipId = ++clipCount;
      }
    }
    // `x`, `y` are in canvas pixels, as the points are.
    isPointInPath(path, x, y, rule) {
      if (!(path instanceof Path2D)) [path, x, y, rule] = [undefined, path, x, y];
      if (!finite(x, y)) return false;
      const lines = flatten(this._pointsOf(path));
      let winding = 0;
      for (let i = 0; i < lines.length; i += 4) {
        const [x0, y0, x1, y1] = [lines[i], lines[i + 1], lines[i + 2], lines[i + 3]];
        if ((y0 <= y) !== (y1 <= y)) {
          const cross = x0 + ((y - y0) / (y1 - y0)) * (x1 - x0);
          if (cross > x) winding += y1 > y0 ? 1 : -1;
        }
      }
      return rule === "evenodd" ? winding % 2 !== 0 : winding !== 0;
    }
    isPointInStroke(path, x, y) {
      if (!(path instanceof Path2D)) [path, x, y] = [undefined, path, x];
      if (!finite(x, y)) return false;
      const m = this._state.transform;
      const half = (this._state.lineWidth * (Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) || 1)) / 2;
      const lines = flatten(this._pointsOf(path));
      for (let i = 0; i < lines.length; i += 4) {
        const [x0, y0, x1, y1] = [lines[i], lines[i + 1], lines[i + 2], lines[i + 3]];
        const dx = x1 - x0, dy = y1 - y0;
        const length = dx * dx + dy * dy;
        const t = length ? Math.max(0, Math.min(1, ((x - x0) * dx + (y - y0) * dy) / length)) : 0;
        if (Math.hypot(x - (x0 + t * dx), y - (y0 + t * dy)) <= half) return true;
      }
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
      const alpha = this._effects(this._state.fillStyle);
      if (alpha < 0) return;
      const r = this._deviceRect(x, y, w, h);
      const writer = this._clipped(command(FILL_RECT, this._node));
      writer.color(this._state.fill ?? WHITE, alpha);
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
      if (this._axisAligned() && !this._state.clipPaths.length) {
        const r = this._deviceRect(x, y, w, h);
        const writer = this._clipped(command(CLEAR_RECT, this._node));
        writer.rect(r[0], r[1], r[2], r[3]);
        return;
      }
      // Erased as a fill that takes away what it covers.
      if (this._effects(null, COMPOSITE["destination-out"]) < 0) return;
      const writer = this._clipped(command(FILL_PATH, this._node));
      writer.color([0, 0, 0, 1], 1);
      writer.u32(0);
      writePath(writer, mapPoints([MOVE, x, y, LINE, x + w, y, LINE, x + w, y + h, LINE, x, y + h, CLOSE], this._state.transform));
    }

    // Text.
    fillText(text, x, y, maxWidth) {
      this._text(text, x, y, maxWidth, false);
    }
    strokeText(text, x, y, maxWidth) {
      this._text(text, x, y, maxWidth, true);
    }
    _text(text, x, y, maxWidth, stroke) {
      if (!finite(x, y)) return;
      const s = this._state;
      const alpha = this._effects(stroke ? s.strokeStyle : s.fillStyle);
      if (alpha < 0) return;
      const w = this._clipped(command(FILL_TEXT, this._node));
      w.color((stroke ? s.stroke : s.fill) ?? WHITE, alpha);
      w.str(s.fontKey);
      w.str(String(text).replace(/[\t\n\f\r]/g, " "));
      w.f64(x);
      w.f64(y);
      for (const value of s.transform) w.f64(value);
      w.u32(ALIGNS[s.direction === "rtl" && (s.textAlign === "start" || s.textAlign === "end") ? (s.textAlign === "start" ? "end" : "start") : s.textAlign]);
      w.u32(BASELINES[s.textBaseline]);
      w.f64(maxWidth === undefined || !Number.isFinite(+maxWidth) ? -1 : Math.max(0, +maxWidth));
      w.u32(stroke ? 1 : 0);
      if (stroke) this._strokeStyle(w);
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
      const source = imageSource(image);
      if (!source) return;
      const { width, height } = source;
      let sx = 0, sy = 0, sw = width, sh = height, dx, dy, dw, dh;
      if (args.length <= 2) [dx, dy, dw, dh] = [args[0], args[1], width, height];
      else if (args.length <= 4) [dx, dy, dw, dh] = args;
      else [sx, sy, sw, sh, dx, dy, dw, dh] = args;
      if (!finite(sx, sy, sw, sh, dx, dy, dw, dh) || sw === 0 || sh === 0 || dw === 0 || dh === 0) return;
      if (sw < 0) [sx, sw] = [sx + sw, -sw];
      if (sh < 0) [sy, sh] = [sy + sh, -sh];
      if (dw < 0) [dx, dw] = [dx + dw, -dw];
      if (dh < 0) [dy, dh] = [dy + dh, -dh];
      const alpha = this._effects(null);
      if (alpha < 0) return;
      const context = source.context;
      const w = this._clipped(command(context ? DRAW_CANVAS : DRAW_PIXELS, this._node));
      w.f64(alpha);
      w.rect(sx, sy, sx + sw, sy + sh);
      w.rect(dx, dy, dx + dw, dy + dh);
      for (const value of this._state.transform) w.f64(value);
      w.u32(this._state.imageSmoothingEnabled ? 1 : 0);
      if (context) {
        w.u32(context._node);
      } else {
        w.u32(source.width);
        w.u32(source.height);
        w.u32(source.data.length);
        w.raw(new Uint8Array(source.data.buffer, source.data.byteOffset, source.data.byteLength));
      }
    }

    createLinearGradient(x0, y0, x1, y1) {
      if (!finite(x0, y0, x1, y1)) throw new TypeError("The gradient's points are not finite.");
      return new CanvasGradient(LINEAR, [x0, y0, x1, y1]);
    }
    createRadialGradient(x0, y0, r0, x1, y1, r1) {
      if (!finite(x0, y0, r0, x1, y1, r1)) throw new TypeError("The gradient's circles are not finite.");
      if (r0 < 0 || r1 < 0) throw new RangeError("The radius is negative.");
      return new CanvasGradient(RADIAL, [x0, y0, r0, x1, y1, r1]);
    }
    createConicGradient(angle, x, y) {
      if (!finite(angle, x, y)) throw new TypeError("The gradient's center is not finite.");
      return new CanvasGradient(CONIC, [angle, x, y]);
    }
    // A canvas's pixels are taken as they are now, as a browser does.
    createPattern(image, repetition) {
      const repeat = repetition === null || repetition === undefined ? "repeat" : String(repetition);
      if (!(repeat in REPEAT)) throw new SyntaxError("'" + repeat + "' is not a pattern repetition");
      const source = imageSource(image);
      if (!source || !source.width || !source.height) return null;
      const pixels = source.context ? source.context.getImageData(0, 0, source.width, source.height) : source;
      return new CanvasPattern(pixels, repeat);
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
        if (name === "imageSmoothingEnabled") {
          this._state[name] = !!value;
          return;
        }
        value = String(value);
        if (name === "globalCompositeOperation" && !(value in COMPOSITE)) return;
        if (name === "shadowColor") {
          const parsed = parseColor(value);
          if (!parsed) return;
          this._state.shadow = parsed;
        }
        this._state[name] = value;
      },
      configurable: true,
    });
  }

  const WHITE = [1, 1, 1, 1];
  let clipCount = 0;
  function invert(m) {
    const det = m[0] * m[3] - m[1] * m[2];
    if (!det || !Number.isFinite(det)) return null;
    return [m[3] / det, -m[1] / det, -m[2] / det, m[0] / det, (m[2] * m[5] - m[3] * m[4]) / det, (m[1] * m[4] - m[0] * m[5]) / det];
  }
<<<<<<< HEAD
  // What drawImage and createPattern take: another 2D canvas, or pixels such as ImageData.
  function imageSource(image) {
=======
  // What drawImage and createPattern take: another 2D canvas, or pixels such as ImageData or
  // an ImageBitmap's (`createImageBitmap` in @silkui/core/globals).
  function imageSource(image) {
    if (image && Object.prototype.hasOwnProperty.call(image, "_pixels")) {
      if (!image._pixels) throw new (globalThis.DOMException ?? Error)("The image bitmap is closed.", "InvalidStateError");
      return image._pixels.width && image._pixels.height ? image._pixels : null;
    }
>>>>>>> origin/main
    const context = image?.getContext?.("2d");
    if (context instanceof CanvasRenderingContext2D) return { context, width: image.width, height: image.height };
    if (image?.data && image.width && image.height) return image;
    return null;
  }
  // The rectangle a path is, when it is one rectangle with sides along the axes.
  function rectOf(points) {
    const xs = [], ys = [];
    let i = 0;
    while (i < points.length) {
      const verb = points[i++];
      if (verb === QUAD || verb === CUBIC) return null;
      if (verb === CLOSE) continue;
      if (verb === MOVE && xs.length) {
        // closePath starts the next subpath at the first point; anything after it is more.
        if (i + 2 < points.length) return null;
        break;
      }
      xs.push(points[i]);
      ys.push(points[i + 1]);
      i += 2;
    }
    if (xs.length === 5 && xs[4] === xs[0] && ys[4] === ys[0]) {
      xs.pop();
      ys.pop();
    }
    if (xs.length !== 4) return null;
    for (let k = 0; k < 4; k++) {
      const n = (k + 1) % 4;
      if (xs[k] !== xs[n] && ys[k] !== ys[n]) return null;
    }
    const sides = xs[0] === xs[1] ? xs[1] !== xs[2] && ys[1] === ys[2] : ys[1] !== ys[2] && xs[1] === xs[2];
    if (!sides) return null;
    return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  }
  // The path as line segments [x0, y0, x1, y1, ...], each subpath closed.
  function flatten(points) {
    const out = [];
    let x = 0, y = 0, sx = 0, sy = 0;
    const to = (nx, ny) => {
      out.push(x, y, nx, ny);
      [x, y] = [nx, ny];
    };
    let i = 0;
    while (i < points.length) {
      const verb = points[i++];
      if (verb === MOVE) {
        if (x !== sx || y !== sy) to(sx, sy);
        [x, y, sx, sy] = [points[i], points[i + 1], points[i], points[i + 1]];
        i += 2;
      } else if (verb === LINE) {
        to(points[i], points[i + 1]);
        i += 2;
      } else if (verb === QUAD || verb === CUBIC) {
        const p = points.slice(i, i + (verb === QUAD ? 4 : 6));
        i += p.length;
        const [x0, y0] = [x, y];
        for (let k = 1; k <= 16; k++) {
          const t = k / 16, u = 1 - t;
          if (verb === QUAD) to(u * u * x0 + 2 * u * t * p[0] + t * t * p[2], u * u * y0 + 2 * u * t * p[1] + t * t * p[3]);
          else to(u * u * u * x0 + 3 * u * u * t * p[0] + 3 * u * t * t * p[2] + t * t * t * p[4], u * u * u * y0 + 3 * u * u * t * p[1] + 3 * u * t * t * p[3] + t * t * t * p[5]);
        }
      } else if (verb === CLOSE) {
        to(sx, sy);
      }
    }
    if (x !== sx || y !== sy) to(sx, sy);
    return out;
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
