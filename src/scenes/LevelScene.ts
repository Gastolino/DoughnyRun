import Phaser from "phaser";
import { GREYBOX } from "../levels/greybox";
import { createRunner, PLAIN, stepRunner } from "../logic/runner";
import type { DeathCause, RunnerEvent, RunnerState } from "../logic/runner";
import type { Grade } from "../logic/tuning";
import { DOUGHNUT, TUNING, VIEW } from "../logic/tuning";
import { solveLevel, STEPS_PER_DECISION } from "../logic/solver";
import type { DecisionInput } from "../logic/solver";
import type { LevelData, Sausage } from "../logic/types";
import { COLORS } from "./palette";

const DEPTH = { back: 5, sausage: 10, front: 15, fx: 20, hud: 100 } as const;

const GRADE_TEXT: Record<Grade, { label: string; color: string }> = {
  perfect: { label: "PERFECT!", color: "#d6246e" },
  great: { label: "Great", color: "#b0428a" },
  good: { label: "Good", color: "#7a4a70" },
  sloppy: { label: "Sloppy", color: "#8a7a80" },
};

const DEATH_TEXT: Record<DeathCause, string> = {
  sausage: "Bonk! The sausage hit the dough.",
  fell: "Down the hole you go.",
  wall: "Splat against the cliff.",
};

// Draws the pure simulation in src/logic and turns keyboard, mouse and touch
// into its input. It never moves the doughnut itself.
export class LevelScene extends Phaser.Scene {
  private level: LevelData = GREYBOX;
  private runner!: RunnerState;
  private accumulator = 0;
  private pressLatch = false;
  private pointerDown = false;
  private deaths = 0;
  private best = 0;
  private showHitboxes = false;
  // With ?demo in the URL, the solver's winning inputs play the level.
  private demoInputs: DecisionInput[] | null = null;
  private stepCount = 0;

  private back!: Phaser.GameObjects.Image;
  private front!: Phaser.GameObjects.Image;
  private sausages: Phaser.GameObjects.Graphics[] = [];
  private debug!: Phaser.GameObjects.Graphics;
  private hud!: Phaser.GameObjects.Text;
  private banner!: Phaser.GameObjects.Text;
  private crumbs!: Phaser.GameObjects.Particles.ParticleEmitter;
  // Sprinkles shed behind the doughnut, thicker in higher gears.
  private trail!: Phaser.GameObjects.Particles.ParticleEmitter;
  private jumpKeys: Phaser.Input.Keyboard.Key[] = [];

  constructor() {
    super("level");
  }

  create(): void {
    this.drawBackdrop();
    this.drawGround();
    this.sausages = this.level.sausages.map((s) => this.drawSausage(s));
    this.drawFinish();

    this.back = this.add.image(0, 0, "doughnut-back").setDepth(DEPTH.back);
    this.front = this.add.image(0, 0, "doughnut-front").setDepth(DEPTH.front);
    this.debug = this.add.graphics().setDepth(DEPTH.fx);
    this.crumbs = this.add
      .particles(0, 0, "crumb", {
        speed: { min: 120, max: 380 },
        angle: { min: 180, max: 360 },
        gravityY: 900,
        lifespan: 900,
        scale: { start: 1, end: 0.3 },
        emitting: false,
      })
      .setDepth(DEPTH.fx);
    this.trail = this.add
      .particles(0, 0, "sprinkle", {
        speedX: { min: -80, max: -20 },
        speedY: { min: -40, max: 40 },
        lifespan: 400,
        rotate: { min: 0, max: 360 },
        alpha: { start: 1, end: 0 },
        tint: [0xff7eb6, 0x7ec8ff, 0xfff27e, 0x9dff7e],
        frequency: -1,
      })
      .setDepth(DEPTH.back - 1);

    this.hud = this.add
      .text(16, 12, "", { fontFamily: "sans-serif", fontSize: "20px", color: COLORS.text })
      .setScrollFactor(0)
      .setDepth(DEPTH.hud);
    this.add
      .text(VIEW.width - 16, 12, "Space / tap: jump (hold for height)   R: restart   H: hitboxes", {
        fontFamily: "sans-serif",
        fontSize: "14px",
        color: COLORS.text,
      })
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(DEPTH.hud);
    this.banner = this.add
      .text(VIEW.width / 2, VIEW.height / 2 - 60, "", {
        fontFamily: "sans-serif",
        fontSize: "28px",
        color: COLORS.text,
        align: "center",
        backgroundColor: "#fff1f7cc",
        padding: { x: 16, y: 10 },
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(DEPTH.hud)
      .setVisible(false);

    this.bindInput();
    if (new URLSearchParams(window.location.search).has("demo")) {
      this.demoInputs = solveLevel(this.level, PLAIN).inputs;
    }
    this.restart();
  }

  update(_time: number, deltaMs: number): void {
    // Cap the frame time so that a stalled tab does not fast-forward the run.
    this.accumulator += Math.min(deltaMs / 1000, 0.1);
    while (this.accumulator >= TUNING.fixedStep) {
      this.accumulator -= TUNING.fixedStep;
      const input = this.demoInputs ? this.demoInput() : { held: this.isHeld(), pressed: this.pressLatch };
      this.pressLatch = false;
      this.stepCount += 1;
      const events = stepRunner(this.runner, input, this.level, PLAIN);
      events.forEach((e) => this.onEvent(e));
    }
    this.render();
  }

  private bindInput(): void {
    const kb = this.input.keyboard;
    if (kb) {
      const K = Phaser.Input.Keyboard.KeyCodes;
      this.jumpKeys = [K.SPACE, K.UP, K.W].map((code) => kb.addKey(code));
      this.jumpKeys.forEach((key) => key.on("down", () => this.onPress()));
      kb.on("keydown-R", () => this.restart());
      kb.on("keydown-H", () => (this.showHitboxes = !this.showHitboxes));
    }
    this.input.on("pointerdown", () => {
      this.pointerDown = true;
      this.onPress();
    });
    this.input.on("pointerup", () => (this.pointerDown = false));
  }

  private demoInput(): { held: boolean; pressed: boolean } {
    const inputs = this.demoInputs ?? [];
    const decision = Math.floor(this.stepCount / STEPS_PER_DECISION);
    const d = inputs[decision] ?? { held: false, pressed: false };
    return { held: d.held, pressed: d.pressed && this.stepCount % STEPS_PER_DECISION === 0 };
  }

  private isHeld(): boolean {
    return this.pointerDown || this.jumpKeys.some((k) => k.isDown);
  }

  private onPress(): void {
    if (this.runner.dead || this.runner.finished) {
      this.restart();
      return;
    }
    this.pressLatch = true;
  }

  private restart(): void {
    this.runner = createRunner(this.level, PLAIN);
    this.accumulator = 0;
    this.stepCount = 0;
    this.pressLatch = false;
    this.banner.setVisible(false);
    this.back.setVisible(true);
    this.front.setVisible(true);
    this.sausages.forEach((g) => g.setAlpha(1));
    this.render();
  }

  private onEvent(e: RunnerEvent): void {
    switch (e.type) {
      case "jump":
      case "airJump":
        this.squash(0.8, 1.2);
        break;
      case "land":
        this.squash(1.25, 0.8);
        break;
      case "grindStart":
        this.sausages[e.index].setAlpha(0.85);
        break;
      case "grindEnd": {
        this.sausages[e.index].setAlpha(0.5);
        const g = GRADE_TEXT[e.grade];
        const chain = e.chain > 1 ? `  x${e.chain} chain` : "";
        this.popText(`${g.label} +${e.points}${chain}`, g.color, e.grade === "perfect");
        break;
      }
      case "skip":
        this.sausages[e.index].setAlpha(0.3);
        this.popText("Skipped: chain lost", GRADE_TEXT.sloppy.color, false);
        break;
      case "die":
        this.deaths += 1;
        this.crumbs.explode(40, this.runner.x, this.runner.y);
        this.cameras.main.shake(200, 0.01);
        this.back.setVisible(false);
        this.front.setVisible(false);
        this.showBanner(`${DEATH_TEXT[e.cause]}\nPress to try again`);
        break;
      case "finish": {
        this.best = Math.max(this.best, this.runner.score);
        const total = this.level.sausages.length;
        this.showBanner(
          `Level clear!\nScore ${this.runner.score}   Best ${this.best}\n` +
            `Threaded ${this.runner.threaded.length}/${total}\nPress to run again`,
        );
        break;
      }
    }
  }

  private render(): void {
    const s = this.runner;
    this.cameras.main.scrollX = s.x - VIEW.playerScreenX;
    this.back.setPosition(s.x, s.y);
    this.front.setPosition(s.x, s.y);

    const gears = TUNING.gears.length;
    const bar = "\u25A0".repeat(s.gear + 1) + "\u25A1".repeat(gears - s.gear - 1);
    const chain = s.chain > 1 ? `   Chain x${s.chain}` : "";
    this.hud.setText(`Score ${s.score}${chain}\nSpeed ${bar}   Deaths ${this.deaths}`);
    this.trail.frequency = s.gear >= 2 ? 120 / s.gear : -1;
    this.trail.setPosition(s.x - 10, s.y);

    this.debug.clear();
    if (this.showHitboxes) this.drawHitboxes();
  }

  private squash(sx: number, sy: number): void {
    const targets = [this.back, this.front];
    this.tweens.killTweensOf(targets);
    targets.forEach((t) => t.setScale(sx, sy));
    this.tweens.add({ targets, scaleX: 1, scaleY: 1, duration: 160, ease: "Quad.easeOut" });
  }

  private popText(text: string, color: string, big: boolean): void {
    // Pinned to the screen, since the camera keeps the doughnut in one place.
    const x = VIEW.playerScreenX;
    const y = this.runner.y - DOUGHNUT.outerRadius - 16;
    const t = this.add
      .text(x, y, text, { fontFamily: "sans-serif", fontSize: big ? "28px" : "20px", color, fontStyle: "bold" })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(DEPTH.fx);
    if (big) this.tweens.add({ targets: t, scale: { from: 1.4, to: 1 }, duration: 180 });
    this.tweens.add({ targets: t, y: y - 50, alpha: 0, delay: 300, duration: 700, onComplete: () => t.destroy() });
  }

  private showBanner(text: string): void {
    this.banner.setText(text).setVisible(true);
  }

  private drawBackdrop(): void {
    const far = this.add.graphics().setScrollFactor(0.2);
    const near = this.add.graphics().setScrollFactor(0.45);
    far.fillStyle(COLORS.hillFar);
    near.fillStyle(COLORS.hillNear);
    for (let x = -200; x < this.level.length * 0.2 + VIEW.width; x += 260) {
      far.fillEllipse(x, VIEW.groundY - 40, 420, 260);
    }
    for (let x = -100; x < this.level.length * 0.45 + VIEW.width; x += 340) {
      near.fillEllipse(x, VIEW.groundY + 10, 360, 200);
    }
  }

  private drawGround(): void {
    const g = this.add.graphics().setDepth(DEPTH.sausage - 1);
    for (const seg of this.level.ground) {
      g.fillStyle(COLORS.ground);
      g.fillRect(seg.x, VIEW.groundY, seg.width, VIEW.height - VIEW.groundY);
      g.fillStyle(COLORS.groundTop);
      g.fillRoundedRect(seg.x - 4, VIEW.groundY - 4, seg.width + 8, 16, 8);
    }
  }

  private drawSausage(s: Sausage): Phaser.GameObjects.Graphics {
    const g = this.add.graphics().setDepth(DEPTH.sausage);
    const top = s.y - s.thickness / 2;
    const r = s.thickness / 2;
    g.fillStyle(COLORS.sausageShade);
    g.fillRoundedRect(s.x, top, s.length, s.thickness, r);
    g.fillStyle(COLORS.sausage);
    g.fillRoundedRect(s.x + 1, top, s.length - 2, s.thickness - 3, r - 1);
    g.fillStyle(COLORS.sausageShine);
    g.fillRoundedRect(s.x + r, top + 3, Math.max(0, s.length - 2 * r), 3, 1.5);
    return g;
  }

  private drawFinish(): void {
    const g = this.add.graphics().setDepth(DEPTH.sausage - 1);
    const x = this.level.length;
    g.fillStyle(0x6b4a3a);
    g.fillRect(x, VIEW.groundY - 160, 6, 160);
    g.fillStyle(COLORS.icing);
    g.fillTriangle(x + 6, VIEW.groundY - 160, x + 60, VIEW.groundY - 140, x + 6, VIEW.groundY - 120);
  }

  private drawHitboxes(): void {
    const s = this.runner;
    const g = this.debug;
    const holeHalf = DOUGHNUT.holeRadius + DOUGHNUT.holeForgiveness;
    g.lineStyle(1, 0x0000ff);
    g.strokeRect(s.x - DOUGHNUT.halfWidth, s.y - DOUGHNUT.outerRadius, DOUGHNUT.halfWidth * 2, DOUGHNUT.outerRadius * 2);
    g.lineStyle(1, 0x00aa00);
    g.strokeRect(s.x - DOUGHNUT.halfWidth, s.y - holeHalf, DOUGHNUT.halfWidth * 2, holeHalf * 2);
    g.lineStyle(1, 0xff0000);
    for (const z of this.level.sausages) g.strokeRect(z.x, z.y - z.thickness / 2, z.length, z.thickness);
  }
}
