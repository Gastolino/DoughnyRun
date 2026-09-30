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
    this.makeDentures();
    this.makeMedals();
    this.makePadlock();
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
    const icing = { plain: COLORS.icing, glaze: COLORS.glaze, rainbow: COLORS.vanilla, marshmallow: COLORS.marshmallow }[topping];
    ctx.fillStyle = css(icing);
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

  /**
   * The boss: wind-up chattering dentures facing right, in two jaws so the
   * mouth can open. The upper jaw wears a police hat and has googly eyes
   * under angry brows; it hinges at (14, 100). The lower jaw stands on two
   * orange feet, whose soles are at its bottom edge, with its front teeth at
   * the right edge. A brass key winds it from behind.
   */
  private makeDentures(): void {
    const gum = "#ff7fa6";
    const gumLine = "#b8456e";
    const tooth = (g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, down: boolean) => {
      g.beginPath();
      if (down) {
        g.moveTo(x, y);
        g.lineTo(x + w, y);
        g.lineTo(x + w, y + h - w / 2);
        g.arc(x + w / 2, y + h - w / 2, w / 2, 0, Math.PI);
      } else {
        g.moveTo(x, y + h);
        g.lineTo(x + w, y + h);
        g.lineTo(x + w, y + w / 2);
        g.arc(x + w / 2, y + w / 2, w / 2, 0, Math.PI, true);
      }
      g.closePath();
      g.fillStyle = "#fffdf4";
      g.fill();
      g.strokeStyle = "#c9bfa6";
      g.lineWidth = 2;
      g.stroke();
    };

    const upper = this.textures.createCanvas("denture-upper", 160, 124);
    if (upper) {
      const g = upper.getContext();
      g.lineJoin = "round";
      // Teeth hang below the gum, the front one biggest.
      [
        [44, 16],
        [62, 17],
        [81, 18],
        [101, 19],
        [122, 24],
      ].forEach(([x, w]) => tooth(g, x, 92, w, 26, true));
      // Gum, bulging to a rounded front.
      g.beginPath();
      g.moveTo(8, 104);
      g.lineTo(8, 70);
      g.quadraticCurveTo(10, 58, 30, 58);
      g.lineTo(122, 58);
      g.quadraticCurveTo(156, 60, 152, 88);
      g.quadraticCurveTo(150, 102, 134, 102);
      g.lineTo(30, 104);
      g.closePath();
      g.fillStyle = gum;
      g.fill();
      g.strokeStyle = gumLine;
      g.lineWidth = 3;
      g.stroke();
      // Googly eyes with angry brows.
      for (const [ex, ey] of [
        [92, 78],
        [118, 76],
      ]) {
        g.beginPath();
        g.arc(ex, ey, 10, 0, Math.PI * 2);
        g.fillStyle = "#ffffff";
        g.fill();
        g.strokeStyle = "#3a2330";
        g.lineWidth = 2;
        g.stroke();
        g.beginPath();
        g.arc(ex + 3, ey + 2, 4.5, 0, Math.PI * 2);
        g.fillStyle = "#1d1320";
        g.fill();
      }
      g.strokeStyle = "#3a2330";
      g.lineWidth = 4;
      g.lineCap = "round";
      g.beginPath();
      g.moveTo(80, 63);
      g.lineTo(100, 70);
      g.moveTo(128, 64);
      g.lineTo(110, 69);
      g.stroke();
      // Police hat: crown, band, visor jutting forward, gold badge.
      g.fillStyle = "#1d3576";
      g.beginPath();
      g.moveTo(34, 50);
      g.quadraticCurveTo(26, 14, 72, 8);
      g.quadraticCurveTo(122, 4, 128, 30);
      g.lineTo(122, 50);
      g.closePath();
      g.fill();
      g.fillStyle = "#11204a";
      g.fillRect(34, 40, 90, 12);
      g.fillStyle = "#15151c";
      g.beginPath();
      g.ellipse(118, 54, 34, 7, -0.08, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "#f5c542";
      g.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const r = i % 2 === 0 ? 10 : 4.5;
        g.lineTo(80 + Math.cos(a) * r, 26 + Math.sin(a) * r);
      }
      g.closePath();
      g.fill();
      g.strokeStyle = "#b8860b";
      g.lineWidth = 1.5;
      g.stroke();
      upper.refresh();
    }

    const lower = this.textures.createCanvas("denture-lower", 160, 84);
    if (lower) {
      const g = lower.getContext();
      g.lineJoin = "round";
      // Orange feet under the jaw.
      g.fillStyle = "#ff9a3c";
      g.strokeStyle = "#c2621a";
      g.lineWidth = 2.5;
      for (const fx of [46, 104]) {
        g.beginPath();
        g.ellipse(fx, 72, 20, 10, 0, 0, Math.PI * 2);
        g.fill();
        g.stroke();
      }
      [
        [44, 16],
        [62, 17],
        [81, 18],
        [101, 19],
        [122, 22],
      ].forEach(([x, w]) => tooth(g, x, 2, w, 24, false));
      g.beginPath();
      g.moveTo(8, 16);
      g.lineTo(134, 18);
      g.quadraticCurveTo(152, 20, 150, 38);
      g.quadraticCurveTo(146, 58, 120, 60);
      g.lineTo(30, 60);
      g.quadraticCurveTo(8, 60, 8, 40);
      g.closePath();
      g.fillStyle = gum;
      g.fill();
      g.strokeStyle = gumLine;
      g.lineWidth = 3;
      g.stroke();
      lower.refresh();
    }

    const key = this.textures.createCanvas("windup-key", 70, 60);
    if (key) {
      const g = key.getContext();
      g.fillStyle = "#d4a53a";
      g.strokeStyle = "#8a6414";
      g.lineWidth = 2.5;
      g.fillRect(40, 25, 30, 10);
      g.strokeRect(40, 25, 30, 10);
      for (const [cx, cy] of [
        [22, 16],
        [22, 44],
      ]) {
        g.beginPath();
        g.ellipse(cx, cy, 18, 14, 0, 0, Math.PI * 2);
        g.fill();
        g.stroke();
        g.beginPath();
        g.ellipse(cx, cy, 7, 5, 0, 0, Math.PI * 2);
        g.fillStyle = "#8a6414";
        g.fill();
        g.fillStyle = "#d4a53a";
      }
      g.fillRect(34, 22, 10, 16);
      key.refresh();
    }
  }

  /** Gold, silver and bronze medals on a striped ribbon, 72 by 100. */
  private makeMedals(): void {
    const metals = {
      gold: ["#ffd84a", "#c9951a", "#fff3b0"],
      silver: ["#e3e8ef", "#8e99a8", "#ffffff"],
      bronze: ["#e39a5b", "#9a5a26", "#ffd2ad"],
    } as const;
    for (const [name, [face, rim, shine]] of Object.entries(metals)) {
      const tex = this.textures.createCanvas(`medal-${name}`, 72, 100);
      if (!tex) continue;
      const g = tex.getContext();
      // Ribbon: two tails in candy stripes.
      for (const [x0, x1] of [
        [14, 34],
        [38, 58],
      ]) {
        g.fillStyle = "#ff7eb6";
        g.beginPath();
        g.moveTo(x0, 0);
        g.lineTo(x1, 0);
        g.lineTo(x1 - 2, 46);
        g.lineTo(x0 + 2, 46);
        g.closePath();
        g.fill();
        g.fillStyle = "#7ec8ff";
        g.fillRect(x0 + 8, 0, 5, 46);
      }
      g.beginPath();
      g.arc(36, 64, 30, 0, Math.PI * 2);
      g.fillStyle = rim;
      g.fill();
      g.beginPath();
      g.arc(36, 64, 24, 0, Math.PI * 2);
      g.fillStyle = face;
      g.fill();
      // A doughnut stamped in the middle, and a glint.
      g.beginPath();
      g.arc(36, 64, 13, 0, Math.PI * 2);
      g.arc(36, 64, 5, 0, Math.PI * 2, true);
      g.fillStyle = rim;
      g.fill("evenodd");
      g.beginPath();
      g.ellipse(26, 52, 7, 3.5, -0.6, 0, Math.PI * 2);
      g.fillStyle = shine;
      g.fill();
      tex.refresh();
    }
  }

  /** A padlock for levels not yet open, 44 by 54. */
  private makePadlock(): void {
    const tex = this.textures.createCanvas("padlock", 44, 54);
    if (!tex) return;
    const g = tex.getContext();
    g.strokeStyle = "#8e99a8";
    g.lineWidth = 6;
    g.beginPath();
    g.arc(22, 22, 11, Math.PI, 0);
    g.lineTo(33, 28);
    g.moveTo(11, 22);
    g.lineTo(11, 28);
    g.stroke();
    g.fillStyle = "#f5c542";
    g.strokeStyle = "#b8860b";
    g.lineWidth = 2.5;
    g.beginPath();
    g.roundRect(4, 26, 36, 26, 6);
    g.fill();
    g.stroke();
    g.fillStyle = "#6b4a1a";
    g.beginPath();
    g.arc(22, 36, 4, 0, Math.PI * 2);
    g.fill();
    g.fillRect(20.5, 37, 3, 8);
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
