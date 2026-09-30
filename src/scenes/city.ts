import Phaser from "phaser";
import { VEHICLES } from "../logic/terrain";
import { VIEW } from "../logic/tuning";
import type { LevelData, Street, Vehicle } from "../logic/types";
import { DEPTH } from "./draw";

// World 2's look: New York downtown at dusk. An evening sky, two rows of
// buildings sliding past at different speeds, a concrete sidewalk that turns
// to asphalt and a crosswalk where the street crosses, and across each street
// a police car with its lights going. Parked cabs and hot dog carts stand on
// the pavement. Every texture is drawn here once, the first time it is used.

const SKY = ["#2e2f6b", "#6a4c8f", "#ff9eb5"] as const;

function canvasTexture(scene: Phaser.Scene, key: string, w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): string {
  if (!scene.textures.exists(key)) {
    const tex = scene.textures.createCanvas(key, w, h);
    if (tex) {
      draw(tex.getContext());
      tex.refresh();
    }
  }
  return key;
}

/** A small repeatable random sequence, so every visit draws the same city. */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

/** A row of buildings, drawn to tile sideways without a seam. */
function makeSkyline(scene: Phaser.Scene, key: string, near: boolean): string {
  const W = 1280;
  const H = near ? 330 : 420;
  return canvasTexture(scene, key, W, H, (g) => {
    const rand = seeded(near ? 77 : 13);
    const palette = near
      ? ["#8c4a3c", "#a8674f", "#6d5a7a", "#c9a27e", "#7b8394", "#94553f"]
      : ["#4a3f78", "#5a4d8a", "#3f3a6e", "#66579a"];
    let x = 0;
    while (x < W) {
      const w = Math.min(W - x, near ? 110 + rand() * 90 : 70 + rand() * 90);
      const h = near ? 170 + rand() * 150 : 180 + rand() * 230;
      const top = H - h;
      g.fillStyle = palette[Math.floor(rand() * palette.length)];
      g.fillRect(x, top, w, h);
      if (!near && rand() < 0.25) {
        // A spire, in the spirit of the famous ones.
        g.beginPath();
        g.moveTo(x + w * 0.3, top);
        g.lineTo(x + w * 0.5, top - 60 - rand() * 50);
        g.lineTo(x + w * 0.7, top);
        g.fill();
      }
      if (near) {
        // A cornice along the top, and a shop awning at street level.
        g.fillStyle = "rgba(255,255,255,0.18)";
        g.fillRect(x, top, w, 8);
        g.fillStyle = ["#2f8f5b", "#c43d4b", "#2f5fa8", "#d98a1c"][Math.floor(rand() * 4)];
        g.fillRect(x + 8, H - 58, w - 16, 14);
        g.fillStyle = "rgba(255,255,255,0.6)";
        for (let sx = x + 8; sx < x + w - 16; sx += 16) g.fillRect(sx, H - 58, 8, 14);
      }
      // Windows, some lit.
      const cols = Math.max(2, Math.floor(w / (near ? 26 : 16)));
      const rows = Math.floor((h - (near ? 80 : 20)) / (near ? 34 : 20));
      for (let c = 0; c < cols; c++) {
        for (let r = 0; r < rows; r++) {
          const lit = rand() < (near ? 0.45 : 0.35);
          g.fillStyle = lit ? (rand() < 0.5 ? "#ffe39a" : "#ffd0e0") : near ? "rgba(20,20,40,0.45)" : "rgba(20,20,50,0.5)";
          const ww = near ? 12 : 6;
          const wh = near ? 18 : 9;
          g.fillRect(x + 10 + c * ((w - 20) / cols), top + 16 + r * (near ? 34 : 20), ww, wh);
        }
      }
      if (near && rand() < 0.5) {
        // A fire escape zigzagging down the front.
        g.strokeStyle = "rgba(30,30,40,0.7)";
        g.lineWidth = 2;
        const fx = x + w * 0.55;
        for (let fy = top + 30; fy < H - 90; fy += 34) {
          g.strokeRect(fx, fy, 34, 3);
          g.beginPath();
          g.moveTo(fx, fy);
          g.lineTo(fx + 34, fy + 34);
          g.stroke();
        }
      }
      x += w + (near ? 4 : 2);
    }
  });
}

/** The evening sky and the two rows of buildings, fixed to the camera. */
export function drawCityBackdrop(scene: Phaser.Scene): Phaser.GameObjects.GameObject[] {
  const sky = canvasTexture(scene, "city-sky", 16, VIEW.height, (g) => {
    const grad = g.createLinearGradient(0, 0, 0, VIEW.height);
    grad.addColorStop(0, SKY[0]);
    grad.addColorStop(0.55, SKY[1]);
    grad.addColorStop(1, SKY[2]);
    g.fillStyle = grad;
    g.fillRect(0, 0, 16, VIEW.height);
  });
  const skyImage = scene.add.image(0, 0, sky).setOrigin(0, 0).setDisplaySize(VIEW.width, VIEW.height).setScrollFactor(0).setDepth(-3);
  const layers = [
    { key: makeSkyline(scene, "skyline-far", false), f: 0.15, fy: 0.8, depth: -2, height: 420 },
    { key: makeSkyline(scene, "skyline-near", true), f: 0.45, fy: 1, depth: -1, height: 330 },
  ].map((l) => ({
    ...l,
    sprite: scene.add
      .tileSprite(0, 0, VIEW.width, l.height, l.key)
      .setOrigin(0, 1)
      .setScrollFactor(0)
      .setDepth(l.depth),
  }));
  const place = () => {
    const cam = scene.cameras.main;
    for (const l of layers) {
      l.sprite.tilePositionX = cam.scrollX * l.f;
      // The near row stands on the street; the far row sits higher, peeping
      // over it, and rises and falls a little less with the camera.
      const base = l.depth === -2 ? VIEW.groundY - 40 : VIEW.groundY + 10;
      l.sprite.setY(base - cam.scrollY * l.fy);
    }
  };
  place();
  scene.events.on(Phaser.Scenes.Events.UPDATE, place);
  const stop = () => scene.events.off(Phaser.Scenes.Events.UPDATE, place);
  skyImage.once(Phaser.GameObjects.Events.DESTROY, stop);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, stop);
  return [skyImage, ...layers.map((l) => l.sprite)];
}

const SIDEWALK = "sidewalk-tile";
const STREET = "street-tile";

function makeGroundTiles(scene: Phaser.Scene): void {
  canvasTexture(scene, SIDEWALK, 96, 40, (g) => {
    g.fillStyle = "#c9cbd3";
    g.fillRect(0, 0, 96, 16);
    g.fillStyle = "#e6e8ee";
    g.fillRect(0, 0, 96, 3);
    g.fillStyle = "#9da1ae";
    g.fillRect(0, 16, 96, 12);
    g.fillStyle = "#7d8190";
    g.fillRect(0, 28, 96, 12);
    g.fillStyle = "#a7abb8";
    g.fillRect(94, 0, 2, 16);
  });
  canvasTexture(scene, STREET, 96, 40, (g) => {
    g.fillStyle = "#3a3c46";
    g.fillRect(0, 0, 96, 40);
    g.fillStyle = "#4a4d59";
    g.fillRect(0, 0, 96, 3);
    // Crosswalk bars, seen edge on as dashes along the road.
    g.fillStyle = "#f4f4f4";
    g.fillRect(8, 2, 40, 6);
  });
}

/** Pavement for each stretch of ground, and asphalt where a street crosses it. */
export function drawCityGround(scene: Phaser.Scene, level: LevelData): Phaser.GameObjects.GameObject[] {
  makeGroundTiles(scene);
  const out: Phaser.GameObjects.GameObject[] = [];
  const depth = VIEW.height * 2;
  for (const seg of level.ground) {
    if (seg.width <= 0) continue;
    out.push(scene.add.rectangle(seg.x, VIEW.groundY, seg.width, depth, 0x5a5e6c).setOrigin(0, 0).setDepth(DEPTH.ground));
    // Split the stretch where streets cross it.
    const cuts = new Set<number>([seg.x, seg.x + seg.width]);
    for (const st of level.streets) {
      for (const edge of [st.x, st.x + st.width]) if (edge > seg.x && edge < seg.x + seg.width) cuts.add(edge);
    }
    const xs = [...cuts].sort((a, b) => a - b);
    for (let i = 0; i + 1 < xs.length; i++) {
      const a = xs[i];
      const b = xs[i + 1];
      const street = level.streets.some((st) => a >= st.x && b <= st.x + st.width);
      out.push(
        scene.add
          .tileSprite(a, VIEW.groundY, b - a, 40, street ? STREET : SIDEWALK)
          .setOrigin(0, 0)
          .setDepth(DEPTH.ground),
      );
    }
  }
  return out;
}

/** A yellow cab, its top matching the shape the simulation gives it. */
function makeCab(scene: Phaser.Scene): string {
  const { width: W, trunk, roof, hood } = VEHICLES.cab;
  const H = roof + 4;
  return canvasTexture(scene, "cab", W, H, (g) => {
    const y = (rise: number) => H - rise;
    g.lineJoin = "round";
    // Cabin: up the rear window, along the roof, down the windscreen.
    g.fillStyle = "#ffcc1a";
    g.beginPath();
    g.moveTo(0.18 * W, y(trunk));
    g.lineTo(0.36 * W, y(roof));
    g.lineTo(0.64 * W, y(roof));
    g.lineTo(0.8 * W, y(hood));
    g.lineTo(0.8 * W, y(20));
    g.lineTo(0.18 * W, y(20));
    g.closePath();
    g.fill();
    // Windows.
    g.fillStyle = "#9fd4f0";
    g.beginPath();
    g.moveTo(0.23 * W, y(trunk + 4));
    g.lineTo(0.37 * W, y(roof - 8));
    g.lineTo(0.49 * W, y(roof - 8));
    g.lineTo(0.49 * W, y(trunk + 4));
    g.closePath();
    g.fill();
    g.beginPath();
    g.moveTo(0.52 * W, y(trunk + 4));
    g.lineTo(0.52 * W, y(roof - 8));
    g.lineTo(0.63 * W, y(roof - 8));
    g.lineTo(0.75 * W, y(hood + 2));
    g.lineTo(0.75 * W, y(trunk + 4));
    g.closePath();
    g.fill();
    // Body: trunk and hood, with rounded bumpers.
    g.fillStyle = "#ffcc1a";
    g.beginPath();
    g.roundRect(0, y(trunk), W, trunk - 12, 10);
    g.fill();
    g.fillStyle = "#e0a800";
    g.fillRect(0, y(16), W, 5);
    // The checker stripe along the side.
    for (let cx = 6; cx < W - 6; cx += 8) {
      for (let row = 0; row < 2; row++) {
        g.fillStyle = (cx / 8 + row) % 2 < 1 ? "#1b1b1f" : "#ffffff";
        g.fillRect(cx, y(40) + row * 7, 8, 7);
      }
    }
    // Door lettering and lamps.
    g.fillStyle = "#1b1b1f";
    g.font = "bold 13px sans-serif";
    g.fillText("TAXI", 0.44 * W, y(22));
    g.fillStyle = "#ff4d4d";
    g.fillRect(0, y(trunk - 4), 6, 10);
    g.fillStyle = "#fff6c0";
    g.fillRect(W - 6, y(hood - 4), 6, 10);
    // Wheels.
    for (const wx of [0.2 * W, 0.82 * W]) {
      g.beginPath();
      g.arc(wx, H - 14, 15, 0, Math.PI * 2);
      g.fillStyle = "#1b1b1f";
      g.fill();
      g.beginPath();
      g.arc(wx, H - 14, 6, 0, Math.PI * 2);
      g.fillStyle = "#b8bcc6";
      g.fill();
    }
  });
}

/** A steel hot dog cart with a striped front and a sign; its counter is its top. */
function makeCart(scene: Phaser.Scene): string {
  const { width: W, height } = VEHICLES.cart;
  const H = height + 4;
  return canvasTexture(scene, "cart", W, H, (g) => {
    const top = H - height;
    g.fillStyle = "#d9dee6";
    g.fillRect(0, top, W, height - 18);
    g.fillStyle = "#f4f6f9";
    g.fillRect(0, top, W, 6);
    // Red and yellow striped panel with the sign.
    for (let sx = 6; sx < W - 6; sx += 14) {
      g.fillStyle = (sx / 14) % 2 < 1 ? "#e23b3b" : "#ffcf33";
      g.fillRect(sx, top + 14, 14, 44);
    }
    g.fillStyle = "#ffffff";
    g.fillRect(24, top + 24, W - 48, 22);
    g.fillStyle = "#e23b3b";
    g.font = "bold 16px sans-serif";
    g.textAlign = "center";
    g.fillText("HOT DOGS", W / 2, top + 41);
    for (const wx of [30, W - 30]) {
      g.beginPath();
      g.arc(wx, H - 12, 12, 0, Math.PI * 2);
      g.fillStyle = "#2a2a30";
      g.fill();
    }
  });
}

export function drawVehicle(scene: Phaser.Scene, v: Vehicle): Phaser.GameObjects.Image {
  const key = v.kind === "cab" ? makeCab(scene) : makeCart(scene);
  // Just above the ground, below sausages and the doughnut.
  return scene.add.image(v.x, VIEW.groundY + 4, key).setOrigin(0, 1).setDepth(DEPTH.ground + 0.5);
}

function makePoliceCar(scene: Phaser.Scene): string {
  return canvasTexture(scene, "police-car", 200, 84, (g) => {
    g.fillStyle = "#f7f8fb";
    g.beginPath();
    g.moveTo(40, 40);
    g.lineTo(62, 16);
    g.lineTo(140, 16);
    g.lineTo(162, 40);
    g.lineTo(196, 44);
    g.lineTo(196, 68);
    g.lineTo(4, 68);
    g.lineTo(4, 44);
    g.closePath();
    g.fill();
    g.fillStyle = "#1f4fa8";
    g.fillRect(4, 50, 192, 8);
    g.fillStyle = "#9fd4f0";
    g.fillRect(68, 20, 30, 18);
    g.fillRect(104, 20, 30, 18);
    g.fillStyle = "#1f4fa8";
    g.font = "bold 12px sans-serif";
    g.fillText("POLICE", 76, 48);
    g.fillStyle = "#2a2a30";
    g.fillRect(84, 8, 34, 8);
    for (const wx of [40, 160]) {
      g.beginPath();
      g.arc(wx, 70, 12, 0, Math.PI * 2);
      g.fillStyle = "#1b1b1f";
      g.fill();
    }
  });
}

/**
 * Across each street, a police car parked on the far side with its lights
 * flashing red and blue. It sits in the middle distance, so it drifts past
 * more slowly than the pavement.
 */
export function drawPolice(scene: Phaser.Scene, streets: readonly Street[]): Phaser.GameObjects.GameObject[] {
  const key = makePoliceCar(scene);
  const f = 0.7;
  const out: Phaser.GameObjects.GameObject[] = [];
  const lights: Phaser.GameObjects.Image[] = [];
  for (const st of streets) {
    // Placed so it passes the middle of the screen as the doughnut crosses.
    const mid = st.x + st.width / 2;
    const x = VIEW.width * 0.55 + (mid - VIEW.playerScreenX) * f;
    const y = VIEW.groundY - 34;
    const car = scene.add.image(x, y, key).setScale(0.48).setScrollFactor(f, f).setDepth(-0.5);
    const red = scene.add.image(x - 5, y - 18, "glow").setTint(0xff3040).setScale(0.8).setScrollFactor(f, f).setDepth(-0.4);
    const blue = scene.add.image(x + 10, y - 18, "glow").setTint(0x3a7bff).setScale(0.8).setScrollFactor(f, f).setDepth(-0.4);
    red.setBlendMode(Phaser.BlendModes.ADD);
    blue.setBlendMode(Phaser.BlendModes.ADD);
    lights.push(red, blue);
    out.push(car, red, blue);
  }
  const flash = (time: number) => {
    const on = Math.floor(time / 180) % 2 === 0;
    lights.forEach((l, i) => l.setAlpha((i % 2 === 0) === on ? 1 : 0.1));
  };
  scene.events.on(Phaser.Scenes.Events.UPDATE, flash);
  const stop = () => scene.events.off(Phaser.Scenes.Events.UPDATE, flash);
  out[0]?.once(Phaser.GameObjects.Events.DESTROY, stop);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, stop);
  return out;
}
