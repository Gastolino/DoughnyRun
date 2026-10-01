import Phaser from "phaser";
import { CAMPAIGN, WORLDS, worldLevels } from "../levels/index";
import type { CampaignLevel } from "../levels/index";
import { medalFor, medalTargets } from "../logic/medals";
import { VIEW } from "../logic/tuning";
import { bestScore, isFinished, isUnlocked } from "../progress";
import { sound } from "../sound";
import { h, overlay } from "../ui";
import { EYES_OFFSET } from "./BootScene";
import { addSkySprinkles, drawBackdrop } from "./draw";
import { READABLE_FONT, TITLE_FONT } from "./fonts";
import type { PlayRequest } from "./LevelScene";
import { COLORS, SPRINKLE_COLORS } from "./palette";
import { showRainbow } from "./rainbowText";

// A world's map: a path winding over its scenery, with a stop for each
// level: sprinkles over the doughnut hills in Sugar Land, taxi yellow along
// the avenue in the city. Finished levels show their medal, levels not yet
// open wear a padlock, and the boss waits at the end. Doughny stands at the
// chosen stop; tap a stop, or use the arrow keys and Enter, to play.

const STOPS: Record<number, readonly { x: number; y: number }[]> = {
  1: [
    { x: 130, y: 420 },
    { x: 310, y: 330 },
    { x: 490, y: 405 },
    { x: 670, y: 300 },
    { x: 850, y: 205 },
    // The bonus stops, back along the top of the map past the boss.
    { x: 650, y: 175 },
    { x: 450, y: 195 },
  ],
  // Along the avenue, block by block.
  2: [
    { x: 170, y: 420 },
    { x: 480, y: 350 },
    { x: 790, y: 280 },
  ],
};

// Sprinkles for the sugar land's path; taxi yellow and crosswalk white for the city's.
const PATH_COLORS: Record<number, readonly number[]> = { 1: SPRINKLE_COLORS, 2: [0xffcc1a, 0xffffff] };

export interface MapRequest {
  world?: number;
}

const MARKER = 0.62;

// Platform glaze per topping, and the outline for its number.
const TOPPING_GLAZE: Record<string, { fill: number; rim: number; ink: string }> = {
  plain: { fill: 0xff9cc8, rim: 0xfff6fa, ink: "#c2477e" },
  glaze: { fill: 0x7a4a2a, rim: 0xc98a4a, ink: "#3b2213" },
  rainbow: { fill: 0xfff3e6, rim: 0xffd23f, ink: "#e0588f" },
  marshmallow: { fill: 0xd9c2ff, rim: 0xffffff, ink: "#7a55c8" },
};

export class MapScene extends Phaser.Scene {
  private world = 1;
  private levels: CampaignLevel[] = [];
  private stops: readonly { x: number; y: number }[] = [];
  /** Position of the chosen level in this world's list. */
  private chosen = 0;
  private marker: Phaser.GameObjects.Image[] = [];
  private info!: Phaser.GameObjects.Text;
  private bob = 0;

  constructor() {
    super("map");
  }

  init(request: MapRequest): void {
    this.world = request.world ?? 1;
    this.levels = worldLevels(this.world);
    this.stops = STOPS[this.world] ?? STOPS[1];
  }

  create(): void {
    this.cameras.main.setScroll(0, 0);
    const theme = this.levels[0]?.level.theme ?? "candy";
    if (theme === "candy") addSkySprinkles(this);
    drawBackdrop(this, VIEW.width, theme);
    if (theme === "city") {
      // The avenue along the foot of the map, with its crosswalk dashes.
      // Pavement where the buildings stand, then the road.
      const kerb = VIEW.groundY + 8;
      this.add.rectangle(0, kerb, VIEW.width, 10, 0xc9cbd3).setOrigin(0, 0).setDepth(2);
      this.add.rectangle(0, kerb + 10, VIEW.width, VIEW.height - kerb - 10, 0x3a3c46).setOrigin(0, 0).setDepth(2);
      for (let x = 20; x < VIEW.width; x += 90) this.add.rectangle(x, VIEW.height - 8, 44, 5, 0xf4f4f4).setOrigin(0, 0).setDepth(2);
    }
    const info = WORLDS.find((w) => w.id === this.world);
    showRainbow(this, VIEW.width / 2, 52, `World ${this.world}`, 34, 50, true, "bubbly");
    this.add
      .text(VIEW.width / 2, 92, info?.name ?? "", { fontFamily: READABLE_FONT, fontSize: "20px", color: COLORS.text, stroke: "#ffffff", strokeThickness: 5 })
      .setOrigin(0.5);

    this.drawPath();
    this.stops.slice(0, this.levels.length).forEach((p, i) => this.drawStop(p, i));

    // Doughny waits at the first level still to finish, or the last open one.
    const open = this.levels.map((_, i) => this.open(i));
    const firstUnfinished = this.levels.findIndex((c, i) => open[i] && bestScore(c.id) === 0);
    this.chosen = Math.max(0, firstUnfinished >= 0 ? firstUnfinished : open.lastIndexOf(true));
    const topping = this.levels[this.chosen].level.topping;
    this.marker = [
      this.add.image(0, 0, `doughnut-back-${topping}`).setScale(MARKER),
      this.add.image(0, 0, `doughnut-front-${topping}`).setScale(MARKER),
      this.add.image(0, 0, "doughnut-eyes").setScale(MARKER),
    ].map((o) => o.setDepth(30));

    this.info = this.add
      .text(VIEW.width / 2, VIEW.height - 34, "", {
        fontFamily: READABLE_FONT,
        fontSize: "20px",
        color: COLORS.text,
        align: "center",
        stroke: "#ffffff",
        strokeThickness: 5,
      })
      .setOrigin(0.5)
      .setDepth(40);
    this.choose(this.chosen, false);

    const kb = this.input.keyboard;
    kb?.on("keydown-LEFT", () => this.step(-1));
    kb?.on("keydown-RIGHT", () => this.step(1));
    kb?.on("keydown-ENTER", () => this.play(this.chosen));
    kb?.on("keydown-SPACE", () => this.play(this.chosen));
    kb?.on("keydown-ESC", () => this.scene.start("menu"));

    // The way to the neighbouring worlds, once they are open.
    const nextWorld = WORLDS.find((w) => w.id === this.world + 1);
    const prevWorld = WORLDS.find((w) => w.id === this.world - 1);
    const worldButtons: HTMLElement[] = [];
    if (prevWorld) {
      worldButtons.push(
        h("button", { type: "button", onclick: () => this.scene.start("map", { world: prevWorld.id }) }, `← World ${prevWorld.id}`),
      );
    }
    if (nextWorld && (nextWorld.opensAfter === null || isFinished(nextWorld.opensAfter))) {
      worldButtons.push(
        h("button", { type: "button", onclick: () => this.scene.start("map", { world: nextWorld.id }) }, `World ${nextWorld.id} →`),
      );
    }
    overlay(
      "level-ui",
      h("button", { type: "button", class: "back-button", onclick: () => this.scene.start("menu") }, "Title"),
      h("div", { class: "world-buttons" }, ...worldButtons),
    );
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => document.getElementById("level-ui")?.remove());
  }

  update(_time: number, deltaMs: number): void {
    this.bob += deltaMs / 1000;
    const p = this.stops[this.chosen];
    const x = this.marker[0].getData("x") ?? p.x;
    // Standing on the platform, with a little hop.
    const y = (this.marker[0].getData("y") ?? p.y) - 30 - Math.abs(Math.sin(this.bob * 3)) * 8;
    this.marker[0].setPosition(x, y);
    this.marker[1].setPosition(x, y);
    this.marker[2].setPosition(x + EYES_OFFSET.x * MARKER, y + EYES_OFFSET.y * MARKER);
  }

  /** Candy sprinkles laid along a smooth curve through the stops. */
  private drawPath(): void {
    const n = this.levels.length;
    const points = this.stops.slice(0, n).map((p) => new Phaser.Math.Vector2(p.x, p.y));
    const colors = PATH_COLORS[this.world] ?? SPRINKLE_COLORS;
    const curve = new Phaser.Curves.Spline(points);
    const length = curve.getLength();
    const count = Math.floor(length / 20);
    for (let i = 0; i <= count; i++) {
      const t = i / count;
      const p = curve.getPointAt(t);
      const tangent = curve.getTangentAt(t);
      // Dimmer past the last open stop.
      const segment = Math.min(n - 1, Math.floor(t * (n - 1) + 0.0001) + 1);
      const lit = this.open(segment);
      this.add
        .image(p.x, p.y, "pill")
        .setRotation(Math.atan2(tangent.y, tangent.x) + (i % 2 ? 0.5 : -0.5))
        .setTint(colors[i % colors.length])
        .setAlpha(lit ? 1 : 0.35)
        .setScale(0.8)
        .setDepth(6);
    }
  }

  private drawStop(p: { x: number; y: number }, i: number): void {
    const c = this.levels[i];
    const open = this.open(i);
    const boss = Boolean(c.level.chaser);
    const alpha = open ? 1 : 0.45;
    // A round platform glazed in the level's topping, with its number below.
    const glaze = TOPPING_GLAZE[c.level.topping] ?? TOPPING_GLAZE.plain;
    this.add.ellipse(p.x, p.y + 8, 112, 40, 0xdca062).setDepth(8).setAlpha(alpha);
    this.add.ellipse(p.x, p.y, 112, 36, glaze.fill).setStrokeStyle(3, glaze.rim).setDepth(9).setAlpha(alpha);
    this.add
      .text(p.x, p.y + 44, c.id, { fontFamily: TITLE_FONT, fontSize: "22px", color: "#ffffff", stroke: glaze.ink, strokeThickness: 5 })
      .setOrigin(0.5)
      .setDepth(12)
      .setAlpha(alpha);
    if (boss) {
      // The dentures wait behind their stop.
      this.add.image(p.x + 50, p.y - 6, "denture-lower").setOrigin(150 / 160, 1).setScale(0.5).setDepth(7).setAlpha(alpha);
      this.add
        .image(p.x - 20, p.y - 40, "denture-upper")
        .setOrigin(14 / 160, 100 / 124)
        .setScale(0.5)
        .setRotation(-0.25)
        .setDepth(7)
        .setAlpha(alpha);
    }
    if (!open) this.add.image(p.x + 44, p.y - 24, "padlock").setScale(0.8).setDepth(13);
    const best = bestScore(c.id);
    const medal = best > 0 ? medalFor(c.level, best) : null;
    if (medal) this.add.image(p.x + 48, p.y - 24, `medal-${medal}`).setScale(0.42).setDepth(13);

    // The whole stop answers a tap.
    const hit = this.add.zone(p.x, p.y - 20, 130, 120).setInteractive({ useHandCursor: open });
    hit.on("pointerdown", () => {
      if (this.chosen === i) this.play(i);
      else this.choose(i, true);
    });
  }

  private step(by: number): void {
    const next = this.chosen + by;
    if (next < 0 || next >= this.levels.length) return;
    this.choose(next, true);
  }

  private choose(i: number, animate: boolean): void {
    this.chosen = i;
    const p = this.stops[i];
    const c = this.levels[i];
    if (animate) {
      sound.click();
      const from = { x: this.marker[0].getData("x") ?? p.x, y: this.marker[0].getData("y") ?? p.y };
      this.tweens.addCounter({
        from: 0,
        to: 1,
        duration: 260,
        ease: "Sine.easeInOut",
        onUpdate: (tw) => {
          const t = tw.getValue() ?? 1;
          this.marker[0].setData("x", from.x + (p.x - from.x) * t);
          this.marker[0].setData("y", from.y + (p.y - from.y) * t - Math.sin(t * Math.PI) * 40);
        },
      });
    } else {
      this.marker[0].setData("x", p.x).setData("y", p.y);
    }
    const best = bestScore(c.id);
    const t = medalTargets(c.level);
    const verb = window.matchMedia("(pointer: coarse)").matches ? "Tap again" : "Press Enter";
    const kind = c.level.chaser ? "  (boss)" : c.id.startsWith("B-") ? "  (bonus)" : "";
    const lines = [`${c.id}  ${c.level.name}${kind}`];
    if (!this.open(i)) lines.push(`Finish ${c.requires} to open`);
    else {
      lines.push(`${best ? `Best ${best}` : "Not finished yet"}  ·  Silver ${t.silver}  ·  Gold ${t.gold}  ·  ${verb} to play`);
    }
    this.info.setText(lines.join("\n"));
  }

  /** Whether the level at this position in the world is open. */
  private open(i: number): boolean {
    return isUnlocked(CAMPAIGN.indexOf(this.levels[i]));
  }

  private play(i: number): void {
    if (!this.open(i)) return;
    const index = CAMPAIGN.indexOf(this.levels[i]);
    const request: PlayRequest = { level: CAMPAIGN[index].level, campaignIndex: index, returnTo: "map" };
    this.scene.start("level", request);
  }
}
