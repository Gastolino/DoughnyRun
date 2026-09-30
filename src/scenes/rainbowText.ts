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

export function drawRainbow(text: string, size: number): HTMLCanvasElement {
  const px = size * RAINBOW_SCALE;
  const canvas = document.createElement("canvas");
  const measure = canvas.getContext("2d");
  if (!measure) return canvas;
  const font = `700 ${px}px ${FUN_FONT}`;
  measure.font = font;
  const lines = text.split("\n");
  const widths = lines.map((l) => measure.measureText(l).width);
  const lineHeight = px * 1.18;
  const pad = px * 0.3;
  canvas.width = Math.ceil(Math.max(1, ...widths) + pad * 2);
  canvas.height = Math.ceil(lines.length * lineHeight + pad * 2);

  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.font = font;
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  const rainbow = ctx.createLinearGradient(0, 0, canvas.width, canvas.height * 0.4);
  OUTLINE.forEach((c, i) => rainbow.addColorStop(i / (OUTLINE.length - 1), c));

  // Every letter's position, so the three passes line up.
  const glyphs: { ch: string; x: number; y: number; color: string }[] = [];
  let colorIndex = 0;
  lines.forEach((line, row) => {
    let x = (canvas.width - widths[row]) / 2;
    const y = pad + lineHeight * (row + 0.5);
    for (const ch of line) {
      const color = LETTER_COLORS[colorIndex % LETTER_COLORS.length];
      if (ch.trim()) colorIndex++;
      glyphs.push({ ch, x, y, color });
      x += ctx.measureText(ch).width;
    }
  });

  ctx.strokeStyle = rainbow;
  ctx.lineWidth = px * 0.34;
  for (const g of glyphs) ctx.strokeText(g.ch, g.x, g.y);
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = px * 0.17;
  for (const g of glyphs) ctx.strokeText(g.ch, g.x, g.y);
  for (const g of glyphs) {
    ctx.fillStyle = g.color;
    ctx.fillText(g.ch, g.x, g.y);
  }
  return canvas;
}

/** The rainbow text as a Phaser texture, drawn once per distinct text and size. */
export function rainbowTexture(scene: Phaser.Scene, text: string, size: number): string {
  const key = `rainbow:${size}:${text}`;
  if (!scene.textures.exists(key)) scene.textures.addCanvas(key, drawRainbow(text, size));
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
): Phaser.GameObjects.Image {
  const img = scene.add
    .image(x, y, rainbowTexture(scene, text, size))
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
