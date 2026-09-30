import Phaser from "phaser";
import { CAMPAIGN } from "../levels/index";
import { createRunner, stepRunner } from "../logic/runner";
import type { DeathCause, RunnerEvent, RunnerOptions, RunnerState } from "../logic/runner";
import { STEPS_PER_DECISION } from "../logic/solver";
import type { DecisionInput } from "../logic/solver";
import { runnerOptionsFor, TOPPINGS } from "../logic/toppings";
import type { Grade } from "../logic/tuning";
import { DOUGHNUT, TUNING, VIEW } from "../logic/tuning";
import type { LevelData } from "../logic/types";
import { coarsePointer, gameElement, isBlocked, keepAwake, onBlockedChange } from "../platform";
import { recordFinish } from "../progress";
import { solveAsync } from "../solveAsync";
import { h, overlay } from "../ui";
import { ART_HALF_WIDTH } from "./BootScene";
import { DEPTH, drawBackdrop, drawFinish, drawGround, drawSausage } from "./draw";
import { COLORS, SPRINKLE_COLORS } from "./palette";

/** What the level scene is asked to play, and where it goes afterwards. */
export interface PlayRequest {
  level: LevelData;
  /** Position in the campaign, for saved progress and the next level. */
  campaignIndex?: number;
  /** Where the Menu button and the end of an editor test lead. */
  returnTo: "menu" | "editor";
  /** Let the solver play the level. */
  demo?: boolean;
}

// Sprinkles ride around the middle of the icing band. They circle once for
// every trip of the ring's own circumference, which reads as the doughnut
// rolling along while its eyes stay fixed on the way ahead.
const SPRINKLES = 12;
const SPRINKLE_RX = ART_HALF_WIDTH - 12;
const SPRINKLE_RY = (DOUGHNUT.outerRadius + DOUGHNUT.holeRadius) / 2 - 1;
const ROLL_RADIUS = DOUGHNUT.outerRadius;

// The camera rises with the doughnut once it climbs above this screen height,
// so that sausages a double jump reaches stay in view.
const CAMERA_TOP = 170;

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
  missed: "Missed a sausage.",
};

// Draws the pure simulation in src/logic and turns keyboard, mouse and touch
// into its input. It never moves the doughnut itself.
export class LevelScene extends Phaser.Scene {
  private request!: PlayRequest;
  private level!: LevelData;
  private options!: RunnerOptions;
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
  private showHitboxes = false;
  private demoInputs: DecisionInput[] | null = null;
  private stepCount = 0;

  private back!: Phaser.GameObjects.Image;
  private front!: Phaser.GameObjects.Image;
  private eyes!: Phaser.GameObjects.Image;
  private sprinkles: Phaser.GameObjects.Image[] = [];
  private sausages: Phaser.GameObjects.Image[] = [];
  private debug!: Phaser.GameObjects.Graphics;
  private hud!: Phaser.GameObjects.Text;
  private banner!: Phaser.GameObjects.Text;
  private crumbs!: Phaser.GameObjects.Particles.ParticleEmitter;
  private puff!: Phaser.GameObjects.Particles.ParticleEmitter;
  // Sprinkles shed behind the doughnut, thicker in higher gears.
  private trail!: Phaser.GameObjects.Particles.ParticleEmitter;
  private jumpKeys: Phaser.Input.Keyboard.Key[] = [];

  constructor() {
    super("level");
  }

  init(request: PlayRequest): void {
    this.request = request;
    this.level = request.level;
    this.options = runnerOptionsFor(request.level.topping);
    this.mode = "ready";
    this.deaths = 0;
    this.demoInputs = null;
    this.glLost = false;
    this.holdPointer = null;
  }

  create(): void {
    this.cameras.main.setScroll(0, 0);
    drawBackdrop(this, this.level.length);
    drawGround(this, this.level);
    this.sausages = this.level.sausages.map((s) => drawSausage(this, s));
    drawFinish(this, this.level.length);

    const topping = this.level.topping;
    this.back = this.add.image(0, 0, `doughnut-back-${topping}`).setDepth(DEPTH.back);
    this.front = this.add.image(0, 0, `doughnut-front-${topping}`).setDepth(DEPTH.front);
    this.eyes = this.add.image(0, 0, "doughnut-eyes").setDepth(DEPTH.front + 2);
    this.sprinkles = Array.from({ length: SPRINKLES }, (_, i) =>
      this.add.image(0, 0, "sprinkle").setTint(SPRINKLE_COLORS[i % SPRINKLE_COLORS.length]),
    );
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
    // A burst of sprinkles kicked downwards by an air jump.
    this.puff = this.add
      .particles(0, 0, "sprinkle", {
        speed: { min: 80, max: 220 },
        angle: { min: 60, max: 120 },
        lifespan: 450,
        rotate: { min: 0, max: 360 },
        alpha: { start: 1, end: 0 },
        tint: [...SPRINKLE_COLORS],
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
      .setDepth(DEPTH.trail);

    // Phones show the game at about two thirds of its size, so the text is
    // set larger there, and the hint names the finger rather than keys.
    const touch = coarsePointer();
    this.hud = this.add
      .text(16, 12, "", { fontFamily: "sans-serif", fontSize: touch ? "26px" : "20px", color: COLORS.text })
      .setScrollFactor(0)
      .setDepth(DEPTH.hud);
    const again = this.options.airJumps > 0 ? (touch ? ", tap again in the air" : ", again in the air") : "";
    const hint = touch
      ? `Tap to jump, hold to jump higher${again}`
      : `Space: jump (hold for height${again})   R: restart   H: hitboxes   Esc: menu`;
    this.add
      .text(VIEW.width - 16, 12, hint, {
        fontFamily: "sans-serif",
        fontSize: touch ? "20px" : "14px",
        color: COLORS.text,
        align: "right",
        wordWrap: { width: VIEW.width * 0.55 },
      })
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(DEPTH.hud);
    this.banner = this.add
      .text(VIEW.width / 2, VIEW.height / 2 - 60, "", {
        fontFamily: "sans-serif",
        fontSize: touch ? "32px" : "26px",
        color: COLORS.text,
        align: "center",
        backgroundColor: "#fff1f7dd",
        padding: { x: 18, y: 12 },
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(DEPTH.hud)
      .setVisible(false);

    this.bindInput();
    this.watchForInterruptions();
    this.addBackButton();
    this.restart();

    const demo = this.request.demo || new URLSearchParams(window.location.search).has("demo");
    if (demo) {
      this.showBanner("Working out a route…");
      void solveAsync(this.level, this.options).then((result) => {
        if (!this.sys.isActive()) return;
        if (!result.inputs) {
          this.showBanner("The solver found no way through this level.");
          return;
        }
        this.demoInputs = result.inputs;
        this.restart();
        this.mode = "running";
      });
    } else {
      const jumpHint = coarsePointer() ? "Hold" : "Hold Space";
      this.showBanner(`${this.level.name}\n${this.verb()} to start\n${jumpHint} for a higher jump`);
    }
  }

  update(_time: number, deltaMs: number): void {
    if (this.mode === "running" && this.updatesSinceStart++ > 10 && this.game.loop.rawDelta > GAP_PAUSE_MS) {
      this.pause();
    }
    if (this.mode !== "running" || this.glLost) {
      this.accumulator = 0;
      this.render(1, deltaMs);
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
      const events = stepRunner(this.runner, input, this.level, this.options);
      events.forEach((e) => this.onEvent(e));
    }
    this.render(this.mode === "running" ? this.accumulator / TUNING.fixedStep : 1, deltaMs);
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
      kb.on("keydown-ESC", () => this.leave());
      // Other scenes have text fields, where Space must type a space.
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => kb.clearCaptures());
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
    const unsubscribe = onBlockedChange((blocked) => blocked && this.pause());
    const onLost = () => {
      this.glLost = true;
      this.pause();
    };
    const onRestored = () => {
      this.glLost = false;
      this.pause();
    };
    const renderer = this.game.renderer;
    const webgl = renderer instanceof Phaser.Renderer.WebGL.WebGLRenderer ? renderer : null;
    webgl?.on(Phaser.Renderer.Events.LOSE_WEBGL, onLost);
    webgl?.on(Phaser.Renderer.Events.RESTORE_WEBGL, onRestored);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      document.removeEventListener("visibilitychange", onHidden);
      unsubscribe();
      webgl?.off(Phaser.Renderer.Events.LOSE_WEBGL, onLost);
      webgl?.off(Phaser.Renderer.Events.RESTORE_WEBGL, onRestored);
    });
  }

  /** A page button, outside the game area so that pressing it never jumps. */
  private addBackButton(): void {
    const label = this.request.returnTo === "editor" ? "Back to editor" : "Menu";
    overlay("level-ui", h("button", { type: "button", class: "back-button", onclick: () => this.leave() }, label));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => document.getElementById("level-ui")?.remove());
  }

  private leave(): void {
    this.scene.start(this.request.returnTo);
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
    if (isBlocked() || this.glLost || this.demoInputs) return;
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
      case "ended": {
        if (this.time.now - this.endedAt < END_LOCKOUT_MS) return;
        this.holdPointer = null;
        const next = this.nextLevel();
        if (this.runner.finished && next !== null) {
          this.scene.start("level", { level: CAMPAIGN[next].level, campaignIndex: next, returnTo: "menu" });
          return;
        }
        this.restart();
        this.mode = "running";
        keepAwake();
        break;
      }
    }
  }

  private nextLevel(): number | null {
    const i = this.request.campaignIndex;
    return i !== undefined && i + 1 < CAMPAIGN.length ? i + 1 : null;
  }

  private restart(): void {
    this.runner = createRunner(this.level, this.options);
    this.prevX = this.runner.x;
    this.prevY = this.runner.y;
    this.updatesSinceStart = 0;
    this.accumulator = 0;
    this.stepCount = 0;
    this.pressLatch = false;
    this.banner.setVisible(false);
    this.setDoughnutVisible(true);
    this.sausages.forEach((g) => g.setAlpha(1));
    this.cameras.main.setScroll(this.runner.x - VIEW.playerScreenX, 0);
    this.render(1, 0);
  }

  private onEvent(e: RunnerEvent): void {
    switch (e.type) {
      case "jump":
        this.squash(0.8, 1.2);
        break;
      case "airJump":
        this.squash(0.75, 1.25);
        this.puff.explode(14, this.runner.x, this.runner.y + DOUGHNUT.outerRadius);
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
        const combo = e.airCombo ? `\nAIR COMBO x${e.airCombo}!` : "";
        this.popText(`${g.label} +${e.points}${chain}${combo}`, g.color, e.grade === "perfect" || e.airCombo > 0);
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
        this.setDoughnutVisible(false);
        this.end();
        this.showBanner(`${DEATH_TEXT[e.cause]}\n${this.verb()} to try again`);
        break;
      case "finish":
        this.end();
        this.showBanner(this.finishText());
        break;
    }
  }

  private finishText(): string {
    const score = this.runner.score;
    const total = this.level.sausages.length;
    const lines = ["Level clear!", `Score ${score}`, `Threaded ${this.runner.threaded.length}/${total}`];
    const index = this.request.campaignIndex;
    if (this.request.demo || this.demoInputs) return lines.join("\n");
    if (index !== undefined) {
      const beat = recordFinish(CAMPAIGN[index].id, score);
      if (beat) lines[1] += "  New best!";
      const next = this.nextLevel();
      if (next !== null) {
        const nextTopping = CAMPAIGN[next].level.topping;
        if (nextTopping !== this.level.topping) {
          const t = TOPPINGS[nextTopping];
          lines.push(`Unlocked: ${t.name}!`, t.power);
        }
        lines.push(`${this.verb()} for the next level`);
        return lines.join("\n");
      }
    }
    lines.push(this.request.returnTo === "editor" ? `${this.verb()} to run again` : `${this.verb()} to play again`);
    return lines.join("\n");
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
  private render(alpha: number, deltaMs: number): void {
    const s = this.runner;
    const x = this.prevX + (s.x - this.prevX) * alpha;
    const y = this.prevY + (s.y - this.prevY) * alpha;
    const cam = this.cameras.main;
    cam.scrollX = x - VIEW.playerScreenX;
    // Ease upwards and back down, rather than snapping with every jump.
    const targetY = Math.min(0, y - CAMERA_TOP);
    const ease = 1 - Math.exp(-deltaMs / 120);
    cam.scrollY += (targetY - cam.scrollY) * (deltaMs > 0 ? ease : 1);
    this.back.setPosition(x, y);
    this.front.setPosition(x, y);
    this.placeEyesAndSprinkles(x, y);

    const gears = TUNING.gears.length;
    const bar = "■".repeat(s.gear + 1) + "□".repeat(gears - s.gear - 1);
    const chain = s.chain > 1 ? `   Chain x${s.chain}` : "";
    const air =
      this.options.airJumps > 0
        ? `   Air jump ${"●".repeat(s.airJumpsLeft)}${"○".repeat(this.options.airJumps - s.airJumpsLeft)}`
        : "";
    this.hud.setText(`Score ${s.score}${chain}\nSpeed ${bar}${air}   Deaths ${this.deaths}`);
    this.trail.frequency = this.mode === "running" && s.gear >= 2 ? 120 / s.gear : -1;
    this.trail.setPosition(x - 10, y);

    this.debug.clear();
    if (this.showHitboxes) this.drawHitboxes(x, y);
  }

  private setDoughnutVisible(visible: boolean): void {
    [this.back, this.front, this.eyes, ...this.sprinkles].forEach((o) => o.setVisible(visible));
  }

  private placeEyesAndSprinkles(x: number, y: number): void {
    // Follow the squash and stretch of the ring itself.
    const sx = this.back.scaleX;
    const sy = this.back.scaleY;
    this.eyes.setPosition(x + 14 * sx, y - 33 * sy).setScale(sx, sy);
    const roll = x / ROLL_RADIUS;
    this.sprinkles.forEach((sprinkle, i) => {
      const a = roll + (i / SPRINKLES) * Math.PI * 2;
      const cos = Math.cos(a);
      const sin = Math.sin(a);
      sprinkle
        .setPosition(x + 2 * sx + SPRINKLE_RX * cos * sx, y + SPRINKLE_RY * sin * sy)
        // Lying along the ring, and behind a passing sausage on the far half.
        .setRotation(Math.atan2(SPRINKLE_RY * cos, -SPRINKLE_RX * sin) + (i % 3) * 0.6)
        .setDepth(cos < 0 ? DEPTH.back + 1 : DEPTH.front + 1);
    });
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
    // Kept below the score display, which the text drifts towards as it fades.
    const y = Math.max(150, this.runner.y - this.cameras.main.scrollY - DOUGHNUT.outerRadius - 16);
    const size = (big ? 28 : 20) + (coarsePointer() ? 6 : 0);
    const t = this.add
      .text(x, y, text, { fontFamily: "sans-serif", fontSize: `${size}px`, color, fontStyle: "bold", align: "center" })
      .setOrigin(0.5, 1)
      .setScrollFactor(0)
      .setDepth(DEPTH.fx);
    if (big) this.tweens.add({ targets: t, scale: { from: 1.4, to: 1 }, duration: 180 });
    this.tweens.add({ targets: t, y: y - 50, alpha: 0, delay: 300, duration: 700, onComplete: () => t.destroy() });
  }

  private showBanner(text: string): void {
    this.banner.setText(text).setVisible(true);
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
