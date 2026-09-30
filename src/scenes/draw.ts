import Phaser from "phaser";
import { VIEW } from "../logic/tuning";
import type { LevelData, Sausage } from "../logic/types";
import { COLORS } from "./palette";

// Drawing shared by the level and the editor. Phaser redraws Graphics shapes
// from scratch every frame, and each curve costs a hundred points; on a
// mid-range phone the sausages alone took about 14 ms a frame. So every curved
// shape is drawn once into a texture and shown as an image.

export const DEPTH = { ground: 3, trail: 4, back: 5, sausage: 10, front: 15, fx: 20, hud: 100 } as const;

export function bake(
  scene: Phaser.Scene,
  key: string,
  width: number,
  height: number,
  draw: (g: Phaser.GameObjects.Graphics) => void,
): string {
  if (!scene.textures.exists(key)) {
    const g = scene.make.graphics({}, false);
    draw(g);
    g.generateTexture(key, width, height);
    g.destroy();
  }
  return key;
}

export function drawBackdrop(scene: Phaser.Scene, length: number): Phaser.GameObjects.GameObject[] {
  const far = bake(scene, "hill-far", 420, 260, (g) => g.fillStyle(COLORS.hillFar).fillEllipse(210, 130, 420, 260));
  const near = bake(scene, "hill-near", 360, 200, (g) => g.fillStyle(COLORS.hillNear).fillEllipse(180, 100, 360, 200));
  const out: Phaser.GameObjects.GameObject[] = [];
  for (let x = -200; x < length * 0.2 + VIEW.width * 2; x += 260) {
    out.push(scene.add.image(x, VIEW.groundY - 40, far).setScrollFactor(0.2, 0.3));
  }
  for (let x = -100; x < length * 0.45 + VIEW.width * 2; x += 340) {
    out.push(scene.add.image(x, VIEW.groundY + 10, near).setScrollFactor(0.45, 0.6));
  }
  return out;
}

export function drawGround(scene: Phaser.Scene, level: LevelData): Phaser.GameObjects.GameObject[] {
  // Behind the whole doughnut, whose two halves straddle the sausages; in
  // between them, the ground would hide only one half of its bottom.
  const g = scene.add.graphics().setDepth(DEPTH.ground);
  const cap = bake(scene, "ground-cap", 12, 12, (c) => c.fillStyle(COLORS.groundTop).fillCircle(6, 6, 6));
  const out: Phaser.GameObjects.GameObject[] = [g];
  // Deep enough to fill the view when the camera looks down from a height.
  const depth = VIEW.height * 2;
  for (const seg of level.ground) {
    if (seg.width <= 0) continue;
    g.fillStyle(COLORS.ground);
    g.fillRect(seg.x, VIEW.groundY, seg.width, depth);
    // The icing strip starts exactly where the doughnut stands, with
    // rounded ends from the cap image.
    g.fillStyle(COLORS.groundTop);
    g.fillRect(seg.x + 6, VIEW.groundY, Math.max(0, seg.width - 12), 12);
    out.push(scene.add.image(seg.x + 6, VIEW.groundY + 6, cap).setDepth(DEPTH.ground));
    out.push(scene.add.image(seg.x + seg.width - 6, VIEW.groundY + 6, cap).setDepth(DEPTH.ground));
  }
  return out;
}

export function drawSausage(scene: Phaser.Scene, s: Sausage): Phaser.GameObjects.Image {
  const r = s.thickness / 2;
  const key = bake(scene, `sausage-${s.length}x${s.thickness}`, s.length, s.thickness, (g) => {
    g.fillStyle(COLORS.sausageShade);
    g.fillRoundedRect(0, 0, s.length, s.thickness, r);
    g.fillStyle(COLORS.sausage);
    g.fillRoundedRect(1, 0, s.length - 2, s.thickness - 3, r - 1);
    g.fillStyle(COLORS.sausageShine);
    g.fillRoundedRect(r, 3, Math.max(0, s.length - 2 * r), 3, 1.5);
    // Ketchup and mayo drizzled along the top in two offset waves.
    const drizzle = (color: number, phase: number) => {
      g.lineStyle(2.5, color);
      g.beginPath();
      const start = r * 0.7;
      for (let px = start; px <= s.length - start; px += 2) {
        const py = s.thickness * 0.42 + Math.sin(px / 4.5 + phase) * s.thickness * 0.2;
        if (px === start) g.moveTo(px, py);
        else g.lineTo(px, py);
      }
      g.strokePath();
    };
    drizzle(COLORS.ketchup, 0);
    drizzle(COLORS.mayo, Math.PI);
  });
  return scene.add
    .image(s.x, s.y - r, key)
    .setOrigin(0, 0)
    .setDepth(DEPTH.sausage);
}

export function drawFinish(scene: Phaser.Scene, length: number): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics().setDepth(DEPTH.sausage - 1);
  g.fillStyle(0x6b4a3a);
  g.fillRect(length, VIEW.groundY - 160, 6, 160);
  g.fillStyle(COLORS.icing);
  g.fillTriangle(length + 6, VIEW.groundY - 160, length + 60, VIEW.groundY - 140, length + 6, VIEW.groundY - 120);
  return g;
}
