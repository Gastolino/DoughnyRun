import Phaser from "phaser";
import { INK, OUTLINE_FONT, READABLE_FONT, TITLE_FONT } from "./fonts";

// Rainbow lettering: each letter a different colour, inside one clean white
// edge. Title lines are Bubble Toy Solid Bold with the Outline
// Bold cut drawn over it in ink, which gives every bubble letter its inked
// contour and shine marks. Sentence lines are in the readable face with the
// same edge. Drawn on a canvas at twice the size it is shown, so that it
// stays crisp when the game is scaled up on a phone. The same drawing serves
// the game and the menu.

export const LETTER_COLORS = ["#ff4a64", "#ff8f2e", "#ffd23f", "#4fd66f", "#4fb3ff", "#a87bff", "#ff6fc6"];
export const SPLASH_COLORS = [0xff5fa2, 0xffa24a, 0xffd23f, 0x6fd66f, 0x4fb3ff, 0xa87bff, 0xffffff];

export const RAINBOW_SCALE = 2;

/**
 * "plain" is for banners and titles. "bubbly" is for grade call-outs: capital
 * letters that tilt and bounce a little, each with a glossy highlight across
 * its top.
 */
export type RainbowStyle = "plain" | "bubbly";

interface Glyph {
  ch: string;
  x: number;
  y: number;
  color: string;
  tilt: number;
  font: string;
  px: number;
  title: boolean;
}

function drawGlyphs(ctx: CanvasRenderingContext2D, glyphs: Glyph[], paint: (g: Glyph) => void): void {
  for (const g of glyphs) {
    ctx.save();
    ctx.translate(g.x, g.y);
    ctx.rotate(g.tilt);
    paint(g);
    ctx.restore();
  }
}

/**
 * A blank canvas the same size as another, for building a layer.
 */
function layer(like: HTMLCanvasElement): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = like.width;
  c.height = like.height;
  return [c, c.getContext("2d") as CanvasRenderingContext2D];
}

/**
 * Softens a shape's alpha with a box blur (run three times, which is close to
 * a Gaussian blur), then cuts it back at half strength with a narrow smooth
 * edge. Convex points and concave notches both come out rounded, so an
 * outline built this way has no sharp edges anywhere. Done by hand because
 * canvas filters are not available in every phone browser.
 */
function roundOff(canvas: HTMLCanvasElement, radius: number): void {
  const ctx = canvas.getContext("2d");
  if (!ctx || radius < 1) return;
  const { width: w, height: h } = canvas;
  const img = ctx.getImageData(0, 0, w, h);
  const a = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) a[i] = img.data[i * 4 + 3] / 255;
  const tmp = new Float32Array(w * h);
  const r = Math.max(1, Math.round(radius / 1.7));
  const blur = (src: Float32Array, dst: Float32Array, horizontal: boolean) => {
    const len = horizontal ? w : h;
    const lines = horizontal ? h : w;
    for (let l = 0; l < lines; l++) {
      const at = (k: number) => (horizontal ? l * w + k : k * w + l);
      let sum = 0;
      for (let k = -r; k <= r; k++) sum += src[at(Math.min(len - 1, Math.max(0, k)))];
      for (let k = 0; k < len; k++) {
        dst[at(k)] = sum / (2 * r + 1);
        sum += src[at(Math.min(len - 1, k + r + 1))] - src[at(Math.max(0, k - r))];
      }
    }
  };
  for (let pass = 0; pass < 3; pass++) {
    blur(a, tmp, true);
    blur(tmp, a, false);
  }
  for (let i = 0; i < w * h; i++) {
    const t = Math.min(1, Math.max(0, (a[i] - 0.46) / 0.08));
    img.data[i * 4] = 255;
    img.data[i * 4 + 1] = 255;
    img.data[i * 4 + 2] = 255;
    img.data[i * 4 + 3] = Math.round(t * t * (3 - 2 * t) * 255);
  }
  ctx.putImageData(img, 0, 0);
}

/** Fills a mask's shape with a colour or gradient. */
function tint(mask: HTMLCanvasElement, fill: string | CanvasGradient): HTMLCanvasElement {
  const ctx = mask.getContext("2d") as CanvasRenderingContext2D;
  ctx.globalCompositeOperation = "source-in";
  ctx.fillStyle = fill;
  ctx.fillRect(0, 0, mask.width, mask.height);
  ctx.globalCompositeOperation = "source-over";
  return mask;
}

/**
 * Draws rainbow text. The first `titleLines` lines are titles, single words
 * or scores, in Bubble Toy; any lines after them are sentences, in the
 * readable face at a slightly smaller size.
 */
export function drawRainbow(
  text: string,
  size: number,
  style: RainbowStyle = "plain",
  titleLines = Infinity,
  lineColors: readonly (string | null)[] = [],
): HTMLCanvasElement {
  const bubbly = style === "bubbly";
  const base = size * RAINBOW_SCALE;
  const canvas = document.createElement("canvas");
  const measure = canvas.getContext("2d");
  if (!measure) return canvas;
  const lines = text.split("\n").map((raw, row) => {
    const title = row < titleLines;
    const px = title ? base : base * 0.9;
    return {
      text: title && bubbly ? raw.toUpperCase() : raw,
      title,
      px,
      font: title ? `${px}px ${TITLE_FONT}` : `700 ${px}px ${READABLE_FONT}`,
      // Bubbly letters stand a little apart, so each reads as its own bubble.
      spacing: title && bubbly ? px * 0.06 : 0,
      height: px * (title ? (bubbly ? 1.12 : 1.18) : 1.3),
    };
  });
  const widths = lines.map((l) => {
    measure.font = l.font;
    return measure.measureText(l.text).width + l.spacing * Math.max(0, [...l.text].length - 1);
  });
  const pad = base * 0.36;
  canvas.width = Math.ceil(Math.max(1, ...widths) + pad * 2);
  canvas.height = Math.ceil(lines.reduce((h, l) => h + l.height, 0) + pad * 2);

  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  // Every letter's position, so the passes line up.
  const glyphs: Glyph[] = [];
  let colorIndex = 0;
  let top = pad;
  lines.forEach((line, row) => {
    // Sizing a canvas resets its settings, the font included.
    measure.font = line.font;
    const fixed = lineColors[row] ?? null;
    let x = (canvas.width - widths[row]) / 2;
    const y = top + line.height / 2;
    top += line.height;
    for (const ch of line.text) {
      const color = fixed ?? LETTER_COLORS[colorIndex % LETTER_COLORS.length];
      const w = measure.measureText(ch).width;
      const i = colorIndex;
      if (ch.trim()) colorIndex++;
      const wobble = bubbly && line.title;
      const tilt = wobble ? Math.sin(i * 1.9 + 0.5) * 0.09 : 0;
      const bounce = wobble ? Math.sin(i * 2.4) * line.px * 0.045 : 0;
      glyphs.push({ ch, x: x + w / 2, y: y + bounce, color, tilt, font: line.font, px: line.px, title: line.title });
      x += w + line.spacing;
    }
  });
  const setup = (c: CanvasRenderingContext2D) => {
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.lineJoin = "round";
    c.lineCap = "round";
  };

  // Edge layers: each is the letters stroked wide, then rounded off.
  const edgeLayer = (factor: number): HTMLCanvasElement => {
    const [c, g] = layer(canvas);
    setup(g);
    g.strokeStyle = "#fff";
    g.fillStyle = "#fff";
    drawGlyphs(g, glyphs, (gl) => {
      g.font = gl.font;
      g.lineWidth = gl.px * factor;
      g.strokeText(gl.ch, 0, 0);
      g.fillText(gl.ch, 0, 0);
    });
    roundOff(c, base * factor * 0.45);
    return c;
  };
  const edge = edgeLayer(bubbly ? 0.26 : 0.23);
  ctx.drawImage(tint(edge, "#ffffff"), 0, 0);

  // The letters, with a soft gloss across the top of each bubble letter.
  const [letters, lg] = layer(canvas);
  setup(lg);
  drawGlyphs(lg, glyphs, (gl) => {
    lg.font = gl.font;
    lg.fillStyle = gl.color;
    lg.fillText(gl.ch, 0, 0);
  });
  lg.globalCompositeOperation = "source-atop";
  drawGlyphs(lg, glyphs, (gl) => {
    if (!gl.title) return;
    const shine = lg.createLinearGradient(0, -gl.px * 0.42, 0, -gl.px * 0.05);
    shine.addColorStop(0, "rgba(255,255,255,0.35)");
    shine.addColorStop(1, "rgba(255,255,255,0)");
    lg.fillStyle = shine;
    lg.fillRect(-gl.px, -gl.px, gl.px * 2, gl.px * 1.1);
  });
  lg.globalCompositeOperation = "source-over";
  // The outline cut over each bubble letter, in ink.
  drawGlyphs(lg, glyphs, (gl) => {
    if (!gl.title) return;
    lg.font = gl.font.replace(TITLE_FONT, OUTLINE_FONT);
    lg.fillStyle = INK;
    lg.strokeStyle = INK;
    // A hair of stroke keeps the ink lines from vanishing at small sizes.
    lg.lineWidth = gl.px * 0.012;
    lg.fillText(gl.ch, 0, 0);
    lg.strokeText(gl.ch, 0, 0);
  });
  ctx.drawImage(letters, 0, 0);
  return canvas;
}

/** The rainbow text as a Phaser texture, drawn once per distinct text and size. */
export function rainbowTexture(
  scene: Phaser.Scene,
  text: string,
  size: number,
  style: RainbowStyle = "plain",
  titleLines = Infinity,
  lineColors: readonly (string | null)[] = [],
): string {
  const key = `rainbow:${style}:${size}:${titleLines}:${lineColors.join(",")}:${text}`;
  if (!scene.textures.exists(key)) scene.textures.addCanvas(key, drawRainbow(text, size, style, titleLines, lineColors));
  return key;
}

/**
 * Shows rainbow text pinned to the screen, popping in with a splash of sugar
 * sprinkles thrown out from behind it.
 */
export function showRainbow(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  size: number,
  depth: number,
  splash = true,
  style: RainbowStyle = "plain",
  titleLines = Infinity,
  lineColors: readonly (string | null)[] = [],
): Phaser.GameObjects.Image {
  const img = scene.add
    .image(x, y, rainbowTexture(scene, text, size, style, titleLines, lineColors))
    .setScale(0.4 / RAINBOW_SCALE)
    .setScrollFactor(0)
    .setDepth(depth);
  scene.tweens.add({ targets: img, scale: 1 / RAINBOW_SCALE, duration: 260, ease: "Back.easeOut" });
  if (splash) sprinkleSplash(scene, x, y, img.width / RAINBOW_SCALE, depth - 1);
  return img;
}

export function sprinkleSplash(scene: Phaser.Scene, x: number, y: number, width: number, depth: number): void {
  const count = Math.round(Math.min(40, 12 + width / 12));
  const burst = scene.add
    .particles(x, y, "pill", {
      x: { min: -width / 2, max: width / 2 },
      speed: { min: 140, max: 420 },
      angle: { min: 0, max: 360 },
      gravityY: 700,
      lifespan: { min: 500, max: 900 },
      rotate: { min: 0, max: 360 },
      scale: { start: 0.7, end: 0.4 },
      alpha: { start: 1, end: 0 },
      tint: SPLASH_COLORS,
      emitting: false,
    })
    .setScrollFactor(0)
    .setDepth(depth);
  burst.explode(count);
  scene.time.delayedCall(1000, () => burst.destroy());
}
