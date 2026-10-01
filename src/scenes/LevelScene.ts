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
import { isMuted, setMuted, sound } from "../sound";
import { medalFor, medalTargets } from "../logic/medals";
import type { Medal } from "../logic/medals";
import { h, overlay } from "../ui";
import { ART_HALF_WIDTH, EYE_LEVELS, EYES_OFFSET, SHADES_FRAMES } from "./BootScene";
import { INK, OUTLINE_FONT, READABLE_FONT } from "./fonts";
import { RAINBOW_SCALE, showRainbow } from "./rainbowText";
import { DentureChaser } from "./boss";
import { addSkySprinkles, DEPTH, drawBackdrop, drawFinish, drawGround, drawSausage, drawSprinkleGrass } from "./draw";
import { COLORS, RAINBOW_SPRINKLES, SPRINKLE_COLORS } from "./palette";

/** What the level scene is asked to play, and where it goes afterwards. */
export interface PlayRequest {
  level: LevelData;
  /** Position in the campaign, for saved progress and the next level. */
  campaignIndex?: number;
  /** Where the Menu button and the end of an editor test lead. */
  returnTo: "menu" | "editor" | "map";
  /** Let the solver play the level. */
  demo?: boolean;
}

// Sprinkles ride around the middle of the icing band. They circle once for
// every trip of the ring's own circumference, which reads as the doughnut
// rolling along while its eyes stay fixed on the way ahead.
const SPRINKLES = 12;
const SPRINKLE_RX = ART_HALF_WIDTH - 14;
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

/** Rainbow sprinkles streaming off behind the doughnut. */
const VICTORY_TRAIL: Phaser.Types.GameObjects.Particles.ParticleEmitterConfig = {
  speedX: { min: -140, max: -20 },
  speedY: { min: -90, max: 90 },
  gravityY: 120,
  lifespan: { min: 900, max: 1600 },
  rotate: { min: 0, max: 360 },
  scale: { start: 0.9, end: 0.35 },
  alpha: { start: 1, end: 0 },
  tint: [0xff5fa2, 0xffa24a, 0xffd23f, 0x6fd66f, 0x4fb3ff, 0xa87bff, 0xffffff],
  frequency: -1,
};

/** The forward lean at top gear: about seven degrees. */
const MAX_LEAN = 0.12;

// Multipliers climb from cool to hot: 2x green, 3x blue, 4x purple, 5x
// orange, then red.
const MULTIPLIER_COLORS = ["#3fcf62", "#3aa8ff", "#9b6bff", "#ff8a1f", "#ff3d5a"];
function multiplierColor(n: number): string {
  return MULTIPLIER_COLORS[Math.min(MULTIPLIER_COLORS.length - 1, Math.max(0, n - 2))];
}

/** One HUD row: a lead-in, a label, a number, and a trailing multiplier. */
interface HudRow {
  before: Phaser.GameObjects.Text;
  label: Phaser.GameObjects.Text;
  /** The number again in white, thickened, behind the ink so it reads on any sky. */
  halo: Phaser.GameObjects.Text;
  value: Phaser.GameObjects.Text;
  after: Phaser.GameObjects.Text;
}

function layoutHudRow(row: HudRow, before: string, value: string, after: string, afterColor: string | null): void {
  row.before.setText(before);
  row.value.setText(value);
  row.halo.setText(value);
  row.after.setText(after);
  if (afterColor) row.after.setColor(afterColor);
  let x = 16;
  for (const part of [row.before, row.label, row.value, row.after]) {
    part.setX(x);
    if (part === row.value) row.halo.setX(x);
    if (part.text) x += part.width + (part === row.label ? 6 : 10);
  }
}

// The speed meter: one sparkle bit per gear, each its own colour.
const GEAR_COLORS = [0xff5fa2, 0xffa24a, 0xffd23f, 0x6fd66f, 0x4fb3ff, 0xa87bff];

// A sausage wiggles where it comes out from behind the doughnut, and keeps
// wiggling for a moment after the doughnut has left it.
const WIGGLE = { points: 14, amplitude: 3, wavelength: 50, speed: 12, settle: 0.7 } as const;

// Bits of food thrown up where the doughnut meets the ground.
const DUST_COLORS = [0xe0a458, 0xf3cfa6, 0xff7eb6, 0xffffff, 0x7ec8ff, 0xfff27e];

// A press this soon after a crash or the finish is ignored, so that a late
// tap does not wipe the message before the player has read it.
const END_LOCKOUT_MS = 400;
// A frame this long means the game was frozen (a locked phone, a switched
// app); the run pauses rather than carrying on unseen.
const GAP_PAUSE_MS = 500;

type Mode = "ready" | "running" | "paused" | "ended";

const MEDAL_TEXT: Record<Medal, string> = { gold: "Gold medal!", silver: "Silver medal", bronze: "Bronze medal" };

const DEATH_TEXT: Record<DeathCause, string> = {
  sausage: "Bonk! The sausage hit the dough.",
  fell: "Down the hole you go.",
  wall: "Splat against the cliff.",
  cab: "Honk! Bumped into a cab.",
  cart: "Clang! Ran into a hot dog cart.",
  arrested: "Busted! Every sausage goes through the hole.",
  chomped: "Chomp! The dentures caught up.",
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
  private prevChaserX = 0;
  private boss: DentureChaser | null = null;
  // The sizzle of each sausage passing through the hole, by index.
  private sizzles = new Map<number, () => void>();
  private fluff!: Phaser.GameObjects.Particles.ParticleEmitter;
  private wasHovering = false;
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
  /** The score and deaths rows: Comic labels and outline-face numbers. */
  private hud!: { score: HudRow; deaths: HudRow };
  private banner: Phaser.GameObjects.Image | null = null;
  private medal: Phaser.GameObjects.Image | null = null;
  private hint!: Phaser.GameObjects.Text;
  // Meme sunglasses that drop onto the doughnut's face in top gear.
  private shades!: Phaser.GameObjects.Image;
  private shadesOn = false;
  /** How far the ring leans forward, in radians; it eases towards its gear's lean. */
  private lean = 0;
  /** Sprinkle grass in front of the doughnut, which bends as it rolls through. */
  private tufts: Phaser.GameObjects.Image[] = [];
  // 0 on the face, 1 lifted out of view. Its own object so its tween never
  // cancels the hop's, and the other way round.
  private glassDrop = { v: 1 };
  // 0 resting on the eyes, 1 lifted off them for a moment during a jump.
  private glassHop = { v: 0 };
  // Set when the glasses were knocked off by a crash, so they spin away.
  private glassSpin = false;
  private shadesFrame = 0;
  private wiggles = new Map<number, { rope: Phaser.GameObjects.Rope; start: number; end: number | null }>();
  private crumbs!: Phaser.GameObjects.Particles.ParticleEmitter;
  // Crumbs thrown off by each bite when the doughnut is eaten, in screen space.
  private biteCrumbs!: Phaser.GameObjects.Particles.ParticleEmitter;
  // The doughnut being eaten after a crash, and the timers driving the bites.
  private eaten: {
    image: Phaser.GameObjects.RenderTexture;
    timers: Phaser.Time.TimerEvent[];
    /** Anything else the death brought on screen, such as the officer's arm. */
    extras: Phaser.GameObjects.GameObject[];
  } | null = null;
  // The victory lap at the flag: the doughnut's stand-in image, its sprinkle
  // trail, and the textures drawn for it.
  private victory: { image: Phaser.GameObjects.Image; trail: Phaser.GameObjects.Particles.ParticleEmitter; keys: string[] } | null = null;
  private puff!: Phaser.GameObjects.Particles.ParticleEmitter;
  // Sprinkles shed behind the doughnut, thicker in higher gears.
  private trail!: Phaser.GameObjects.Particles.ParticleEmitter;
  // Sprinkles, crumbs and glitter kicked up behind the point of contact.
  private dust!: Phaser.GameObjects.Particles.ParticleEmitter;
  private dustGlitter!: Phaser.GameObjects.Particles.ParticleEmitter;
  private gears: { bit: Phaser.GameObjects.Image; glow: Phaser.GameObjects.Image; baseY: number }[] = [];
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
    if (this.level.theme === "candy") addSkySprinkles(this);
    drawBackdrop(this, this.level.length, this.level.theme);
    drawGround(this, this.level);
    this.tufts = drawSprinkleGrass(this, this.level);
    this.sausages = this.level.sausages.map((s) => drawSausage(this, s, this.level.theme));
    drawFinish(this, this.level.length);
    this.boss = this.level.chaser ? new DentureChaser(this, this.level) : null;

    const topping = this.level.topping;
    this.back = this.add.image(0, 0, `doughnut-back-${topping}`).setDepth(DEPTH.back);
    this.front = this.add.image(0, 0, `doughnut-front-${topping}`).setDepth(DEPTH.front);
    this.eyes = this.add.image(0, 0, "doughnut-eyes").setDepth(DEPTH.front + 2);
    this.shades = this.add.image(0, 0, "shades-0").setDepth(DEPTH.front + 4).setVisible(false);
    this.shadesOn = false;
    this.glassDrop = { v: 1 };
    this.glassHop = { v: 0 };
    this.glassSpin = false;
    this.wiggles = new Map();
    const sprinkleColors = topping === "rainbow" ? RAINBOW_SPRINKLES : SPRINKLE_COLORS;
    this.sprinkles = Array.from({ length: SPRINKLES }, (_, i) =>
      this.add.image(0, 0, "sprinkle").setTint(sprinkleColors[i % sprinkleColors.length]),
    );
    // Wisps of marshmallow drifting off the doughnut while it floats.
    this.fluff = this.add
      .particles(0, 0, "glow", {
        speedX: { min: -60, max: -10 },
        speedY: { min: 10, max: 50 },
        lifespan: 600,
        scale: { start: 0.5, end: 0.1 },
        alpha: { start: 0.8, end: 0 },
        tint: [0xffffff, 0xf0e2ff, 0xffd6ec],
        frequency: -1,
      })
      .setDepth(DEPTH.trail);
    this.debug = this.add.graphics().setDepth(DEPTH.fx);
    this.eaten = null;
    this.victory = null;
    this.biteCrumbs = this.add
      .particles(0, 0, "crumb", {
        speed: { min: 90, max: 320 },
        angle: { min: 0, max: 360 },
        gravityY: 900,
        lifespan: 750,
        scale: { start: 1.1, end: 0.3 },
        rotate: { min: 0, max: 360 },
        tint: [0xe0a458, 0xf3cfa6, 0xc98a4a, 0xff7eb6, 0xffffff],
        emitting: false,
      })
      .setScrollFactor(0)
      .setDepth(DEPTH.hud - 1);
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
    // The same rainbow sprinkles that stream off the victory lap, kicked up
    // backwards from the ground under the ring and drawn behind it.
    this.trail = this.add
      .particles(0, 0, "pill", { ...VICTORY_TRAIL, speedY: { min: -130, max: -20 }, gravityY: 260, lifespan: { min: 600, max: 1100 } })
      // Behind the ground too, so sprinkles that fall back sink out of sight.
      .setDepth(DEPTH.ground - 0.5);
    const kick = {
      speedX: { min: -260, max: -60 },
      speedY: { min: -280, max: -90 },
      gravityY: 950,
      rotate: { min: 0, max: 360 },
      frequency: -1,
    };
    this.dust = this.add
      .particles(0, 0, "sprinkle", {
        ...kick,
        lifespan: 520,
        scale: { start: 1, end: 0.4 },
        alpha: { start: 1, end: 0 },
        tint: DUST_COLORS,
      })
      .setDepth(DEPTH.front + 3);
    this.dustGlitter = this.add
      .particles(0, 0, "glitter", {
        ...kick,
        lifespan: 380,
        scale: { start: 0.7, end: 0 },
        tint: [0xffffff, 0xfff2a8, 0xffc4e1],
        blendMode: Phaser.BlendModes.ADD,
      })
      .setDepth(DEPTH.front + 3);

    // Phones show the game at about two thirds of its size, so the text is
    // set larger there, and the hint names the finger rather than keys.
    const touch = coarsePointer();
    // Labels in the readable face; the score and deaths counts in the bubble
    // face's outline cut alone, ink over a white halo.
    const labelStyle = {
      fontFamily: READABLE_FONT,
      fontStyle: "bold",
      fontSize: touch ? "24px" : "19px",
      color: COLORS.text,
      stroke: "#ffffff",
      strokeThickness: 4,
      resolution: 2,
    };
    const numberSize = touch ? "32px" : "27px";
    const numberStyle = { fontFamily: OUTLINE_FONT, fontSize: numberSize, color: INK, stroke: INK, strokeThickness: 1, resolution: 2 };
    const haloStyle = { fontFamily: OUTLINE_FONT, fontSize: numberSize, color: "#ffffff", stroke: "#ffffff", strokeThickness: 6, resolution: 2 };
    const text = (x: number, y: number, value: string, style: Phaser.Types.GameObjects.Text.TextStyle) =>
      this.add.text(x, y, value, style).setOrigin(0, 0.5).setScrollFactor(0).setDepth(DEPTH.hud);
    const line = (touch ? 24 : 19) * 1.55;
    const rowY = (row: number) => 12 + line * (row + 0.5);
    const row = (r: number, label: string): HudRow => ({
      before: text(16, rowY(r), "", labelStyle),
      label: text(16, rowY(r), label, labelStyle),
      halo: text(16, rowY(r), "", haloStyle),
      value: text(16, rowY(r), "", numberStyle),
      after: text(16, rowY(r), "", { ...labelStyle, fontSize: touch ? "26px" : "21px" }),
    });
    this.hud = { score: row(0, "Score"), deaths: row(2, "Deaths") };
    const speedLabel = text(16, rowY(1), "Speed", labelStyle);
    const bitSize = line * 1.05;
    const firstX = 16 + speedLabel.width + bitSize * 0.45;
    const baseY = rowY(1);
    this.gears = GEAR_COLORS.map((color, i) => {
      const x = firstX + i * bitSize * 0.62;
      const glow = this.add
        .image(x, baseY, "glow")
        .setTint(color)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDisplaySize(bitSize * 1.6, bitSize * 1.6)
        .setScrollFactor(0)
        .setDepth(DEPTH.hud)
        .setVisible(false);
      // A sugar sprinkle, standing on end.
      const bit = this.add
        .image(x, baseY, "pill")
        .setTint(color)
        .setDisplaySize(bitSize * 0.95, bitSize * 0.39)
        .setScrollFactor(0)
        .setDepth(DEPTH.hud)
        .setRotation(Math.PI / 2);
      return { bit, glow, baseY };
    });
    const again = this.options.airJumps > 0 ? (touch ? ", tap again in the air" : ", again in the air") : "";
    const hint = touch
      ? `Tap to jump, hold to jump higher${again}`
      : `Space: jump (hold for height${again})   R: restart   H: hitboxes   Esc: menu`;
    // The controls, shown only until the run starts.
    this.hint = this.add
      .text(VIEW.width - 16, 12, hint, {
        fontFamily: READABLE_FONT,
        fontStyle: "bold",
        fontSize: touch ? "20px" : "15px",
        color: COLORS.text,
        stroke: "#ffffff",
        strokeThickness: 3,
        align: "right",
        wordWrap: { width: VIEW.width * 0.55 },
      })
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(DEPTH.hud);
    this.banner = null;

    this.bindInput();
    this.watchForInterruptions();
    this.addBackButton();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.stopSizzles());
    this.restart();

    const demo = this.request.demo || new URLSearchParams(window.location.search).has("demo");
    if (demo) {
      this.showBanner("Working out a route…", 0);
      void solveAsync(this.level, this.options).then((result) => {
        if (!this.sys.isActive()) return;
        if (!result.inputs) {
          this.showBanner("The solver found no way through this level.", 0);
          return;
        }
        this.demoInputs = result.inputs;
        this.restart();
        this.mode = "running";
        this.hint.setVisible(false);
      });
    } else {
      const jumpHint = coarsePointer() ? "Hold" : "Hold Space";
      this.showBanner(`${this.level.name}\n${this.verb()} to start\n${jumpHint} for a higher jump`, 1);
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
      this.holdPrevious();
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
  private stopSizzles(): void {
    this.sizzles.forEach((stop) => stop());
    this.sizzles.clear();
  }

  private addBackButton(): void {
    const label = { editor: "Back to editor", map: "Map", menu: "Menu" }[this.request.returnTo];
    const mute = h("button", { type: "button", class: "back-button mute-button", "aria-pressed": String(isMuted()) }, isMuted() ? "Sound off" : "Sound on") as HTMLButtonElement;
    const toggle = () => {
      setMuted(!isMuted());
      mute.textContent = isMuted() ? "Sound off" : "Sound on";
      mute.setAttribute("aria-pressed", String(isMuted()));
    };
    // Kept from starting a jump: the press belongs to the button.
    mute.addEventListener("pointerdown", (ev) => ev.stopPropagation());
    mute.addEventListener("click", toggle);
    overlay(
      "level-ui",
      h("button", { type: "button", class: "back-button", onclick: () => this.leave() }, label),
      mute,
    );
    this.input.keyboard?.on("keydown-M", toggle);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => document.getElementById("level-ui")?.remove());
  }

  private leave(): void {
    const i = this.request.campaignIndex;
    if (this.request.returnTo === "map") this.scene.start("map", { world: i === undefined ? 1 : CAMPAIGN[i].world });
    else this.scene.start(this.request.returnTo);
  }

  private verb(): string {
    return coarsePointer() ? "Tap" : "Press";
  }

  /**
   * Where on screen the camera holds the doughnut. On a boss level it sits
   * further right, so that the dentures chasing it stay in view.
   */
  private screenX(): number {
    return this.level.chaser ? 470 : VIEW.playerScreenX;
  }

  /** Remembers where things stand before a step, for drawing between steps. */
  private holdPrevious(): void {
    this.prevX = this.runner.x;
    this.prevY = this.runner.y;
    this.prevChaserX = this.runner.chaserX;
  }

  private pause(): void {
    if (this.mode !== "running") return;
    this.mode = "paused";
    this.stopSizzles();
    this.holdPointer = null;
    this.pressLatch = false;
    // Resume drawing from where the doughnut stands, not a step behind it.
    this.holdPrevious();
    this.showBanner(`Paused\n${this.verb()} to continue`, 1);
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
        this.hideBanner();
        this.hint.setVisible(false);
        keepAwake();
        break;
      case "ended": {
        if (this.time.now - this.endedAt < END_LOCKOUT_MS) return;
        this.holdPointer = null;
        const next = this.nextLevel();
        if (this.runner.finished && next !== null) {
          this.scene.start("level", { level: CAMPAIGN[next].level, campaignIndex: next, returnTo: this.request.returnTo });
          return;
        }
        this.restart();
        this.mode = "running";
        keepAwake();
        break;
      }
    }
  }

  /** The next level in the same world, if there is one. */
  private nextLevel(): number | null {
    const i = this.request.campaignIndex;
    if (i === undefined || i + 1 >= CAMPAIGN.length) return null;
    return CAMPAIGN[i + 1].world === CAMPAIGN[i].world ? i + 1 : null;
  }

  private restart(): void {
    this.stopSizzles();
    this.runner = createRunner(this.level, this.options);
    this.lean = 0;
    this.holdPrevious();
    this.updatesSinceStart = 0;
    this.accumulator = 0;
    this.stepCount = 0;
    this.pressLatch = false;
    this.hideBanner();
    this.stopEating();
    this.stopVictory();
    this.setDoughnutVisible(true);
    this.sausages.forEach((g) => g.setAlpha(1).setVisible(true));
    this.wiggles.forEach((w) => w.rope.destroy());
    this.wiggles.clear();
    this.shadesOn = false;
    this.tweens.killTweensOf([this.glassDrop, this.glassHop]);
    this.glassDrop.v = 1;
    this.glassHop.v = 0;
    this.glassSpin = false;
    this.cameras.main.setScroll(this.runner.x - this.screenX(), 0);
    this.render(1, 0);
  }

  private onEvent(e: RunnerEvent): void {
    switch (e.type) {
      case "jump":
        sound.jump();
        this.pushOff(1);
        this.hopGlasses();
        this.dust.explode(10, this.runner.x, this.runner.y + DOUGHNUT.outerRadius);
        break;
      case "airJump":
        sound.airJump();
        this.pushOff(0.8);
        this.hopGlasses();
        this.puff.explode(14, this.runner.x, this.runner.y + DOUGHNUT.outerRadius);
        break;
      case "land":
        sound.land();
        this.squash(1.25, 0.8);
        this.dust.explode(16, this.runner.x, this.runner.y + DOUGHNUT.outerRadius);
        this.dustGlitter.explode(6, this.runner.x, this.runner.y + DOUGHNUT.outerRadius);
        break;
      case "launch":
        // Off a ramp's lip: a kick of dust from the edge.
        sound.launch();
        this.pushOff(0.5);
        this.dust.explode(12, this.runner.x, this.runner.y + DOUGHNUT.outerRadius);
        break;
      case "boost":
        sound.boost();
        this.squash(1.3, 0.8);
        this.dustGlitter.explode(14, this.runner.x, this.runner.y + DOUGHNUT.outerRadius);
        this.popText("BOOST!", true);
        break;
      case "grindStart":
        this.sizzles.set(e.index, sound.grind());
        this.sausages[e.index].setAlpha(0.85);
        this.startWiggle(e.index);
        break;
      case "grindEnd": {
        this.sizzles.get(e.index)?.();
        this.sizzles.delete(e.index);
        sound.grade(e.grade, e.chain);
        this.sausages[e.index].setAlpha(0.5);
        const w = this.wiggles.get(e.index);
        if (w) w.end = this.time.now;
        // The grade in bubble letters, and under it the chain and any air
        // combo as plain multipliers whose colour warms as they grow.
        const g = GRADE_TEXT[e.grade];
        const lines = [g.label];
        const colors: (string | null)[] = [null];
        if (e.chain > 1) {
          lines.push(`${e.chain}x`);
          colors.push(multiplierColor(e.chain));
        }
        if (e.airCombo) {
          lines.push(`air ${e.airCombo}x`);
          colors.push(multiplierColor(e.airCombo + 1));
        }
        this.popText(lines.join("\n"), e.grade === "perfect" || e.airCombo > 0, 1, colors);
        break;
      }
      case "save":
        sound.save();
        this.onSave(e);
        break;
      case "die":
        this.deaths += 1;
        this.stopSizzles();
        this.cameras.main.shake(140, 0.006);
        if (e.cause === "sausage") sound.bonk();
        else if (e.cause === "fell") sound.fall();
        else if (e.cause === "wall") sound.splat();
        else if (e.cause === "arrested") sound.siren();
        else sound.clack(0.5);
        this.end();
        {
          const banner = () => this.showBanner(`${DEATH_TEXT[e.cause]}\n${this.verb()} to try again`, 0);
          if (e.cause === "arrested") this.arrestDoughnut(banner);
          else this.eatDoughnut(banner);
        }
        break;
      case "finish": {
        this.stopSizzles();
        sound.fanfare();
        this.end();
        // Worked out now, so the result is saved even if the lap is skipped.
        const text = this.finishText();
        // "Level clear!", the score and the medal are titles; the rest are sentences.
        const medal = medalFor(this.level, this.runner.score);
        this.victoryLap(() => this.showBanner(text, 3, medal));
        break;
      }
    }
  }

  private finishText(): string {
    const score = this.runner.score;
    const medal = medalFor(this.level, score) as Medal;
    const lines = ["Level clear!", `Score ${score}`, MEDAL_TEXT[medal]];
    // What the next medal up asks for, as a sentence after the titles.
    const t = medalTargets(this.level);
    const goal: [string, number] | null =
      medal === "bronze" ? ["silver", t.silver] : medal === "silver" ? ["gold", t.gold] : null;
    if (goal) lines.push(`${goal[1] - score} more for ${goal[0]}`);
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
    cam.scrollX = x - this.screenX();
    // Ease upwards and back down, rather than snapping with every jump.
    const targetY = Math.min(0, y - CAMERA_TOP);
    const ease = 1 - Math.exp(-deltaMs / 120);
    cam.scrollY += (targetY - cam.scrollY) * (deltaMs > 0 ? ease : 1);
    // Faster gears narrow the eyes and lean the ring forward, a little more
    // each gear up to the sunglasses. Only the drawing turns, about the
    // hole's centre, so the hole stays where the runner checks it.
    const running = this.mode === "running" && !s.dead;
    const drive = running ? (s.boostPad >= 0 ? TUNING.gears.length - 1 : s.gear) : 0;
    const targetLean = (drive / (TUNING.gears.length - 1)) * MAX_LEAN;
    this.lean += (targetLean - this.lean) * (deltaMs > 0 ? 1 - Math.exp(-deltaMs / 160) : 1);
    const eyeLevel = Math.min(EYE_LEVELS - 1, drive);
    this.eyes.setTexture(eyeLevel === 0 ? "doughnut-eyes" : `doughnut-eyes-${eyeLevel}`);
    this.back.setPosition(x, y).setRotation(this.lean);
    this.front.setPosition(x, y).setRotation(this.lean);
    this.placeEyesAndSprinkles(x, y);
    this.rustleGrass(x, y, deltaMs);

    const air =
      this.options.airJumps > 0
        ? `Air jump ${"●".repeat(s.airJumpsLeft)}${"○".repeat(this.options.airJumps - s.airJumpsLeft)}   `
        : "";
    const maxFuel = this.options.hover ?? 0;
    const cells = maxFuel > 0 ? Math.ceil((s.hoverFuel / maxFuel) * 5) : 0;
    const float = maxFuel > 0 ? `Float ${"▰".repeat(cells)}${"▱".repeat(5 - cells)}   ` : "";
    layoutHudRow(this.hud.score, "", String(s.score), s.chain > 1 ? `${s.chain}x` : "", multiplierColor(s.chain));
    layoutHudRow(this.hud.deaths, `${air}${float}`, String(this.deaths), "", null);
    // Floating: fluff trails off, and a soft whoosh starts it.
    const hovering = s.hovering && this.mode === "running";
    this.fluff.frequency = hovering ? 40 : -1;
    this.fluff.setPosition(x - 10, y + DOUGHNUT.outerRadius - 10);
    if (hovering && !this.wasHovering) sound.float();
    this.wasHovering = hovering;
    // A boost runs faster than the top gear, so the meter shows it full.
    const boosted = s.boostPad >= 0 && !s.dead;
    this.animateSpeedMeter(boosted ? TUNING.gears.length - 1 : s.gear);
    this.updateShades(s.gear, deltaMs);
    this.updateWiggles(x);
    if (this.boss) {
      const cx = this.prevChaserX + (s.chaserX - this.prevChaserX) * alpha;
      this.boss.update(cx, x, deltaMs, this.mode === "running" || s.dead === "chomped");
    }

    // Food flies up from the point of contact while the doughnut rolls.
    const rolling = this.mode === "running" && s.grounded && !s.dead;
    const rate = rolling ? Math.max(10, 40 - s.gear * 5) : -1;
    this.dust.frequency = rate;
    this.dustGlitter.frequency = rolling ? rate * 3 : -1;
    this.dust.setPosition(x - 4, y + DOUGHNUT.outerRadius - 2);
    this.dustGlitter.setPosition(x - 4, y + DOUGHNUT.outerRadius - 2);
    // The rainbow trail too, only while rolling, from the same point.
    this.trail.frequency = !rolling ? -1 : boosted ? 12 : s.gear >= 1 ? 110 / s.gear : -1;
    this.trail.setPosition(x - 6, y + DOUGHNUT.outerRadius - 3);

    this.debug.clear();
    if (this.showHitboxes) this.drawHitboxes(x, y);
  }

  /**
   * The lit bits turn and bob faster in higher gears. In top gear they glow
   * and a wave runs along them, one bit rising after another, on a loop.
   */
  private animateSpeedMeter(gear: number): void {
    const t = this.time.now / 1000;
    const top = gear === TUNING.gears.length - 1;
    this.gears.forEach(({ bit, glow, baseY }, i) => {
      const lit = i <= gear;
      // Upright, rocking a little from side to side; livelier when lit.
      const sway = lit ? 0.1 + gear * 0.02 : 0.05;
      bit.setRotation(Math.PI / 2 + Math.sin(t * (2 + gear * 0.6) + i * 1.3) * sway);
      let y: number;
      if (top) {
        y = baseY - bit.displayHeight * 0.45 * Math.max(0, Math.sin(t * 5 - i * 0.75));
      } else {
        const amp = lit ? 1 + gear * 0.7 : 0.4;
        y = baseY + Math.sin(t * (1.2 + gear * 0.9) + i * 0.9) * amp;
      }
      bit.setY(y).setAlpha(lit ? 1 : 0.28);
      glow.setVisible(top).setY(y);
      if (top) glow.setAlpha(0.55 + 0.35 * Math.sin(t * 6 - i * 0.75));
    });
  }

  private setDoughnutVisible(visible: boolean): void {
    [this.back, this.front, this.eyes, ...this.sprinkles].forEach((o) => o.setVisible(visible));
  }

  /**
   * Tufts the doughnut is rolling through are pushed flat ahead of it, then
   * spring back up behind it.
   */
  private rustleGrass(x: number, y: number, deltaMs: number): void {
    const ease = deltaMs > 0 ? 1 - Math.exp(-deltaMs / 90) : 1;
    const bottom = y + DOUGHNUT.outerRadius;
    for (const tuft of this.tufts) {
      const d = tuft.x - x;
      if (d < -400 || d > VIEW.width) continue;
      const touching = Math.abs(d) < ART_HALF_WIDTH + 10 && bottom > tuft.y - 30;
      const target = touching ? Phaser.Math.Clamp(-d / (ART_HALF_WIDTH + 10), -1, 1) * 0.5 + 0.25 : 0;
      tuft.rotation += (target - tuft.rotation) * ease;
      if (!touching && Math.abs(tuft.rotation) > 0.01) tuft.rotation += Math.sin(this.time.now / 60) * 0.02 * Math.abs(tuft.rotation);
    }
  }

  /** A sprinkle's place on the ring as it would be without the lean. */
  private unlean(o: Phaser.GameObjects.Image): [number, number] {
    const dx = o.x - this.back.x;
    const dy = o.y - this.back.y;
    const c = Math.cos(-this.lean);
    const n = Math.sin(-this.lean);
    return [dx * c - dy * n, dx * n + dy * c];
  }

  private placeEyesAndSprinkles(x: number, y: number): void {
    // Follow the squash and stretch of the ring itself, and its lean.
    const sx = this.back.scaleX;
    const sy = this.back.scaleY;
    const cosL = Math.cos(this.lean);
    const sinL = Math.sin(this.lean);
    const at = (dx: number, dy: number): [number, number] => [x + dx * cosL - dy * sinL, y + dx * sinL + dy * cosL];
    this.eyes
      .setPosition(...at(EYES_OFFSET.x * sx, EYES_OFFSET.y * sy))
      .setScale(sx, sy)
      .setRotation(this.lean);
    // The sunglasses sit over the eyes, dropping in from above.
    // On a jump they lift clear of the eyes, tilting, then land back.
    const lift = this.glassDrop.v * 140 + this.glassHop.v * 30;
    const [gx, gy] = at((EYES_OFFSET.x + 2) * sx, (EYES_OFFSET.y + 1) * sy);
    this.shades
      .setPosition(gx, gy - lift)
      .setScale(sx * 1.5, sy * 1.5)
      .setRotation(this.lean - 0.35 * this.glassHop.v + (this.glassSpin ? this.glassDrop.v * 7 : 0))
      .setAlpha(1 - this.glassDrop.v * 0.6)
      .setVisible(this.glassDrop.v < 1 && this.eyes.visible);
    const roll = x / ROLL_RADIUS;
    this.sprinkles.forEach((sprinkle, i) => {
      const a = roll + (i / SPRINKLES) * Math.PI * 2;
      const cos = Math.cos(a);
      const sin = Math.sin(a);
      sprinkle
        .setPosition(...at(2 * sx + SPRINKLE_RX * cos * sx, SPRINKLE_RY * sin * sy))
        // Lying along the ring, and behind a passing sausage on the far half.
        .setRotation(this.lean + Math.atan2(SPRINKLE_RY * cos, -SPRINKLE_RX * sin) + (i % 3) * 0.6)
        .setDepth(cos < 0 ? DEPTH.back + 1 : DEPTH.front + 1);
    });
  }

  /**
   * The doughnut pushes off: squashed flat against the ground for an instant,
   * then flung tall, then settling back to its shape.
   */
  private pushOff(strength: number): void {
    const targets = [this.back, this.front];
    this.tweens.killTweensOf(targets);
    targets.forEach((t) => t.setScale(1 + 0.4 * strength, 1 - 0.38 * strength));
    this.tweens.chain({
      targets,
      tweens: [
        { scaleX: 1 - 0.28 * strength, scaleY: 1 + 0.4 * strength, duration: 90, ease: "Quad.easeOut" },
        { scaleX: 1, scaleY: 1, duration: 220, ease: "Back.easeOut" },
      ],
    });
  }

  /**
   * Swaps the doughnut for a snapshot of it as it looked, pinned to the
   * screen, for a death animation to move about.
   */
  private freezeDoughnut(): { image: Phaser.GameObjects.RenderTexture; startX: number; startY: number; W: number; H: number } {
    this.stopEating();
    const cam = this.cameras.main;
    const W = 120;
    const H = 130;
    const startX = this.back.x - cam.scrollX;
    const startY = Phaser.Math.Clamp(this.back.y - cam.scrollY, 60, VIEW.height + 40);
    const image = this.add
      .renderTexture(startX, startY, W, H)
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(DEPTH.hud - 2);
    // Both halves, sprinkles and eyes.
    const topping = this.level.topping;
    image.stamp(`doughnut-back-${topping}`, undefined, W / 2, H / 2);
    image.stamp(`doughnut-front-${topping}`, undefined, W / 2, H / 2);
    for (const s of this.sprinkles) {
      if (s.depth < DEPTH.front) continue;
      const [dx, dy] = this.unlean(s);
      image.stamp("sprinkle", undefined, W / 2 + dx, H / 2 + dy, {
        angle: Phaser.Math.RadToDeg(s.rotation - this.lean),
        tint: s.tintTopLeft,
      });
    }
    image.stamp("doughnut-eyes", undefined, W / 2 + EYES_OFFSET.x, H / 2 + EYES_OFFSET.y);
    this.setDoughnutVisible(false);
    return { image, startX, startY, W, H };
  }

  /**
   * After a skipped sausage the law arrives: an officer's arm in a navy
   * sleeve with gold buttons rises from below, grabs the doughnut in its
   * palm and pulls it down out of sight, under flashing red and blue lights.
   */
  private arrestDoughnut(done: () => void): void {
    const { image, startX, startY } = this.freezeDoughnut();
    const timers: Phaser.Time.TimerEvent[] = [];
    const palmY = startY + DOUGHNUT.outerRadius;
    const arm = this.add
      .image(startX, VIEW.height + 320, "cop-arm")
      .setOrigin(80 / 160, 64 / 300)
      .setScrollFactor(0)
      .setDepth(DEPTH.hud - 3);
    this.eaten = { image, timers, extras: [arm] };

    // Red and blue, turn about, while the arrest lasts.
    for (let i = 0; i < 6; i++) {
      timers.push(
        this.time.delayedCall(i * 230, () => {
          const red = i % 2 === 0;
          this.cameras.main.flash(180, red ? 255 : 60, red ? 50 : 110, red ? 60 : 255, true);
        }),
      );
    }
    this.tweens.chain({
      targets: arm,
      tweens: [
        // Up from below, to the doughnut's underside.
        { y: palmY, duration: 380, ease: "Back.easeOut" },
        // The doughnut is caught: a jolt, and a lift together.
        {
          y: palmY - 18,
          duration: 140,
          ease: "Quad.easeOut",
          onStart: () => {
            this.tweens.add({ targets: image, scaleX: 1.15, scaleY: 0.85, duration: 90, yoyo: true });
            this.tweens.add({ targets: image, y: startY - 18, duration: 140, ease: "Quad.easeOut" });
          },
        },
        // Then a yank: down and out of sight below the screen.
        {
          y: VIEW.height + 380,
          rotation: -0.08,
          duration: 520,
          delay: 260,
          ease: "Back.easeIn",
          onUpdate: () => {
            image.setPosition(arm.x, arm.y - DOUGHNUT.outerRadius).setRotation(arm.rotation);
          },
          onComplete: () => {
            this.stopEating();
            done();
          },
        },
      ],
    });
  }

  /**
   * After a crash the doughnut hops up into the middle of the screen and is
   * eaten away: bite after bite takes a scalloped chunk out of it, each
   * throwing crumbs, until nothing is left. Then the message appears.
   */
  private eatDoughnut(done: () => void): void {
    const { image, startX, startY, W, H } = this.freezeDoughnut();
    const timers: Phaser.Time.TimerEvent[] = [];
    this.eaten = { image, timers, extras: [] };

    // The hop: an arc up and over to the centre, growing as it comes.
    const endX = VIEW.width / 2;
    const endY = VIEW.height / 2 - 10;
    const hop = { t: 0 };
    this.tweens.add({
      targets: hop,
      t: 1,
      duration: 520,
      ease: "Sine.easeInOut",
      onUpdate: () => {
        const t = hop.t;
        image
          .setPosition(startX + (endX - startX) * t, startY + (endY - startY) * t - Math.sin(t * Math.PI) * 110)
          .setScale(1 + t * 0.9)
          .setRotation(Math.sin(t * Math.PI) * 0.25);
      },
    });

    // The bites, working round the ring and then into what is left.
    const bites: [number, number][] = [
      [-0.9, 1],
      [-0.1, 1],
      [0.7, 1],
      [1.6, 1],
      [2.5, 1],
      [3.4, 1],
      [4.4, 1],
      [0.3, 0.35],
      [3.0, 0.3],
    ];
    const first = 620;
    const gap = 150;
    bites.forEach(([angle, reach], i) => {
      timers.push(
        this.time.delayedCall(first + i * gap, () => {
          const lx = W / 2 + Math.cos(angle) * 30 * reach;
          const ly = H / 2 + Math.sin(angle) * 40 * reach;
          image.stamp("bite", undefined, lx, ly, { erase: true, angle: Phaser.Math.RadToDeg(angle), scale: 1.05 });
          sound.crunch();
          // Crumbs fly from where the bite landed on screen.
          const k = image.scaleX;
          const cos = Math.cos(image.rotation);
          const sin = Math.sin(image.rotation);
          const ox = (lx - W / 2) * k;
          const oy = (ly - H / 2) * k;
          this.biteCrumbs.explode(10, image.x + ox * cos - oy * sin, image.y + ox * sin + oy * cos);
          // A little jolt with every chomp.
          this.tweens.add({ targets: image, scaleX: k * 1.08, scaleY: k * 0.92, duration: 60, yoyo: true });
        }),
      );
    });
    timers.push(
      this.time.delayedCall(first + bites.length * gap, () => {
        this.biteCrumbs.explode(16, image.x, image.y);
        this.tweens.add({
          targets: image,
          alpha: 0,
          scale: image.scaleX * 0.6,
          duration: 160,
          onComplete: () => this.stopEating(),
        });
        done();
      }),
    );
  }

  /**
   * Draws the doughnut as it looks right now (both halves, the sprinkles on
   * the near half, the eyes and any sunglasses) onto a canvas, optionally
   * slanted like italic type, and returns it as a texture key.
   */
  private snapshotDoughnut(slant: number): string {
    const W = 200;
    const H = 150;
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
    const cx = W / 2;
    const cy = H / 2;
    // Italic: the top leans forward, the bottom stays where it touches down.
    ctx.setTransform(1, 0, -slant, 1, slant * (cy + DOUGHNUT.outerRadius), 0);
    const draw = (key: string, x: number, y: number, scale = 1) => {
      const src = this.textures.get(key).getSourceImage() as CanvasImageSource & { width: number; height: number };
      ctx.drawImage(src, x - (src.width * scale) / 2, y - (src.height * scale) / 2, src.width * scale, src.height * scale);
    };
    const topping = this.level.topping;
    draw(`doughnut-back-${topping}`, cx, cy);
    draw(`doughnut-front-${topping}`, cx, cy);
    for (const s of this.sprinkles) {
      if (s.depth < DEPTH.front) continue;
      ctx.save();
      const [dx, dy] = this.unlean(s);
      ctx.translate(cx + dx, cy + dy);
      ctx.rotate(s.rotation - this.lean);
      ctx.fillStyle = `#${s.tintTopLeft.toString(16).padStart(6, "0")}`;
      ctx.beginPath();
      ctx.roundRect(-4, -1.5, 8, 3, 1.5);
      ctx.fill();
      ctx.restore();
    }
    draw("doughnut-eyes", cx + EYES_OFFSET.x, cy + EYES_OFFSET.y);
    if (this.shadesOn && this.glassDrop.v < 0.5) {
      draw(this.shades.texture.key, cx + EYES_OFFSET.x + 2, cy + EYES_OFFSET.y + 1, 1.5);
    }
    const key = `victory:${slant}:${this.time.now}`;
    this.textures.addCanvas(key, canvas);
    return key;
  }

  /**
   * At the flag: a celebratory jump with a full spin while sprinkles burst
   * from the flag, then the doughnut leans forward like italic type and
   * dashes off to the right, leaving a long trail of candy sprinkles.
   */
  private victoryLap(done: () => void): void {
    this.stopVictory();
    const upright = this.snapshotDoughnut(0);
    const italic = this.snapshotDoughnut(0.38);
    const x = this.back.x;
    const y = this.back.y;
    this.setDoughnutVisible(false);
    const image = this.add.image(x, y, upright).setDepth(DEPTH.front + 5);
    const trail = this.add
      .particles(0, 0, "pill", { ...VICTORY_TRAIL, quantity: 3 })
      .setDepth(DEPTH.front + 4);
    this.victory = { image, trail, keys: [upright, italic] };

    // Sprinkles burst from the top of the flag.
    const flag = this.add
      .particles(this.level.length + 30, VIEW.groundY - 150, "pill", {
        speed: { min: 150, max: 420 },
        angle: { min: 200, max: 340 },
        gravityY: 600,
        lifespan: 1100,
        rotate: { min: 0, max: 360 },
        scale: { start: 0.9, end: 0.4 },
        tint: [0xff5fa2, 0xffa24a, 0xffd23f, 0x6fd66f, 0x4fb3ff, 0xa87bff, 0xffffff],
        emitting: false,
      })
      .setDepth(DEPTH.front + 4);
    flag.explode(40);
    this.time.delayedCall(1300, () => flag.destroy());

    this.tweens.chain({
      targets: image,
      tweens: [
        // Crouch, then leap with a full spin.
        { scaleX: 1.25, scaleY: 0.75, duration: 90, ease: "Quad.easeOut" },
        { y: y - 130, scaleX: 0.9, scaleY: 1.15, rotation: Math.PI, duration: 300, ease: "Quad.easeOut" },
        { y, scaleX: 1, scaleY: 1, rotation: Math.PI * 2, duration: 260, ease: "Quad.easeIn" },
        // Land, squash, and lean forward into italics.
        {
          scaleX: 1.2,
          scaleY: 0.82,
          duration: 90,
          ease: "Quad.easeOut",
          onStart: () => image.setRotation(0),
          onComplete: () => image.setTexture(italic),
        },
        { scaleX: 1, scaleY: 1, duration: 110, ease: "Back.easeOut" },
        // Off to the right, faster and faster, trailing sprinkles.
        {
          x: x + VIEW.width + 200,
          duration: 750,
          ease: "Cubic.easeIn",
          onStart: () => {
            trail.startFollow(image, -50, 10);
            trail.frequency = 8;
          },
          onComplete: () => {
            trail.frequency = -1;
            image.setVisible(false);
            done();
          },
        },
      ],
    });
  }

  private stopVictory(): void {
    if (!this.victory) return;
    const { image, trail, keys } = this.victory;
    this.tweens.killTweensOf(image);
    image.destroy();
    trail.destroy();
    keys.forEach((k) => this.textures.exists(k) && this.textures.remove(k));
    this.victory = null;
  }

  private stopEating(): void {
    if (!this.eaten) return;
    this.eaten.timers.forEach((t) => t.remove(false));
    this.tweens.killTweensOf(this.eaten.image);
    this.eaten.image.destroy();
    this.eaten.extras.forEach((o) => {
      this.tweens.killTweensOf(o);
      o.destroy();
    });
    this.eaten = null;
  }

  /** With the sunglasses on, a jump pops them off the eyes and they land back. */
  private hopGlasses(): void {
    if (!this.shadesOn) return;
    this.tweens.killTweensOf(this.glassHop);
    this.tweens.chain({
      targets: this.glassHop,
      tweens: [
        { v: 1, duration: 130, ease: "Quad.easeOut" },
        { v: 0, duration: 380, delay: 170, ease: "Bounce.easeOut" },
      ],
    });
  }

  /** The sunglasses took a sausage crash: they spin away and the sausage bursts. */
  private onSave(e: Extract<RunnerEvent, { type: "save" }>): void {
    this.glassSpin = true;
    this.cameras.main.shake(160, 0.008);
    this.crumbs.explode(24, this.runner.x, this.runner.y);
    const sausage = this.sausages[e.index];
    this.crumbs.explode(18, sausage.x + sausage.displayWidth / 2, sausage.y + sausage.displayHeight / 2);
    this.wiggles.get(e.index)?.rope.destroy();
    this.wiggles.delete(e.index);
    sausage.setVisible(false);
    this.popText("SAVED BY THE SHADES!", true);
  }

  /** Puts the sunglasses on in top gear and takes them off below it. */
  private updateShades(gear: number, deltaMs: number): void {
    // They stay on through a finish at top speed, and come off in a crash.
    const top = gear === TUNING.gears.length - 1 && !this.runner.dead;
    if (top !== this.shadesOn) {
      this.shadesOn = top;
      if (top) this.glassSpin = false;
      this.tweens.killTweensOf(this.glassDrop);
      this.tweens.add({
        targets: this.glassDrop,
        v: top ? 0 : 1,
        duration: top ? 420 : 300,
        ease: top ? "Bounce.easeOut" : "Quad.easeIn",
      });
    }
    this.shadesFrame = (this.shadesFrame + deltaMs / 70) % SHADES_FRAMES;
    this.shades.setTexture(`shades-${Math.floor(this.shadesFrame)}`);
  }

  /** Swaps a sausage's image for a bendable copy that can wiggle. */
  private startWiggle(index: number): void {
    const image = this.sausages[index];
    if (this.wiggles.has(index) || !(this.game.renderer instanceof Phaser.Renderer.WebGL.WebGLRenderer)) return;
    const s = this.level.sausages[index];
    const points = Array.from({ length: WIGGLE.points }, (_, i) => new Phaser.Math.Vector2((i / (WIGGLE.points - 1)) * s.length, 0));
    const rope = this.add.rope(s.x, s.y, image.texture.key, undefined, points, true).setDepth(DEPTH.sausage);
    rope.setAlpha(image.alpha);
    image.setVisible(false);
    this.wiggles.set(index, { rope, start: this.time.now, end: null });
  }

  /**
   * The part of a threaded sausage behind the doughnut ripples in a wave that
   * runs away from it; once the doughnut has left, the ripple dies down and
   * the sausage goes back to a plain image.
   */
  private updateWiggles(doughnutX: number): void {
    const t = this.time.now / 1000;
    const exit = doughnutX - ART_HALF_WIDTH * 0.6;
    for (const [index, w] of this.wiggles) {
      const s = this.level.sausages[index];
      const image = this.sausages[index];
      const fade = w.end === null ? 1 : 1 - (this.time.now - w.end) / 1000 / WIGGLE.settle;
      if (fade <= 0) {
        w.rope.destroy();
        image.setVisible(true);
        this.wiggles.delete(index);
        continue;
      }
      w.rope.setAlpha(image.alpha);
      for (const p of w.rope.points) {
        const behind = exit - (s.x + p.x);
        // Only the part that has come out wiggles, growing over a short run.
        const ramp = Phaser.Math.Clamp(behind / 30, 0, 1);
        p.y = ramp * fade * WIGGLE.amplitude * Math.sin((behind / WIGGLE.wavelength) * Math.PI * 2 - t * WIGGLE.speed);
      }
      w.rope.setDirty();
    }
  }

  private squash(sx: number, sy: number): void {
    const targets = [this.back, this.front];
    this.tweens.killTweensOf(targets);
    targets.forEach((t) => t.setScale(sx, sy));
    this.tweens.add({ targets, scaleX: 1, scaleY: 1, duration: 160, ease: "Quad.easeOut" });
  }

  private popText(text: string, big: boolean, titleLines = Infinity, lineColors: (string | null)[] = []): void {
    // Pinned to the screen, since the camera keeps the doughnut in one place.
    const x = this.screenX() + 40;
    // Kept below the score display, which the text drifts towards as it fades.
    const size = (big ? 34 : 27) + (coarsePointer() ? 6 : 0);
    const y = Math.max(170, this.runner.y - this.cameras.main.scrollY - DOUGHNUT.outerRadius - 40);
    const t = showRainbow(this, x, y, text, size, DEPTH.fx, big, "bubbly", titleLines, lineColors);
    const key = t.texture.key;
    const done = () => {
      t.destroy();
      // Scores make most call-outs unique, so their textures are not kept.
      const inUse = this.children.list.some((o) => o instanceof Phaser.GameObjects.Image && o.texture.key === key);
      if (!inUse) this.textures.remove(key);
    };
    this.tweens.add({ targets: t, y: y - 50, alpha: 0, delay: 500, duration: 700, onComplete: done });
  }

  /** Shows a banner whose first `titleLines` lines are titles in the bubble face. */
  private showBanner(text: string, titleLines: number, medal: Medal | null = null): void {
    this.hideBanner();
    const size = coarsePointer() ? 30 : 26;
    this.banner = showRainbow(this, VIEW.width / 2, VIEW.height / 2 - 30, text, size, DEPTH.hud, true, "plain", titleLines);
    if (medal) {
      // The medal drops in above the banner with a bounce.
      // Measured at the banner's full size; it is still growing into place.
      const y = Math.max(60, this.banner.y - this.banner.height / RAINBOW_SCALE / 2 - 44);
      this.medal = this.add.image(VIEW.width / 2, y, `medal-${medal}`).setScrollFactor(0).setDepth(DEPTH.hud).setScale(0);
      this.tweens.add({ targets: this.medal, scale: 1, duration: 520, ease: "Back.easeOut" });
    }
  }

  private hideBanner(): void {
    this.banner?.destroy();
    this.banner = null;
    this.medal?.destroy();
    this.medal = null;
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
