import Phaser from "phaser";
import { GREYBOX } from "../levels/greybox";
import { createRunner, PLAIN, stepRunner } from "../logic/runner";
import type { DeathCause, RunnerEvent, RunnerState } from "../logic/runner";
import type { Grade } from "../logic/tuning";
import { DOUGHNUT, TUNING, VIEW } from "../logic/tuning";
import { solveLevel, STEPS_PER_DECISION } from "../logic/solver";
import type { DecisionInput } from "../logic/solver";
import type { LevelData, Sausage } from "../logic/types";
import { coarsePointer, gameElement, isBlocked, keepAwake, onBlockedChange } from "../platform";
import { COLORS } from "./palette";

const DEPTH = { back: 5, sausage: 10, front: 15, fx: 20, hud: 100 } as const;

const GRADE_TEXT: Record<Grade, { label: string; color: string }> = {
  perfect: { label: "PERFECT!", color: "#d6246e" },
  great: { label: "Great", color: "#b0428a" },
  good: { label: "Good", color: "#7a4a70" },
  sloppy: { label: "Sloppy", color: "#8a7a80" },
};

// A press this soon after a crash or the finish is ignored, so that a late
// tap does not wipe the message before the player has read it.
const END_LOCKOUT_MS = 400;
// A frame this long means the game was frozen (a locked phone, a switched
// app); the run pauses rather than carrying on unseen.
const GAP_PAUSE_MS = 500;

type Mode = "ready" | "running" | "paused" | "ended";

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
  private mode: Mode = "ready";
  private endedAt = 0;
  private updatesSinceStart = 0;
  private glLost = false;
  // The finger (or mouse) whose press started the current jump, by pointer
  // id. Only it can hold the jump, so a thumb resting elsewhere on the glass
  // does not turn every tap into a full-height jump.
  private holdPointer: number | null = null;
  // Where the doughnut was before the latest step, for drawing between steps.
  private prevX = 0;
  private prevY = 0;
  private deaths = 0;
  private best = 0;
  private showHitboxes = false;
  // With ?demo or #demo in the URL, the solver's winning inputs play the level.
  private demoInputs: DecisionInput[] | null = null;
  private stepCount = 0;

  private back!: Phaser.GameObjects.Image;
  private front!: Phaser.GameObjects.Image;
  private sausages: Phaser.GameObjects.Image[] = [];
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

    // Phones show the game at about two thirds of its size, so the text is
    // set larger there, and the hint names the finger rather than keys.
    const touch = coarsePointer();
    this.hud = this.add
      .text(16, 12, "", { fontFamily: "sans-serif", fontSize: touch ? "26px" : "20px", color: COLORS.text })
      .setScrollFactor(0)
      .setDepth(DEPTH.hud);
    const hint = touch
      ? "Tap to jump, hold to jump higher"
      : "Space: jump (hold for height)   R: restart   H: hitboxes";
    this.add
      .text(VIEW.width - 16, 12, hint, {
        fontFamily: "sans-serif",
        fontSize: touch ? "22px" : "14px",
        color: COLORS.text,
      })
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(DEPTH.hud);
    this.banner = this.add
      .text(VIEW.width / 2, VIEW.height / 2 - 60, "", {
        fontFamily: "sans-serif",
        fontSize: touch ? "34px" : "28px",
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
    this.watchForInterruptions();
    const demo = new URLSearchParams(window.location.search).has("demo") || window.location.hash === "#demo";
    if (demo) this.demoInputs = solveLevel(this.level, PLAIN).inputs;
    this.restart();
    if (this.demoInputs) this.mode = "running";
    else this.showBanner(`${this.verb()} to start\n${coarsePointer() ? "Hold" : "Hold Space"} for a higher jump`);
  }

  update(_time: number, deltaMs: number): void {
    if (this.mode === "running" && this.updatesSinceStart++ > 10 && this.game.loop.rawDelta > GAP_PAUSE_MS) {
      this.pause();
    }
    if (this.mode !== "running" || this.glLost) {
      this.accumulator = 0;
      this.render(1);
      return;
    }
    // Cap the frame time so that a stalled tab does not fast-forward the run.
    this.accumulator += Math.min(deltaMs / 1000, 0.1);
    while (this.accumulator >= TUNING.fixedStep && this.mode === "running") {
      this.accumulator -= TUNING.fixedStep;
      const input = this.demoInputs ? this.demoInput() : { held: this.isHeld(), pressed: this.pressLatch };
      this.pressLatch = false;
      this.stepCount += 1;
      this.prevX = this.runner.x;
      this.prevY = this.runner.y;
      const events = stepRunner(this.runner, input, this.level, PLAIN);
      events.forEach((e) => this.onEvent(e));
    }
    this.render(this.mode === "running" ? this.accumulator / TUNING.fixedStep : 1);
  }

  private bindInput(): void {
    const kb = this.input.keyboard;
    if (kb) {
      const K = Phaser.Input.Keyboard.KeyCodes;
      this.jumpKeys = [K.SPACE, K.UP, K.W].map((code) => kb.addKey(code));
      this.jumpKeys.forEach((key) => key.on("down", () => this.onPress()));
      kb.on("keydown-R", () => {
        if (isBlocked() || this.glLost) return;
        this.restart();
        this.mode = "running";
      });
      kb.on("keydown-H", () => (this.showHitboxes = !this.showHitboxes));
    }
    // The whole game area is the jump button, including the bars around the
    // canvas, so presses are read from the page's pointer events rather than
    // Phaser's, which cover the canvas alone. The platform module cancels the
    // browser's touch gestures on the same area.
    const zone = gameElement();
    const down = (e: PointerEvent) => {
      if (e.button > 0) return;
      // Phaser no longer grabs focus at load, so take it here for the keys.
      window.focus();
      // Deliver the release here even if the finger or mouse leaves the area.
      zone.setPointerCapture?.(e.pointerId);
      this.holdPointer = e.pointerId;
      this.onPress();
    };
    const up = (e: PointerEvent) => {
      if (e.pointerId === this.holdPointer) this.holdPointer = null;
    };
    // A release the page never receives (outside a frame, say) still ends
    // the hold once the mouse comes back with its button up.
    const moved = (e: PointerEvent) => {
      if (e.pointerId === this.holdPointer && (e.buttons & 1) === 0) this.holdPointer = null;
    };
    const release = () => (this.holdPointer = null);
    const noMenu = (e: Event) => e.preventDefault();
    zone.addEventListener("pointerdown", down);
    zone.addEventListener("contextmenu", noMenu);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    window.addEventListener("pointermove", moved);
    window.addEventListener("blur", release);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      zone.removeEventListener("pointerdown", down);
      zone.removeEventListener("contextmenu", noMenu);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      window.removeEventListener("pointermove", moved);
      window.removeEventListener("blur", release);
    });
  }

  private watchForInterruptions(): void {
    const onHidden = () => {
      if (document.hidden) this.pause();
    };
    document.addEventListener("visibilitychange", onHidden);
    onBlockedChange((blocked) => blocked && this.pause());
    const renderer = this.game.renderer;
    if (renderer instanceof Phaser.Renderer.WebGL.WebGLRenderer) {
      renderer.on(Phaser.Renderer.Events.LOSE_WEBGL, () => {
        this.glLost = true;
        this.pause();
      });
      renderer.on(Phaser.Renderer.Events.RESTORE_WEBGL, () => {
        this.glLost = false;
        this.pause();
      });
    }
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => document.removeEventListener("visibilitychange", onHidden));
  }

  private verb(): string {
    return coarsePointer() ? "Tap" : "Press";
  }

  private pause(): void {
    if (this.mode !== "running") return;
    this.mode = "paused";
    this.holdPointer = null;
    this.pressLatch = false;
    // Resume drawing from where the doughnut stands, not a step behind it.
    this.prevX = this.runner.x;
    this.prevY = this.runner.y;
    this.showBanner(`Paused\n${this.verb()} to continue`);
  }

  private demoInput(): { held: boolean; pressed: boolean } {
    const inputs = this.demoInputs ?? [];
    const decision = Math.floor(this.stepCount / STEPS_PER_DECISION);
    const d = inputs[decision] ?? { held: false, pressed: false };
    return { held: d.held, pressed: d.pressed && this.stepCount % STEPS_PER_DECISION === 0 };
  }

  private isHeld(): boolean {
    return this.holdPointer !== null || this.jumpKeys.some((k) => k.isDown);
  }

  private onPress(): void {
    if (isBlocked() || this.glLost) return;
    switch (this.mode) {
      case "running":
        this.pressLatch = true;
        break;
      case "ready":
      case "paused":
        // This press starts or resumes the run; it does not also jump.
        this.holdPointer = null;
        this.mode = "running";
        this.updatesSinceStart = 0;
        this.banner.setVisible(false);
        keepAwake();
        break;
      case "ended":
        if (this.time.now - this.endedAt < END_LOCKOUT_MS) return;
        this.holdPointer = null;
        this.restart();
        this.mode = "running";
        keepAwake();
        break;
    }
  }

  private restart(): void {
    this.runner = createRunner(this.level, PLAIN);
    this.prevX = this.runner.x;
    this.prevY = this.runner.y;
    this.updatesSinceStart = 0;
    this.accumulator = 0;
    this.stepCount = 0;
    this.pressLatch = false;
    this.banner.setVisible(false);
    this.back.setVisible(true);
    this.front.setVisible(true);
    this.sausages.forEach((g) => g.setAlpha(1));
    this.render(1);
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
        this.end();
        this.showBanner(`${DEATH_TEXT[e.cause]}\n${this.verb()} to try again`);
        break;
      case "finish": {
        this.best = Math.max(this.best, this.runner.score);
        const total = this.level.sausages.length;
        this.end();
        this.showBanner(
          `Level clear!\nScore ${this.runner.score}   Best ${this.best}\n` +
            `Threaded ${this.runner.threaded.length}/${total}\n${this.verb()} to run again`,
        );
        break;
      }
    }
  }

  private end(): void {
    this.mode = "ended";
    this.endedAt = this.time.now;
  }

  /**
   * Draws the doughnut part of the way from its previous step to its current
   * one. The simulation steps at 120 Hz while screens refresh at 60, 90, 120
   * or 144 Hz; drawing only whole steps would make the scroll judder.
   */
  private render(alpha: number): void {
    const s = this.runner;
    const x = this.prevX + (s.x - this.prevX) * alpha;
    const y = this.prevY + (s.y - this.prevY) * alpha;
    this.cameras.main.scrollX = x - VIEW.playerScreenX;
    this.back.setPosition(x, y);
    this.front.setPosition(x, y);

    const gears = TUNING.gears.length;
    const bar = "\u25A0".repeat(s.gear + 1) + "\u25A1".repeat(gears - s.gear - 1);
    const chain = s.chain > 1 ? `   Chain x${s.chain}` : "";
    this.hud.setText(`Score ${s.score}${chain}\nSpeed ${bar}   Deaths ${this.deaths}`);
    this.trail.frequency = this.mode === "running" && s.gear >= 2 ? 120 / s.gear : -1;
    this.trail.setPosition(x - 10, y);

    this.debug.clear();
    if (this.showHitboxes) this.drawHitboxes(x, y);
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
    const size = (big ? 28 : 20) + (coarsePointer() ? 6 : 0);
    const t = this.add
      .text(x, y, text, { fontFamily: "sans-serif", fontSize: `${size}px`, color, fontStyle: "bold" })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(DEPTH.fx);
    if (big) this.tweens.add({ targets: t, scale: { from: 1.4, to: 1 }, duration: 180 });
    this.tweens.add({ targets: t, y: y - 50, alpha: 0, delay: 300, duration: 700, onComplete: () => t.destroy() });
  }

  private showBanner(text: string): void {
    this.banner.setText(text).setVisible(true);
  }

  // Phaser redraws Graphics shapes from scratch every frame, and each curve
  // costs a hundred points. On a mid-range phone the sausages alone took
  // about 14 ms a frame, so every curved shape is drawn once into a texture
  // and shown as an image.
  private bake(key: string, width: number, height: number, draw: (g: Phaser.GameObjects.Graphics) => void): string {
    if (!this.textures.exists(key)) {
      const g = this.make.graphics({}, false);
      draw(g);
      g.generateTexture(key, width, height);
      g.destroy();
    }
    return key;
  }

  private drawBackdrop(): void {
    const far = this.bake("hill-far", 420, 260, (g) => g.fillStyle(COLORS.hillFar).fillEllipse(210, 130, 420, 260));
    const near = this.bake("hill-near", 360, 200, (g) => g.fillStyle(COLORS.hillNear).fillEllipse(180, 100, 360, 200));
    for (let x = -200; x < this.level.length * 0.2 + VIEW.width; x += 260) {
      this.add.image(x, VIEW.groundY - 40, far).setScrollFactor(0.2);
    }
    for (let x = -100; x < this.level.length * 0.45 + VIEW.width; x += 340) {
      this.add.image(x, VIEW.groundY + 10, near).setScrollFactor(0.45);
    }
  }

  private drawGround(): void {
    const depth = DEPTH.sausage - 1;
    const g = this.add.graphics().setDepth(depth);
    const cap = this.bake("ground-cap", 16, 16, (c) => c.fillStyle(COLORS.groundTop).fillCircle(8, 8, 8));
    for (const seg of this.level.ground) {
      g.fillStyle(COLORS.ground);
      g.fillRect(seg.x, VIEW.groundY, seg.width, VIEW.height - VIEW.groundY);
      // The icing strip along the top, with rounded ends from the cap image.
      g.fillStyle(COLORS.groundTop);
      g.fillRect(seg.x + 4, VIEW.groundY - 4, seg.width - 8, 16);
      this.add.image(seg.x + 4, VIEW.groundY + 4, cap).setDepth(depth);
      this.add.image(seg.x + seg.width - 4, VIEW.groundY + 4, cap).setDepth(depth);
    }
  }

  private drawSausage(s: Sausage): Phaser.GameObjects.Image {
    const r = s.thickness / 2;
    const key = this.bake(`sausage-${s.length}x${s.thickness}`, s.length, s.thickness, (g) => {
      g.fillStyle(COLORS.sausageShade);
      g.fillRoundedRect(0, 0, s.length, s.thickness, r);
      g.fillStyle(COLORS.sausage);
      g.fillRoundedRect(1, 0, s.length - 2, s.thickness - 3, r - 1);
      g.fillStyle(COLORS.sausageShine);
      g.fillRoundedRect(r, 3, Math.max(0, s.length - 2 * r), 3, 1.5);
    });
    return this.add
      .image(s.x, s.y - r, key)
      .setOrigin(0, 0)
      .setDepth(DEPTH.sausage);
  }

  private drawFinish(): void {
    const g = this.add.graphics().setDepth(DEPTH.sausage - 1);
    const x = this.level.length;
    g.fillStyle(0x6b4a3a);
    g.fillRect(x, VIEW.groundY - 160, 6, 160);
    g.fillStyle(COLORS.icing);
    g.fillTriangle(x + 6, VIEW.groundY - 160, x + 60, VIEW.groundY - 140, x + 6, VIEW.groundY - 120);
  }

  private drawHitboxes(x: number, y: number): void {
    const g = this.debug;
    const holeHalf = DOUGHNUT.holeRadius + DOUGHNUT.holeForgiveness;
    g.lineStyle(1, 0x0000ff);
    g.strokeRect(x - DOUGHNUT.halfWidth, y - DOUGHNUT.outerRadius, DOUGHNUT.halfWidth * 2, DOUGHNUT.outerRadius * 2);
    g.lineStyle(1, 0x00aa00);
    g.strokeRect(x - DOUGHNUT.halfWidth, y - holeHalf, DOUGHNUT.halfWidth * 2, holeHalf * 2);
    g.lineStyle(1, 0xff0000);
    for (const z of this.level.sausages) g.strokeRect(z.x, z.y - z.thickness / 2, z.length, z.thickness);
  }
}
