import Phaser from "phaser";
import { DOUGHNUT } from "../logic/tuning";
import { COLORS, css } from "./palette";

// Draws the greybox textures at start-up, so the game needs no image files.
//
// The doughnut stands on edge with its hole facing the direction of travel,
// seen in three-quarter view as a tall ring. It is cut into a back half,
// drawn behind sausages, and a front half, drawn in front of them, so that a
// sausage appears to pass through the hole. The eyes are a separate image, so
// that the sprinkles can roll around the ring beneath them.

/** Half-width of the ring as drawn; the hitbox in tuning.ts is narrower. */
export const ART_HALF_WIDTH = 32;
const ART_HOLE_HALF_WIDTH = 12;
const PAD = 4;

export class BootScene extends Phaser.Scene {
  constructor() {
    super("boot");
  }

  create(): void {
    this.makeDoughnutHalf("doughnut-back", "back");
    this.makeDoughnutHalf("doughnut-front", "front");
    this.makeEyes();
    this.makeCrumb();
    this.makeSprinkle();
    this.scene.start("level");
  }

  private makeDoughnutHalf(key: string, half: "back" | "front"): void {
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
    ctx.fillStyle = css(COLORS.icing);
    ctx.fill("evenodd");

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
