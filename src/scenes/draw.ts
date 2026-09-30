import Phaser from "phaser";
import { VIEW } from "../logic/tuning";
import { hillsRise, surfaceAt } from "../logic/terrain";
import type { Boost, LevelData, Ramp, Sausage } from "../logic/types";
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

  // Glaze: a band inside the rim. Its outer edge wanders in soft waves, the
  // way poured glaze stops short of the rim; its inner edge drips inwards.
  const outer = R - 18;
  const inner = R * GLAZE_INNER;
  const wavePhase = rand() * Math.PI * 2;
  const edge = (a: number): number => outer + 6 * Math.sin(a * 17 + wavePhase) + 3 * Math.sin(a * 7 - wavePhase);
  ctx.beginPath();
  for (let i = 0; i <= 360; i++) {
    const a = (i / 360) * Math.PI * 2;
    const x = c + Math.cos(a) * edge(a);
    const y = c + Math.sin(a) * edge(a);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
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

// ---- The ground ---------------------------------------------------------------
//
// Each stretch of ground is a slab of plain dough with vanilla glaze poured
// over the top, like the side of a doughnut: the top the doughnut rolls on is
// flat, and the glaze's lower edge runs in even waves, the same treatment as
// the doughnut mountains, wrapping round the corners and down the cliff faces.

const DOUGH_COLOR = 0xdca062;
const GLAZE = { fill: "#fff6fa", shadow: "#efc6d8", shine: "#ffffff" };
const GLAZE_DEPTH = 40;
const GLAZE_SIDE = 12;
/** Distance between wave crests along the glaze's edge. */
const GLAZE_WAVE = 34;
/** Widest piece of glaze drawn as one texture. */
const GLAZE_PIECE = 2000;

/**
 * The glaze for one stretch of ground, drawn to its exact width. Where hills
 * raise the surface, the texture also holds the dough above ground level, and
 * the glaze follows the waves; at each end it drips down from the top.
 */
function makeGlaze(
  scene: Phaser.Scene,
  x: number,
  width: number,
  rise: (wx: number) => number,
  riseKey: string,
  drips: { left: boolean; right: boolean },
): string {
  const key = `glaze-seg:${x}:${width}:${riseKey}:${drips.left}:${drips.right}`;
  if (scene.textures.exists(key)) return key;
  let maxRise = 0;
  for (let wx = x; wx <= x + width; wx += 2) maxRise = Math.max(maxRise, rise(wx));
  maxRise = Math.ceil(maxRise);
  const w = width + GLAZE_SIDE * 2;
  const tex = scene.textures.createCanvas(key, Math.ceil(w), maxRise + GLAZE_DEPTH);
  if (!tex) return key;
  const g = tex.getContext();
  const left = GLAZE_SIDE;
  const right = GLAZE_SIDE + width;
  // Canvas y of the surface at canvas x; ground level is y = maxRise.
  const top = (px: number): number => maxRise - rise(Math.min(x + width, Math.max(x, px - left + x)));
  // Even waves, phased by world position so neighbouring slabs line up.
  const edge = (px: number): number => top(px) + 14 + 5 * Math.sin(((px - left + x) / GLAZE_WAVE) * Math.PI * 2);
  const sideDrop = 24;

  if (maxRise > 0) {
    g.beginPath();
    g.moveTo(left, maxRise + 1);
    for (let px = left; px <= right; px += 2) g.lineTo(px, top(px));
    g.lineTo(right, top(right));
    g.lineTo(right, maxRise + 1);
    g.closePath();
    g.fillStyle = css(DOUGH_COLOR);
    g.fill();
  }

  const outline = (dy: number) => {
    const tl = top(left);
    const tr = top(right);
    g.beginPath();
    g.moveTo(left, tl);
    for (let px = left + 2; px < right; px += 2) g.lineTo(px, top(px));
    g.lineTo(right, tr);
    if (drips.right) {
      g.quadraticCurveTo(right + GLAZE_SIDE * 0.6, tr, right + GLAZE_SIDE * 0.55, tr + 8);
      g.lineTo(right + GLAZE_SIDE * 0.5, tr + sideDrop + dy - 6);
      g.quadraticCurveTo(right + GLAZE_SIDE * 0.25, tr + sideDrop + dy + 2, right - 2, tr + sideDrop + dy - 6);
    } else {
      g.lineTo(right, edge(right) + dy);
    }
    for (let px = right - 4; px > left + 4; px -= 2) g.lineTo(px, edge(px) + dy);
    if (drips.left) {
      g.lineTo(left + 2, tl + sideDrop + dy - 6);
      g.quadraticCurveTo(left - GLAZE_SIDE * 0.25, tl + sideDrop + dy + 2, left - GLAZE_SIDE * 0.5, tl + sideDrop + dy - 6);
      g.lineTo(left - GLAZE_SIDE * 0.55, tl + 8);
      g.quadraticCurveTo(left - GLAZE_SIDE * 0.6, tl, left, tl);
    } else {
      g.lineTo(left, edge(left) + dy);
    }
    g.closePath();
  };
  // A pink shadow under the waves, then the glaze, then a shine along the top.
  outline(2.5);
  g.fillStyle = GLAZE.shadow;
  g.fill();
  outline(0);
  g.fillStyle = GLAZE.fill;
  g.fill();
  g.strokeStyle = GLAZE.shine;
  g.lineWidth = 2;
  g.lineCap = "round";
  g.beginPath();
  const shineFrom = drips.left ? left + 6 : left;
  const shineTo = drips.right ? right - 6 : right;
  g.moveTo(shineFrom, top(shineFrom) + 3.5);
  for (let px = shineFrom + 2; px <= shineTo; px += 2) g.lineTo(px, top(px) + 3.5);
  g.stroke();
  tex.refresh();
  return key;
}

export function drawGround(scene: Phaser.Scene, level: LevelData): Phaser.GameObjects.GameObject[] {
  // Behind the whole doughnut, whose two halves straddle the sausages; in
  // between them, the ground would hide only one half of its bottom.
  const out: Phaser.GameObjects.GameObject[] = [];
  // Deep enough to fill the view when the camera looks down from a height.
  const depth = VIEW.height * 2;
  for (const seg of level.ground) {
    if (seg.width <= 0) continue;
    const body = scene.add
      .rectangle(seg.x, VIEW.groundY, seg.width, depth, DOUGH_COLOR)
      .setOrigin(0, 0)
      .setDepth(DEPTH.ground);
    const hills = level.hills.filter((h) => h.x < seg.x + seg.width && h.x + h.width > seg.x);
    const rise = (wx: number): number => {
      const h = hills.find((hh) => wx >= hh.x && wx <= hh.x + hh.width);
      return h ? hillsRise(h, wx) : 0;
    };
    const riseKey = hills.map((h) => `${h.x},${h.width},${h.height},${h.waves}`).join(";");
    out.push(body);
    // In pieces, since some phones cannot hold a texture much wider than
    // 4096 pixels; only the slab's real ends drip.
    const pieces = Math.ceil(seg.width / GLAZE_PIECE);
    for (let i = 0; i < pieces; i++) {
      const step = Math.ceil(seg.width / pieces);
      const px = seg.x + step * i;
      const pw = Math.min(step, seg.x + seg.width - px);
      const key = makeGlaze(scene, px, pw, rise, riseKey, { left: i === 0, right: i === pieces - 1 });
      const lift = scene.textures.get(key).getSourceImage().height - GLAZE_DEPTH;
      const glaze = scene.add
        .image(px - GLAZE_SIDE, VIEW.groundY - lift, key)
        .setOrigin(0, 0)
        .setDepth(DEPTH.ground);
      // Each slab's glaze is drawn to measure; drop it with the slab so an
      // editor redraw does not pile up textures.
      glaze.once(Phaser.GameObjects.Events.DESTROY, () => {
        if (scene.textures.exists(key)) scene.textures.remove(key);
      });
      out.push(glaze);
    }
  }
  for (const r of level.ramps) out.push(...drawRamp(scene, level, r));
  for (const b of level.boosts) out.push(...drawBoost(scene, level, b));
  return out;
}

// ---- Ramps ---------------------------------------------------------------------
//
// A ramp is a wedge of dough whose top curves up to the lip, glazed like the
// ground: the glaze follows the curve with the same even waves underneath and
// drips down the lip's face.

const RAMP_PAD = 4;

function makeRamp(scene: Phaser.Scene, r: Ramp): string {
  const key = `ramp:${r.width}x${r.height}`;
  if (scene.textures.exists(key)) return key;
  const w = r.width + GLAZE_SIDE;
  const hgt = r.height + RAMP_PAD;
  const tex = scene.textures.createCanvas(key, Math.ceil(w), Math.ceil(hgt));
  if (!tex) return key;
  const g = tex.getContext();
  const top = (px: number): number => RAMP_PAD + r.height - r.height * (px / r.width) ** 2;
  const foot = RAMP_PAD + r.height;

  // Dough, with a darker lip face.
  g.beginPath();
  g.moveTo(0, foot);
  for (let px = 0; px <= r.width; px += 2) g.lineTo(px, top(px));
  g.lineTo(r.width, foot);
  g.closePath();
  g.fillStyle = css(DOUGH_COLOR);
  g.fill();
  g.fillStyle = "#c98a4a";
  g.fillRect(r.width - 5, RAMP_PAD, 5, r.height);

  // Glaze: along the curve, then down the face of the lip.
  const band = (px: number): number => Math.min(foot, top(px) + 13 + 4 * Math.sin((px / GLAZE_WAVE) * Math.PI * 2));
  const faceDrop = Math.min(r.height, 26);
  const outline = (dy: number) => {
    g.beginPath();
    g.moveTo(0, foot);
    for (let px = 0; px <= r.width; px += 2) g.lineTo(px, top(px));
    g.quadraticCurveTo(r.width + GLAZE_SIDE * 0.6, RAMP_PAD, r.width + GLAZE_SIDE * 0.5, RAMP_PAD + 8);
    g.lineTo(r.width + GLAZE_SIDE * 0.45, RAMP_PAD + faceDrop + dy - 6);
    g.quadraticCurveTo(r.width + GLAZE_SIDE * 0.2, RAMP_PAD + faceDrop + dy + 2, r.width - 3, RAMP_PAD + faceDrop + dy - 6);
    for (let px = r.width - 4; px >= 0; px -= 2) g.lineTo(px, band(px) + dy);
    g.closePath();
  };
  outline(2.5);
  g.fillStyle = GLAZE.shadow;
  g.fill();
  outline(0);
  g.fillStyle = GLAZE.fill;
  g.fill();
  g.strokeStyle = GLAZE.shine;
  g.lineWidth = 2;
  g.lineCap = "round";
  g.beginPath();
  for (let px = 8; px <= r.width - 6; px += 2) {
    if (px === 8) g.moveTo(px, top(px) + 3.5);
    else g.lineTo(px, top(px) + 3.5);
  }
  g.stroke();
  tex.refresh();
  return key;
}

function drawRamp(scene: Phaser.Scene, level: LevelData, r: Ramp): Phaser.GameObjects.GameObject[] {
  const out: Phaser.GameObjects.GameObject[] = [];
  // Where the ramp overhangs a void, its dough runs down out of sight.
  const depth = VIEW.height * 2;
  let x = r.x;
  const end = r.x + r.width;
  while (x < end) {
    const seg = level.ground.find((g) => x >= g.x && x < g.x + g.width);
    if (seg) {
      x = seg.x + seg.width;
      continue;
    }
    const next = level.ground.find((g) => g.x > x);
    const stop = Math.min(end, next ? next.x : end);
    out.push(scene.add.rectangle(x, VIEW.groundY, stop - x, depth, DOUGH_COLOR).setOrigin(0, 0).setDepth(DEPTH.ground));
    x = stop;
  }
  const key = makeRamp(scene, r);
  out.push(
    scene.add
      .image(r.x, VIEW.groundY - r.height - RAMP_PAD, key)
      .setOrigin(0, 0)
      .setDepth(DEPTH.ground),
  );
  return out;
}

// ---- Speed pads ----------------------------------------------------------------
//
// A candy strip set into the glaze, with chevrons that run forwards.

const CHEVRON = 26;

function drawBoost(scene: Phaser.Scene, level: LevelData, b: Boost): Phaser.GameObjects.GameObject[] {
  const tile = bake(scene, "boost-chevron", CHEVRON, 14, (g) => {
    g.fillStyle(0xff4fa3);
    g.fillRect(0, 0, CHEVRON, 14);
    g.fillStyle(0xfff27e);
    g.fillTriangle(4, 1, 13, 7, 4, 13);
    g.fillStyle(0xff4fa3);
    g.fillTriangle(4, 4, 9, 7, 4, 10);
    g.fillStyle(0x7ec8ff);
    g.fillTriangle(14, 1, 23, 7, 14, 13);
    g.fillStyle(0xff4fa3);
    g.fillTriangle(14, 4, 19, 7, 14, 10);
  });
  const y = (surfaceAt(level, b.x + b.width / 2) ?? VIEW.groundY) + 1;
  const rim = scene.add.rectangle(b.x - 3, y - 9, b.width + 6, 18, 0xffffff).setOrigin(0, 0).setDepth(DEPTH.ground);
  rim.setStrokeStyle(2, 0xff9cc8);
  const strip = scene.add.tileSprite(b.x, y - 7, b.width, 14, tile).setOrigin(0, 0).setDepth(DEPTH.ground);
  scene.tweens.add({ targets: strip, tilePositionX: -CHEVRON, duration: 260, repeat: -1 });
  strip.once(Phaser.GameObjects.Events.DESTROY, () => scene.tweens.killTweensOf(strip));
  return [rim, strip];
}

/**
 * Candy sprinkles drifting down the sky behind the mountains, fixed to the
 * screen so that they fall steadily whatever the camera does.
 */
export function addSkySprinkles(scene: Phaser.Scene): Phaser.GameObjects.Particles.ParticleEmitter {
  const sky = scene.add
    .particles(0, -20, "pill", {
      x: { min: -40, max: VIEW.width + 40 },
      speedY: { min: 18, max: 36 },
      speedX: { min: -6, max: 6 },
      rotate: { start: 0, end: 200 },
      scale: { min: 0.4, max: 0.7 },
      alpha: 0.55,
      lifespan: 24000,
      frequency: 320,
      tint: [0xff9cc8, 0x9fd4ff, 0xfff08a, 0xa8ecb0, 0xcdb4ff, 0xffc49a, 0xffffff],
    })
    .setScrollFactor(0)
    .setDepth(-1);
  // Start with a sky already full of sprinkles rather than an empty one.
  sky.fastForward(16000);
  return sky;
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
