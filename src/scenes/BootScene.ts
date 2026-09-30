import Phaser from "phaser";
import { TOPPING_IDS } from "../logic/toppings";
import type { ToppingId } from "../logic/toppings";
import { DOUGHNUT } from "../logic/tuning";
import { drawStar } from "./draw";
import { loadFunFont } from "./fonts";
import { COLORS, css } from "./palette";

// Draws the greybox textures at start-up, so the game needs no image files.
//
// The doughnut stands on edge with its hole facing the direction of travel,
// seen in three-quarter view as a tall ring. It is cut into a back half,
// drawn behind sausages, and a front half, drawn in front of them, so that a
// sausage appears to pass through the hole. The eyes are a separate image, so
// that the sprinkles can roll around the ring beneath them.

/** Half-width of the ring as drawn; the hitbox in tuning.ts is narrower. */
export const ART_HALF_WIDTH = 40;
const ART_HOLE_HALF_WIDTH = 12;

/** Where the eyes (and the sunglasses) sit, from the ring's centre. */
export const EYES_OFFSET = { x: 18, y: -33 } as const;

/** Frames of the sunglasses' rainbow shimmer. */
export const SHADES_FRAMES = 12;
const PAD = 4;

export class BootScene extends Phaser.Scene {
  constructor() {
    super("boot");
  }

  create(): void {
    for (const topping of TOPPING_IDS) {
      this.makeDoughnutHalf(`doughnut-back-${topping}`, "back", topping);
      this.makeDoughnutHalf(`doughnut-front-${topping}`, "front", topping);
    }
    this.makeEyes();
    this.makeCrumb();
    this.makeSprinkle();
    this.makeGlitter();
    this.makePill();
    this.makeBite();
    this.makeCopArm();
    this.makeShades();
    // Rainbow lettering is drawn onto canvases, which need the font ready.
    void loadFunFont().then(() => this.scene.start(window.location.hash === "#editor" ? "editor" : "menu"));
  }

  private makeDoughnutHalf(key: string, half: "back" | "front", topping: ToppingId): void {
    const w = ART_HALF_WIDTH * 2 + PAD * 2;
    const h = DOUGHNUT.outerRadius * 2 + PAD * 2;
    const tex = this.textures.createCanvas(key, w, h);
    if (!tex) return;
    const ctx = tex.getContext();
    const cx = w / 2;
    const cy = h / 2;

    ctx.save();
    ctx.beginPath();
    if (half === "back") ctx.rect(0, 0, cx, h);
    else ctx.rect(cx, 0, w - cx, h);
    ctx.clip();

    // Both halves carry the same drawing, so the doughnut reads as one ring;
    // the split only decides what a sausage passes in front of.
    const ellipsePair = (ox: number, oy: number, orx: number, ory: number, ix: number, irx: number, iry: number): void => {
      ctx.beginPath();
      ctx.ellipse(ox, oy, orx, ory, 0, 0, Math.PI * 2);
      ctx.moveTo(ix + irx, oy);
      ctx.ellipse(ix, oy, irx, iry, 0, 0, Math.PI * 2);
    };
    const ring = (): void =>
      ellipsePair(cx, cy, ART_HALF_WIDTH, DOUGHNUT.outerRadius, cx, ART_HOLE_HALF_WIDTH, DOUGHNUT.holeRadius);

    ring();
    ctx.fillStyle = css(COLORS.dough);
    ctx.fill("evenodd");

    // Icing on the near face, inset from the dough.
    ellipsePair(cx + 2, cy, ART_HALF_WIDTH - 6, DOUGHNUT.outerRadius - 5, cx + 1, ART_HOLE_HALF_WIDTH + 3, DOUGHNUT.holeRadius + 4);
    ctx.fillStyle = css(topping === "glaze" ? COLORS.glaze : COLORS.icing);
    ctx.fill("evenodd");
    if (topping === "glaze") {
      // A glossy streak along the upper left of the glaze.
      ctx.beginPath();
      ctx.ellipse(cx + 1, cy, ART_HALF_WIDTH - 10, DOUGHNUT.outerRadius - 9, 0, Math.PI * 1.05, Math.PI * 1.45);
      ctx.lineWidth = 3;
      ctx.lineCap = "round";
      ctx.strokeStyle = css(COLORS.glazeShine);
      ctx.stroke();
    }

    // Shadow inside the hole on the far side, which gives the ring its depth.
    if (half === "back") {
      ctx.beginPath();
      ctx.ellipse(cx - 2, cy, ART_HOLE_HALF_WIDTH + 1, DOUGHNUT.holeRadius + 1, 0, Math.PI / 2, (Math.PI * 3) / 2);
      ctx.lineWidth = 3;
      ctx.strokeStyle = css(COLORS.doughShade);
      ctx.stroke();
    }

    ring();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#5a3418";
    ctx.stroke();
    ctx.restore();
    tex.refresh();
  }

  /** Two eyes looking ahead, drawn on their own so that they stay put. */
  private makeEyes(): void {
    const w = 24;
    const h = 14;
    const tex = this.textures.createCanvas("doughnut-eyes", w, h);
    if (!tex) return;
    const ctx = tex.getContext();
    for (const ex of [6, 17]) {
      ctx.beginPath();
      ctx.ellipse(ex, 7, 4.6, 5.8, 0, 0, Math.PI * 2);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = "#5a3418";
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(ex + 1.8, 7, 2.4, 0, Math.PI * 2);
      ctx.fillStyle = "#2b1d2e";
      ctx.fill();
    }
    tex.refresh();
  }

  /**
   * The shape a bite takes out of the doughnut: a round bite whose edge is
   * scalloped by teeth. Used to erase, so only its shape matters.
   */
  private makeBite(): void {
    const tex = this.textures.createCanvas("bite", 52, 52);
    if (!tex) return;
    const g = tex.getContext();
    g.fillStyle = "#000000";
    g.beginPath();
    g.arc(26, 26, 16, 0, Math.PI * 2);
    g.fill();
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      g.beginPath();
      g.arc(26 + Math.cos(a) * 17, 26 + Math.sin(a) * 17, 6.5, 0, Math.PI * 2);
      g.fill();
    }
    tex.refresh();
  }

  /**
   * A police officer's arm reaching up from below: a navy sleeve with gold
   * buttons on the cuff, and an open hand cupped to lift the doughnut. The
   * top of the palm, where the doughnut sits, is at (80, 64).
   */
  private makeCopArm(): void {
    const tex = this.textures.createCanvas("cop-arm", 160, 300);
    if (!tex) return;
    const g = tex.getContext();
    const skin = "#f5c7a0";
    const skinLine = "#b9785a";
    g.lineJoin = "round";
    g.lineCap = "round";

    // Sleeve, with a shaded side and a crease.
    g.fillStyle = "#1d3576";
    g.beginPath();
    g.moveTo(40, 128);
    g.lineTo(120, 128);
    g.lineTo(130, 300);
    g.lineTo(30, 300);
    g.closePath();
    g.fill();
    g.fillStyle = "#16295c";
    g.beginPath();
    g.moveTo(100, 128);
    g.lineTo(120, 128);
    g.lineTo(130, 300);
    g.lineTo(106, 300);
    g.closePath();
    g.fill();
    g.strokeStyle = "#2c4a96";
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(62, 170);
    g.quadraticCurveTo(70, 200, 60, 240);
    g.stroke();

    // Wrist and cupped hand: thumb on the left, fingers curling up on the right.
    const finger = (x0: number, y0: number, x1: number, y1: number, w: number) => {
      g.lineWidth = w + 4;
      g.strokeStyle = skinLine;
      g.beginPath();
      g.moveTo(x0, y0);
      g.lineTo(x1, y1);
      g.stroke();
      g.lineWidth = w;
      g.strokeStyle = skin;
      g.stroke();
    };
    g.fillStyle = skin;
    g.strokeStyle = skinLine;
    g.lineWidth = 3;
    g.fillRect(58, 100, 44, 32);
    g.beginPath();
    g.ellipse(80, 86, 50, 24, 0, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    finger(38, 86, 26, 58, 15);
    finger(112, 84, 122, 50, 14);
    finger(122, 88, 134, 58, 13);
    finger(128, 94, 142, 70, 12);
    // The palm's rim over the finger roots, so the cup reads cleanly.
    g.fillStyle = skin;
    g.beginPath();
    g.ellipse(80, 88, 46, 18, 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = "#e0a57f";
    g.lineWidth = 2;
    g.beginPath();
    g.ellipse(80, 80, 30, 8, 0, 0.2, Math.PI - 0.2);
    g.stroke();

    // Cuff with three gold buttons.
    g.fillStyle = "#122250";
    g.fillRect(36, 118, 88, 26);
    for (const bx of [56, 80, 104]) {
      g.beginPath();
      g.arc(bx, 131, 7, 0, Math.PI * 2);
      g.fillStyle = "#b8860b";
      g.fill();
      g.beginPath();
      g.arc(bx, 131, 5, 0, Math.PI * 2);
      g.fillStyle = "#f5c542";
      g.fill();
      g.beginPath();
      g.arc(bx - 1.8, 129, 1.6, 0, Math.PI * 2);
      g.fillStyle = "#fff6cf";
      g.fill();
    }
    tex.refresh();
  }

  /** A sugar sprinkle: a white capsule with a highlight, tinted in use. */
  private makePill(): void {
    const tex = this.textures.createCanvas("pill", 22, 9);
    if (!tex) return;
    const g = tex.getContext();
    g.fillStyle = "#ffffff";
    g.beginPath();
    g.roundRect(0.5, 0.5, 21, 8, 4);
    g.fill();
    g.fillStyle = "rgba(0,0,0,0.12)";
    g.beginPath();
    g.roundRect(2, 5, 18, 3, 1.5);
    g.fill();
    tex.refresh();
  }

  /**
   * Pixel sunglasses, the kind that drop onto a face in a meme, with a
   * rainbow shimmer across the lenses. Each frame shifts the rainbow and the
   * glint along, and the level cycles through them.
   */
  private makeShades(): void {
    const cell = 2;
    const cols = 22;
    const rows = 6;
    // Lens shape per row: [first column, last column] of the left lens.
    const lens: [number, number][] = [
      [1, 9],
      [1, 9],
      [1, 9],
      [2, 8],
      [3, 7],
    ];
    for (let f = 0; f < SHADES_FRAMES; f++) {
      const tex = this.textures.createCanvas(`shades-${f}`, cols * cell, rows * cell);
      if (!tex) continue;
      const g = tex.getContext();
      const px = (c: number, r: number, color: string) => {
        g.fillStyle = color;
        g.fillRect(c * cell, r * cell, cell, cell);
      };
      // The top bar and the bridge.
      for (let c = 0; c < cols; c++) px(c, 0, "#111111");
      for (const offset of [0, 11]) {
        lens.forEach(([a, b], r) => {
          for (let c = a; c <= b; c++) {
            const col = c + offset;
            const edge = c === a || c === b || r === lens.length - 1;
            if (edge) {
              px(col, r + 1, "#111111");
              continue;
            }
            // Rainbow, darkened like a tinted lens, sliding along each frame.
            const hue = ((col * 16 + r * 22 - (f * 360) / SHADES_FRAMES) % 360 + 360) % 360;
            px(col, r + 1, `hsl(${hue} 85% 38%)`);
          }
        });
      }
      // A white glint sweeping across both lenses.
      const glint = Math.round((f / SHADES_FRAMES) * (cols + 6)) - 3;
      for (let r = 1; r < 4; r++) {
        const c = glint - r;
        const inLens = [0, 11].some((o) => c - o > lens[r - 1][0] && c - o < lens[r - 1][1]);
        if (inLens) px(c, r + 1, "#ffffff");
      }
      tex.refresh();
    }
  }

  /** A white four-pointed glint, and a soft round glow, both tinted in use. */
  private makeGlitter(): void {
    const star = this.textures.createCanvas("glitter", 16, 16);
    if (star) {
      drawStar(star.getContext(), 8, 8, 7.5);
      star.refresh();
    }
    const glow = this.textures.createCanvas("glow", 48, 48);
    if (glow) {
      const g = glow.getContext();
      const grad = g.createRadialGradient(24, 24, 0, 24, 24, 24);
      grad.addColorStop(0, "rgba(255,255,255,0.9)");
      grad.addColorStop(0.4, "rgba(255,255,255,0.35)");
      grad.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = grad;
      g.fillRect(0, 0, 48, 48);
      glow.refresh();
    }
  }

  private makeSprinkle(): void {
    const g = this.add.graphics();
    g.fillStyle(0xffffff);
    g.fillRoundedRect(0, 0, 8, 3, 1.5);
    g.generateTexture("sprinkle", 8, 3);
    g.destroy();
  }

  private makeCrumb(): void {
    const g = this.add.graphics();
    g.fillStyle(COLORS.dough);
    g.fillCircle(4, 4, 4);
    g.generateTexture("crumb", 8, 8);
    g.destroy();
  }
}
