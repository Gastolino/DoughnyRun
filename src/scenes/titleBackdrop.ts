import Phaser from "phaser";
import { DOUGHNUT, VIEW } from "../logic/tuning";
import type { ToppingId } from "../logic/toppings";
import { EYES_OFFSET } from "./BootScene";

// The title screen's backdrop: bands of wavy glazed level stacked back to
// the horizon, each smaller and paler than the one in front, scrolling
// slowly, with Doughnys rolling along them both ways and hopping now and
// then.

interface Row {
  scale: number;
  top: number;
  wave: number;
  amp: number;
  sprite: Phaser.GameObjects.TileSprite;
  drift: number;
  riders: Rider[];
}

interface Rider {
  parts: Phaser.GameObjects.Image[];
  x: number;
  dir: 1 | -1;
  speed: number;
  hop: number;
  hopAt: number;
}

const SKY_TOP = "#ffd6e7";
const SKY_HORIZON = "#fff3f8";
const GLAZES = ["#fff6fa", "#ffc6e0", "#d9c2ff", "#c7f0dc", "#fff0b8", "#ffd9c2"];
const TOPPINGS: ToppingId[] = ["plain", "glaze", "rainbow", "marshmallow"];
const HORIZON = 190;

/** Mixes a colour towards the sky's, for rows far away. */
function hazed(hex: string, haze: number): string {
  const c = parseInt(hex.slice(1), 16);
  const sky = 0xfff3f8;
  const mix = (shift: number) =>
    Math.round(((c >> shift) & 255) * (1 - haze) + ((sky >> shift) & 255) * haze);
  return `rgb(${mix(16)},${mix(8)},${mix(0)})`;
}

function makeRowTexture(scene: Phaser.Scene, key: string, scale: number, glaze: string, haze: number): { wave: number; amp: number; width: number } {
  const wave = Math.round(340 * scale);
  const amp = 34 * scale;
  const width = wave * Math.ceil((VIEW.width + wave) / wave);
  const height = Math.ceil(VIEW.height - HORIZON + 80);
  if (!scene.textures.exists(key)) {
    const tex = scene.textures.createCanvas(key, width, height);
    if (tex) {
      const g = tex.getContext();
      const top = (px: number) => 4 + (amp * (1 + Math.cos((2 * Math.PI * px) / wave))) / 2;
      // Dough, then a glaze band whose lower edge waves along it.
      g.beginPath();
      g.moveTo(0, height);
      for (let px = 0; px <= width; px += 2) g.lineTo(px, top(px));
      g.lineTo(width, height);
      g.closePath();
      g.fillStyle = hazed("#dca062", haze);
      g.fill();
      const band = 16 * scale;
      g.beginPath();
      for (let px = 0; px <= width; px += 2) g.lineTo(px, top(px));
      for (let px = width; px >= 0; px -= 2) {
        g.lineTo(px, top(px) + band + 5 * scale * Math.sin((px / (36 * scale)) * Math.PI * 2));
      }
      g.closePath();
      g.fillStyle = hazed(glaze, haze);
      g.fill();
      tex.refresh();
    }
  }
  return { wave, amp, width };
}

export function drawTitleBackdrop(scene: Phaser.Scene): void {
  // The sky, paler towards the horizon.
  const sky = "title-sky";
  if (!scene.textures.exists(sky)) {
    const tex = scene.textures.createCanvas(sky, 8, VIEW.height);
    if (tex) {
      const g = tex.getContext();
      const grad = g.createLinearGradient(0, 0, 0, VIEW.height);
      grad.addColorStop(0, SKY_TOP);
      grad.addColorStop(HORIZON / VIEW.height, SKY_HORIZON);
      grad.addColorStop(1, SKY_HORIZON);
      g.fillStyle = grad;
      g.fillRect(0, 0, 8, VIEW.height);
      tex.refresh();
    }
  }
  scene.add.image(0, 0, sky).setOrigin(0, 0).setDisplaySize(VIEW.width, VIEW.height).setDepth(-10);

  const scales = [1, 0.74, 0.55, 0.41, 0.3, 0.22];
  const rows: Row[] = scales.map((scale, k) => {
    const haze = (1 - scale) * 0.6;
    const { wave, amp } = makeRowTexture(scene, `title-row-${k}`, scale, GLAZES[k % GLAZES.length], haze);
    // Rows nearer the viewer sit lower on the screen.
    const top = HORIZON + (VIEW.height - 110 - HORIZON) * scale ** 1.35;
    const depth = (scales.length - k) * 3;
    const sprite = scene.add
      .tileSprite(0, top, VIEW.width, VIEW.height - top + 4, `title-row-${k}`)
      .setOrigin(0, 0)
      .setDepth(depth);
    sprite.tilePositionX = k * 97;
    const riders: Rider[] = [];
    const count = k === 0 ? 2 : 3;
    for (let i = 0; i < count; i++) {
      const dir: 1 | -1 = (i + k) % 2 === 0 ? 1 : -1;
      const topping = TOPPINGS[(i + k) % TOPPINGS.length];
      const parts = [
        scene.add.image(0, 0, `doughnut-back-${topping}`),
        scene.add.image(0, 0, `doughnut-front-${topping}`),
        scene.add.image(0, 0, "doughnut-eyes"),
      ].map((p) => p.setScale(scale).setDepth(depth + 1).setFlipX(dir < 0));
      if (haze > 0.05) parts.forEach((p) => p.setAlpha(1 - haze * 0.6));
      riders.push({
        parts,
        x: ((i + 0.3 + k * 0.17) / count) * VIEW.width,
        dir,
        speed: (90 + ((i * 53 + k * 31) % 70)) * scale,
        hop: 0,
        hopAt: 1 + ((i * 7 + k * 3) % 5) * 0.7,
      });
    }
    return { scale, top, wave, amp, sprite, drift: (k % 2 === 0 ? 14 : -10) * scale, riders };
  });

  let last = 0;
  const animate = (time: number) => {
    const dt = last ? Math.min(0.05, (time - last) / 1000) : 0;
    last = time;
    for (const row of rows) {
      row.sprite.tilePositionX += row.drift * dt;
      const surface = (x: number) =>
        row.top + 4 + (row.amp * (1 + Math.cos((2 * Math.PI * (x + row.sprite.tilePositionX)) / row.wave))) / 2;
      for (const r of row.riders) {
        r.x += r.dir * r.speed * dt;
        // Round the screen and back on at the other side.
        const margin = 60 * row.scale;
        if (r.x > VIEW.width + margin) r.x = -margin;
        if (r.x < -margin) r.x = VIEW.width + margin;
        r.hopAt -= dt;
        if (r.hopAt <= 0 && r.hop === 0) r.hop = 0.0001;
        let lift = 0;
        if (r.hop > 0) {
          r.hop += dt / 0.7;
          lift = Math.sin(Math.min(1, r.hop) * Math.PI) * 120 * row.scale;
          if (r.hop >= 1) {
            r.hop = 0;
            r.hopAt = 1.5 + Math.random() * 3;
          }
        }
        const y = surface(r.x) - DOUGHNUT.outerRadius * row.scale - lift;
        r.parts[0].setPosition(r.x, y);
        r.parts[1].setPosition(r.x, y);
        r.parts[2].setPosition(r.x + EYES_OFFSET.x * row.scale * r.dir, y + EYES_OFFSET.y * row.scale);
      }
    }
  };
  scene.events.on(Phaser.Scenes.Events.UPDATE, animate);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.events.off(Phaser.Scenes.Events.UPDATE, animate));
}
