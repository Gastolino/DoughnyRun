import Phaser from "phaser";
import { FUN_FONT } from "./fonts";

// Rainbow lettering: bold comic letters, each a different colour, inside a
// white edge and an outer outline that runs through the rainbow. Drawn on a
// canvas at twice the size it is shown, so that it stays crisp when the game
// is scaled up on a phone. The same drawing serves the game and the menu.

const LETTER_COLORS = ["#e8203a", "#f26b1d", "#dba000", "#23a34a", "#1f7de0", "#7b3fe4", "#d6247f"];
const OUTLINE = ["#ff3b5c", "#ff9a3c", "#ffe14a", "#4fd66f", "#4fb3ff", "#a87bff", "#ff5fc0"];
export const SPLASH_COLORS = [0xff5fa2, 0xffa24a, 0xffd23f, 0x6fd66f, 0x4fb3ff, 0xa87bff, 0xffffff];

export const RAINBOW_SCALE = 2;

/**
 * "plain" is for banners and titles. "bubbly" is for grade call-outs: capital
 * letters that tilt and bounce a little, each with a glossy highlight across
 * its top, over a soft shadow.
 */
export type RainbowStyle = "plain" | "bubbly";

interface Glyph {
  ch: string;
  x: number;
  y: number;
  color: string;
  tilt: number;
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
    const t = Math.min(1, Math.max(0, (a[i] - 0.38) / 0.24));
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

export function drawRainbow(text: string, size: number, style: RainbowStyle = "plain"): HTMLCanvasElement {
  const bubbly = style === "bubbly";
  const px = size * RAINBOW_SCALE;
  const canvas = document.createElement("canvas");
  const measure = canvas.getContext("2d");
  if (!measure) return canvas;
  const font = `${px}px ${FUN_FONT}`;
  measure.font = font;
  const lines = (bubbly ? text.toUpperCase() : text).split("\n");
  // Bubbly letters stand a little apart, so each reads as its own bubble.
  const spacing = bubbly ? px * 0.06 : 0;
  const widths = lines.map((l) => measure.measureText(l).width + spacing * Math.max(0, [...l].length - 1));
  const lineHeight = px * (bubbly ? 1.12 : 1.18);
  const pad = px * 0.36;
  canvas.width = Math.ceil(Math.max(1, ...widths) + pad * 2);
  canvas.height = Math.ceil(lines.length * lineHeight + pad * 2);

  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  // Sizing a canvas resets its settings, the font included.
  measure.font = font;

  // Every letter's position, so the passes line up.
  const glyphs: Glyph[] = [];
  let colorIndex = 0;
  lines.forEach((line, row) => {
    let x = (canvas.width - widths[row]) / 2;
    const y = pad + lineHeight * (row + 0.5);
    for (const ch of line) {
      const color = LETTER_COLORS[colorIndex % LETTER_COLORS.length];
      const w = measure.measureText(ch).width;
      const i = colorIndex;
      if (ch.trim()) colorIndex++;
      const tilt = bubbly ? Math.sin(i * 1.9 + 0.5) * 0.09 : 0;
      const bounce = bubbly ? Math.sin(i * 2.4) * px * 0.045 : 0;
      glyphs.push({ ch, x: x + w / 2, y: y + bounce, color, tilt });
      x += w + spacing;
    }
  });
  const setup = (c: CanvasRenderingContext2D) => {
    c.font = font;
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.lineJoin = "round";
    c.lineCap = "round";
  };

  // Outline layers: each is the letters stroked wide, then rounded off.
  const outlineLayer = (width: number): HTMLCanvasElement => {
    const [c, g] = layer(canvas);
    setup(g);
    g.lineWidth = width;
    g.strokeStyle = "#fff";
    g.fillStyle = "#fff";
    drawGlyphs(g, glyphs, (gl) => {
      g.strokeText(gl.ch, 0, 0);
      g.fillText(gl.ch, 0, 0);
    });
    roundOff(c, width * 0.45);
    return c;
  };
  const rainbow = ctx.createLinearGradient(0, 0, canvas.width, canvas.height * 0.4);
  OUTLINE.forEach((c, i) => rainbow.addColorStop(i / (OUTLINE.length - 1), c));
  const outer = outlineLayer(px * (bubbly ? 0.4 : 0.34));
  const inner = outlineLayer(px * (bubbly ? 0.2 : 0.17));

  if (bubbly) {
    // A soft shadow under the whole word, for depth.
    const [shadow] = layer(canvas);
    shadow.getContext("2d")?.drawImage(outer, 0, 0);
    tint(shadow, "rgba(74, 35, 64, 0.28)");
    ctx.drawImage(shadow, 0, px * 0.07);
  }
  ctx.drawImage(tint(outer, rainbow), 0, 0);
  ctx.drawImage(tint(inner, "#ffffff"), 0, 0);

  // The letters, and for bubbly text a glossy highlight across each top.
  const [letters, lg] = layer(canvas);
  setup(lg);
  drawGlyphs(lg, glyphs, (gl) => {
    lg.fillStyle = gl.color;
    lg.fillText(gl.ch, 0, 0);
  });
  if (bubbly) {
    lg.globalCompositeOperation = "source-atop";
    drawGlyphs(lg, glyphs, () => {
      const shine = lg.createLinearGradient(0, -px * 0.42, 0, px * 0.05);
      shine.addColorStop(0, "rgba(255,255,255,0.75)");
      shine.addColorStop(0.55, "rgba(255,255,255,0.25)");
      shine.addColorStop(1, "rgba(255,255,255,0)");
      lg.fillStyle = shine;
      lg.fillRect(-px, -px, px * 2, px * 1.05);
    });
    lg.globalCompositeOperation = "source-over";
  }
  ctx.drawImage(letters, 0, 0);
  return canvas;
}

/** The rainbow text as a Phaser texture, drawn once per distinct text and size. */
export function rainbowTexture(scene: Phaser.Scene, text: string, size: number, style: RainbowStyle = "plain"): string {
  const key = `rainbow:${style}:${size}:${text}`;
  if (!scene.textures.exists(key)) scene.textures.addCanvas(key, drawRainbow(text, size, style));
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
): Phaser.GameObjects.Image {
  const img = scene.add
    .image(x, y, rainbowTexture(scene, text, size, style))
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
