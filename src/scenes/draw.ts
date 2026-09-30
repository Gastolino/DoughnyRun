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

// ---- Doughnut mountains ------------------------------------------------------
//
// The hills are giant doughnuts sunk into the landscape: only the top of each
// shows, with dough at the rim, drippy glaze, sprinkles and glitter. Each is
// drawn as a whole disc with no hole, and turns as an image. A circle keeps
// its outline as it turns, so the mountain's shape never changes, and since no
// hole is drawn, none can appear when the camera rises or a void opens below.

interface MountainStyle {
  key: string;
  radius: number;
  dough: number;
  doughEdge: number;
  glaze: number;
  glazeShine: number;
  sprinkles: readonly number[];
  seed: number;
}

// Pastel and close to the sky's pink, so that the doughnut, the sausages and
// their sprinkles stay the brightest things on screen.
const NEAR_SPRINKLES = [0xfffafc, 0xb9dcf5, 0xf7eeb0, 0xc3eeb9, 0xd7c6f2, 0xf6c7a4];
const FAR_SPRINKLES = [0xfffafc, 0xdcecf8, 0xfbf5d6, 0xe3f5de, 0xece4f8];

const MOUNTAINS = {
  far: [
    { key: "mtn-far-a", radius: 280, dough: 0xf6dcc2, doughEdge: 0xecc9a6, glaze: 0xf8d3e3, glazeShine: 0xfde8f1, sprinkles: FAR_SPRINKLES, seed: 11 },
    { key: "mtn-far-b", radius: 280, dough: 0xf6dcc2, doughEdge: 0xecc9a6, glaze: 0xece0f5, glazeShine: 0xf7f1fb, sprinkles: FAR_SPRINKLES, seed: 23 },
  ],
  near: [
    { key: "mtn-near-a", radius: 320, dough: 0xf0cda4, doughEdge: 0xe0b584, glaze: 0xf4b4d0, glazeShine: 0xfad3e4, sprinkles: NEAR_SPRINKLES, seed: 37 },
    { key: "mtn-near-b", radius: 320, dough: 0xf0cda4, doughEdge: 0xe0b584, glaze: 0xfbeee2, glazeShine: 0xffffff, sprinkles: NEAR_SPRINKLES, seed: 51 },
  ],
} satisfies Record<string, MountainStyle[]>;

// The glaze's drippy inner edge sits this far in from the rim, as a share of
// the radius. The discs are sunk deep enough that it never rises above the
// bottom of the screen, even where a void in the ground shows what is behind.
const GLAZE_INNER = 0.34;

/** A small repeatable random sequence, so every visit draws the same hills. */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const css = (c: number): string => `#${c.toString(16).padStart(6, "0")}`;

function makeMountain(scene: Phaser.Scene, m: MountainStyle): void {
  if (scene.textures.exists(m.key)) return;
  const size = m.radius * 2 + 4;
  const tex = scene.textures.createCanvas(m.key, size, size);
  const glitterA = scene.textures.createCanvas(`${m.key}-glitter-a`, size, size);
  const glitterB = scene.textures.createCanvas(`${m.key}-glitter-b`, size, size);
  if (!tex || !glitterA || !glitterB) return;
  const ctx = tex.getContext();
  const c = size / 2;
  const R = m.radius;
  const rand = seeded(m.seed);

  // Dough, with a darker rim.
  ctx.beginPath();
  ctx.arc(c, c, R, 0, Math.PI * 2);
  ctx.fillStyle = css(m.doughEdge);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(c, c, R - 6, 0, Math.PI * 2);
  ctx.fillStyle = css(m.dough);
  ctx.fill();

  // Glaze: a band inside the rim whose inner edge drips towards the middle.
  const outer = R - 16;
  const inner = R * GLAZE_INNER;
  ctx.beginPath();
  ctx.arc(c, c, outer, 0, Math.PI * 2);
  const drips = 26;
  for (let i = drips; i >= 0; i--) {
    const a = (i / drips) * Math.PI * 2;
    const next = ((i - 0.5) / drips) * Math.PI * 2;
    const depth = inner - (8 + rand() * 26);
    const ax = c + Math.cos(a) * inner;
    const ay = c + Math.sin(a) * inner;
    if (i === drips) ctx.moveTo(ax, ay);
    else ctx.lineTo(ax, ay);
    // A rounded drip between this point and the next.
    ctx.quadraticCurveTo(c + Math.cos(next) * depth, c + Math.sin(next) * depth, c + Math.cos(a - (Math.PI * 2) / drips) * inner, c + Math.sin(a - (Math.PI * 2) / drips) * inner);
  }
  ctx.closePath();
  ctx.fillStyle = css(m.glaze);
  ctx.fill("evenodd");

  // A soft shine along the glaze.
  ctx.beginPath();
  ctx.arc(c, c, outer - 14, Math.PI * 1.1, Math.PI * 1.45);
  ctx.lineWidth = 7;
  ctx.lineCap = "round";
  ctx.strokeStyle = css(m.glazeShine);
  ctx.stroke();

  // Sprinkles scattered over the glaze.
  for (let i = 0; i < 46; i++) {
    const a = rand() * Math.PI * 2;
    const r = inner + 6 + rand() * (outer - inner - 14);
    ctx.save();
    ctx.translate(c + Math.cos(a) * r, c + Math.sin(a) * r);
    ctx.rotate(rand() * Math.PI);
    ctx.fillStyle = css(m.sprinkles[i % m.sprinkles.length]);
    ctx.beginPath();
    ctx.roundRect(-7, -2, 14, 4, 2);
    ctx.fill();
    ctx.restore();
  }
  tex.refresh();

  // Glitter in two sets that twinkle in turn.
  for (const layer of [glitterA, glitterB]) {
    const g = layer.getContext();
    for (let i = 0; i < 16; i++) {
      const a = rand() * Math.PI * 2;
      const r = inner + rand() * (outer - inner);
      drawStar(g, c + Math.cos(a) * r, c + Math.sin(a) * r, 2.5 + rand() * 3);
    }
    layer.refresh();
  }
}

/** A four-pointed glint. */
export function drawStar(g: CanvasRenderingContext2D, x: number, y: number, r: number, color = "#ffffff"): void {
  g.save();
  g.translate(x, y);
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(0, -r);
  g.quadraticCurveTo(0, 0, r, 0);
  g.quadraticCurveTo(0, 0, 0, r);
  g.quadraticCurveTo(0, 0, -r, 0);
  g.quadraticCurveTo(0, 0, 0, -r);
  g.fill();
  g.restore();
}

export function drawBackdrop(scene: Phaser.Scene, length: number): Phaser.GameObjects.GameObject[] {
  const layers = [
    // Far hills: paler, slower, higher in the sky.
    { styles: MOUNTAINS.far, spacing: 330, centreY: VIEW.groundY + 130, scroll: [0.2, 0.3], speed: 0.035, extent: length * 0.2 },
    { styles: MOUNTAINS.near, spacing: 400, centreY: VIEW.groundY + 235, scroll: [0.45, 0.6], speed: 0.06, extent: length * 0.45 },
  ] as const;
  const out: Phaser.GameObjects.Image[] = [];
  const spinning: { base: Phaser.GameObjects.Image; a: Phaser.GameObjects.Image; b: Phaser.GameObjects.Image; speed: number; phase: number }[] = [];
  layers.forEach((layer) => {
    layer.styles.forEach((m) => makeMountain(scene, m));
    let i = 0;
    for (let x = -200; x < layer.extent + VIEW.width * 2; x += layer.spacing, i++) {
      const m = layer.styles[i % layer.styles.length];
      const at = (o: Phaser.GameObjects.Image) => o.setScrollFactor(layer.scroll[0], layer.scroll[1]);
      const base = at(scene.add.image(x, layer.centreY, m.key));
      const a = at(scene.add.image(x, layer.centreY, `${m.key}-glitter-a`).setBlendMode(Phaser.BlendModes.ADD));
      const b = at(scene.add.image(x, layer.centreY, `${m.key}-glitter-b`).setBlendMode(Phaser.BlendModes.ADD));
      // Neighbours turn at slightly different speeds and in both directions.
      const speed = layer.speed * (i % 2 ? 1 : -0.8) * (0.85 + ((i * 37) % 10) / 30);
      const start = (i * 1.3) % (Math.PI * 2);
      [base, a, b].forEach((o) => o.setRotation(start));
      spinning.push({ base, a, b, speed, phase: i * 0.9 });
      out.push(base, a, b);
    }
  });

  const turn = (time: number, delta: number) => {
    const t = time / 1000;
    for (const sp of spinning) {
      const r = sp.base.rotation + sp.speed * (delta / 1000);
      sp.base.setRotation(r);
      sp.a.setRotation(r).setAlpha(0.15 + 0.55 * Math.max(0, Math.sin(t * 1.7 + sp.phase)));
      sp.b.setRotation(r).setAlpha(0.15 + 0.55 * Math.max(0, Math.sin(t * 1.7 + sp.phase + Math.PI)));
    }
  };
  scene.events.on(Phaser.Scenes.Events.UPDATE, turn);
  // Stop turning when the hills are cleared away (an editor redraw) or the scene ends.
  const stop = () => scene.events.off(Phaser.Scenes.Events.UPDATE, turn);
  out[0]?.once(Phaser.GameObjects.Events.DESTROY, stop);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, stop);
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
