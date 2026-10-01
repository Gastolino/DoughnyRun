import Phaser from "phaser";
import { surfaceAt } from "../logic/terrain";
import { VIEW } from "../logic/tuning";
import type { LevelData } from "../logic/types";
import { sound } from "../sound";
import { DEPTH } from "./draw";

// The boss of a chase level: wind-up dentures in a police hat, drawn from
// the simulation's chaserX (the front teeth), plus a meter at the top of the
// screen showing how close they are. They chatter faster as they close in.

const METER = { x: VIEW.width / 2 - 150, y: 20, width: 300, height: 12 } as const;

export class DentureChaser {
  private upper: Phaser.GameObjects.Image;
  private lower: Phaser.GameObjects.Image;
  private key: Phaser.GameObjects.Image;
  private meter: Phaser.GameObjects.Graphics;
  private icon: Phaser.GameObjects.Image;
  private goal: Phaser.GameObjects.Image[];
  private chatter = 0;

  constructor(
    scene: Phaser.Scene,
    private level: LevelData,
  ) {
    // In front of the sausages they run past, behind the doughnut.
    const depth = DEPTH.sausage + 1;
    this.key = scene.add.image(0, 0, "windup-key").setOrigin(1, 0.5).setDepth(depth);
    this.lower = scene.add.image(0, 0, "denture-lower").setOrigin(150 / 160, 1).setDepth(depth);
    this.upper = scene.add.image(0, 0, "denture-upper").setOrigin(14 / 160, 100 / 124).setDepth(depth);
    this.meter = scene.add.graphics().setScrollFactor(0).setDepth(DEPTH.hud);
    this.icon = scene.add.image(0, METER.y + METER.height / 2, "denture-upper").setScale(0.24).setScrollFactor(0).setDepth(DEPTH.hud + 1);
    // The doughnut at the meter's far end: both halves of the ring.
    this.goal = ["back", "front"].map((half) =>
      scene.add
        .image(METER.x + METER.width + 16, METER.y + METER.height / 2, `doughnut-${half}-${level.topping}`)
        .setScale(0.3)
        .setScrollFactor(0)
        .setDepth(DEPTH.hud + 1),
    );
  }

  /** Places the dentures with their front teeth at chaserX and redraws the meter. */
  update(chaserX: number, doughnutX: number, deltaMs: number, running: boolean): void {
    const chaser = this.level.chaser;
    if (!chaser) return;
    const gap = doughnutX - chaserX;
    const closeness = Phaser.Math.Clamp(1 - gap / chaser.gap, 0, 1);
    // Chatter speeds up as the gap closes.
    if (running) {
      const before = Math.floor(this.chatter / Math.PI);
      this.chatter += (deltaMs / 1000) * (10 + closeness * 16);
      // A clack each time the teeth meet, louder as they close in.
      if (Math.floor(this.chatter / Math.PI) !== before) sound.clack(0.04 + 0.22 * closeness);
    }
    const open = 0.08 + 0.34 * Math.abs(Math.sin(this.chatter));
    const hop = Math.abs(Math.sin(this.chatter)) * 5;
    // Over a void they carry on at ground level, as if skittering across.
    const ground = surfaceAt(this.level, chaserX - 70) ?? VIEW.groundY;
    const y = ground - hop;
    this.lower.setPosition(chaserX, y);
    this.upper.setPosition(chaserX - 136, y - 72).setRotation(-open);
    this.key.setPosition(chaserX - 150, y - 50).setScale(Math.cos(this.chatter * 0.6), 1);

    const g = this.meter;
    g.clear();
    g.fillStyle(0xffffff, 0.85);
    g.fillRoundedRect(METER.x - 3, METER.y - 3, METER.width + 6, METER.height + 6, 8);
    const danger = closeness > 0.7;
    const pulse = danger ? 0.6 + 0.4 * Math.abs(Math.sin(this.chatter * 1.5)) : 1;
    g.fillStyle(danger ? 0xe0344f : 0xff7fa6, pulse);
    g.fillRoundedRect(METER.x, METER.y, Math.max(METER.height, METER.width * closeness), METER.height, 6);
    this.icon.setX(METER.x + METER.width * closeness);
  }

  destroy(): void {
    [this.upper, this.lower, this.key, this.meter, this.icon, ...this.goal].forEach((o) => o.destroy());
  }
}
