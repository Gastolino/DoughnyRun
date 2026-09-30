import Phaser from "phaser";
import {
  buildLevel,
  COCKTAIL_THICKNESS,
  FORMAT_VERSION,
  LevelFormatError,
  LIMITS,
  parseLevelFile,
  RUN_HEIGHT,
  stringifyLevelFile,
} from "../levels/format";
import type { LevelElement, LevelFile } from "../levels/format";
import { reachHeights } from "../logic/reach";
import { runnerOptionsFor, TOPPING_IDS, TOPPINGS } from "../logic/toppings";
import type { ToppingId } from "../logic/toppings";
import { VIEW } from "../logic/tuning";
import { loadDraft, saveCustomLevel, saveDraft } from "../progress";
import { solveAsync } from "../solveAsync";
import { copyText, h, overlay } from "../ui";
import { EYES_OFFSET } from "./BootScene";
import { DEPTH, drawBackdrop, drawFinish, drawGround, drawSausage } from "./draw";

/** Opens the editor on a given level, or on the draft left from last time. */
export interface EditorRequest {
  file?: LevelFile;
}

type Tool = "select" | "sausage" | "gap" | "ramp" | "boost";

type Drag =
  | { kind: "pan"; startX: number; startY: number; scrollX: number; scrollY: number }
  | { kind: "move"; index: number; dx: number; dy: number; moved: boolean }
  | { kind: "resize-left" | "resize-right" | "resize-height"; index: number }
  | { kind: "finish" }
  | { kind: "new-sausage"; index: number; anchor: number }
  | { kind: "new-gap"; index: number; anchor: number };

type Part = "body" | "left" | "right" | "top";

const SNAP = 10;
const EDGE = 10;
const ZOOMS = [1, 0.75, 0.5, 0.35];
const DEFAULT_SAUSAGE = 40;
const DEFAULT_RAMP = { width: 300, height: 80 };
const DEFAULT_BOOST = 160;
const START_X = 80;

const TOOL_HELP: Record<Tool, string> = {
  select: "Drag a sausage, a gap or the finish flag to move it; drag an end to resize. Drag empty sky to scroll.",
  sausage: "Click to place a sausage; drag sideways while placing to set its length.",
  gap: "Drag along the ground to cut a gap.",
  ramp: "Drag along the ground to place a ramp; select it and drag its lip up or down to set its height.",
  boost: "Drag along the ground to lay a speed pad.",
};

/** Length along the ground, whatever the element calls it. */
function sizeOf(e: LevelElement): number {
  return e.type === "sausage" ? e.length : e.width;
}

function minSize(e: LevelElement): number {
  switch (e.type) {
    case "sausage":
      return LIMITS.minSausageLength;
    case "gap":
      return LIMITS.minGapWidth;
    case "ramp":
      return LIMITS.minRampWidth;
    case "boost":
      return LIMITS.minBoostWidth;
  }
}

function setSize(e: LevelElement, v: number): void {
  switch (e.type) {
    case "sausage":
      e.length = clamp(v, LIMITS.minSausageLength, LIMITS.maxSausageLength);
      break;
    case "gap":
      e.width = clamp(v, LIMITS.minGapWidth, LIMITS.maxLength);
      break;
    case "ramp":
      e.width = clamp(v, LIMITS.minRampWidth, LIMITS.maxRampWidth);
      break;
    case "boost":
      e.width = clamp(v, LIMITS.minBoostWidth, LIMITS.maxBoostWidth);
      break;
  }
}

function newLevel(): LevelFile {
  return {
    format: FORMAT_VERSION,
    name: "My level",
    length: 4000,
    topping: "plain",
    elements: [{ type: "sausage", x: 700, y: RUN_HEIGHT, length: 200 }],
  };
}

const snap = (v: number, fine: boolean): number => (fine ? Math.round(v) : Math.round(v / SNAP) * SNAP);
const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
const isTyping = (): boolean => {
  const el = document.activeElement;
  return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement;
};

// The level editor. The level is drawn with the game's own drawing code; the
// tools and fields are page UI above and below it. Every change goes through
// commit(), which records an undo step, saves the draft and redraws.
export class EditorScene extends Phaser.Scene {
  private file: LevelFile = newLevel();
  private selected: number | null = null;
  private tool: Tool = "select";
  private undoStack: string[] = [];
  private redoStack: string[] = [];
  private drag: Drag | null = null;
  private zoomIndex = 0;
  private stuckAt: number | null = null;
  private checking = false;

  private drawn: Phaser.GameObjects.GameObject[] = [];
  private overlayGfx!: Phaser.GameObjects.Graphics;
  private labels: Phaser.GameObjects.Text[] = [];
  private ui!: {
    tools: Record<Tool, HTMLButtonElement>;
    undo: HTMLButtonElement;
    redo: HTMLButtonElement;
    check: HTMLButtonElement;
    name: HTMLInputElement;
    length: HTMLInputElement;
    topping: HTMLSelectElement;
    selection: HTMLElement;
    status: HTMLElement;
  };

  constructor() {
    super("editor");
  }

  init(request: EditorRequest): void {
    const start = request.file ?? loadDraft() ?? newLevel();
    this.file = structuredClone(start);
    if (request.file) saveDraft(this.file);
    this.selected = null;
    this.drag = null;
    this.stuckAt = null;
    this.undoStack = [];
    this.redoStack = [];
  }

  create(): void {
    document.body.classList.add("editing");
    this.buildUi();
    this.overlayGfx = this.add.graphics().setDepth(DEPTH.hud - 1);
    const reach = reachHeights();
    const guide = (text: string) =>
      this.add
        .text(0, 0, text, { fontFamily: "sans-serif", fontSize: "13px", color: "#4a2340", backgroundColor: "#fff1f7cc" })
        .setOrigin(0, 1)
        .setDepth(DEPTH.hud);
    this.labels = [
      guide("Rolling height"),
      guide("Top of one jump"),
      guide("Top of a double jump (glaze)"),
    ];
    this.labels.forEach((l, i) => l.setData("y", [reach.run, reach.single, reach.double][i]));

    this.applyZoom(0);
    this.cameras.main.setScroll(-100, -40);
    this.rebuild();
    this.bindPointer();
    this.bindKeys();
    this.fitAroundPanels();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      document.body.classList.remove("editing");
      document.getElementById("editor-top")?.remove();
      document.getElementById("editor-bottom")?.remove();
      document.getElementById("editor-dialog")?.remove();
      const game = document.getElementById("game");
      if (game) game.style.paddingBlock = "";
    });
  }

  update(): void {
    this.drawOverlay();
  }

  // ---- Level changes -------------------------------------------------------

  private commit(change: () => void, keepCheck = false): void {
    this.undoStack.push(JSON.stringify(this.file));
    if (this.undoStack.length > 200) this.undoStack.shift();
    this.redoStack = [];
    change();
    this.afterChange(keepCheck);
  }

  /** For live dragging: changes the level without a new undo step. */
  private tweak(change: () => void): void {
    change();
    this.afterChange(false);
  }

  private afterChange(keepCheck: boolean): void {
    saveDraft(this.file);
    if (!keepCheck) {
      this.stuckAt = null;
      if (!this.checking) this.setStatus("");
    }
    this.rebuild();
    this.refreshUi();
  }

  private undo(): void {
    const prev = this.undoStack.pop();
    if (!prev) return;
    this.redoStack.push(JSON.stringify(this.file));
    this.file = JSON.parse(prev) as LevelFile;
    this.selected = null;
    this.afterChange(false);
  }

  private redo(): void {
    const next = this.redoStack.pop();
    if (!next) return;
    this.undoStack.push(JSON.stringify(this.file));
    this.file = JSON.parse(next) as LevelFile;
    this.selected = null;
    this.afterChange(false);
  }

  private element(index: number | null): LevelElement | null {
    return index === null ? null : (this.file.elements[index] ?? null);
  }

  private deleteSelected(): void {
    const i = this.selected;
    if (i === null) return;
    this.commit(() => {
      this.file.elements.splice(i, 1);
      this.selected = null;
    });
  }

  private duplicateSelected(): void {
    const e = this.element(this.selected);
    if (!e) return;
    this.commit(() => {
      const copy = { ...e, x: clamp(e.x + 200, 0, this.file.length) };
      this.file.elements.push(copy);
      this.selected = this.file.elements.length - 1;
    });
  }

  private nudge(dx: number, dy: number): void {
    const e = this.element(this.selected);
    if (!e) return;
    this.commit(() => {
      e.x = clamp(e.x + dx, 0, this.file.length);
      if (e.type === "sausage") e.y = clamp(e.y + dy, LIMITS.minY, LIMITS.maxY);
    });
  }

  // ---- Drawing -------------------------------------------------------------

  private rebuild(): void {
    this.drawn.forEach((o) => o.destroy());
    const level = buildLevel(this.file);
    this.drawn = [
      ...drawBackdrop(this, this.file.length),
      ...drawGround(this, level),
      ...level.sausages.map((s) => drawSausage(this, s)),
      drawFinish(this, this.file.length),
    ];
    // Doughnut at the start line, as a size reference.
    const topping = this.file.topping;
    const ref = [
      this.add.image(START_X, RUN_HEIGHT, `doughnut-back-${topping}`),
      this.add.image(START_X, RUN_HEIGHT, `doughnut-front-${topping}`),
      this.add.image(START_X + EYES_OFFSET.x, RUN_HEIGHT + EYES_OFFSET.y, "doughnut-eyes"),
    ];
    ref.forEach((o) => o.setDepth(DEPTH.front).setAlpha(0.9));
    this.drawn.push(...ref);
  }

  private drawOverlay(): void {
    const g = this.overlayGfx;
    const cam = this.cameras.main;
    // The visible world rectangle, from the camera's own screen-to-world
    // mapping; its cached worldView lags a frame behind a zoom change.
    const tl = cam.getWorldPoint(0, 0);
    const br = cam.getWorldPoint(VIEW.width, VIEW.height);
    const view = { x: tl.x, y: tl.y, right: br.x, bottom: br.y };
    g.clear();

    // A light grid every 100 px, heavier every 500 px.
    for (let x = Math.floor(view.x / 100) * 100; x < view.right; x += 100) {
      g.lineStyle(1, 0x4a2340, x % 500 === 0 ? 0.18 : 0.07);
      g.lineBetween(x, view.y, x, view.bottom);
    }

    // Reach guides, so that sausage heights can be judged at a glance.
    const reach = reachHeights();
    const lines: [number, number][] = [
      [reach.run, 0x3c8c5a],
      [reach.single, 0x2f6fbf],
      [reach.double, 0x8a3fbf],
    ];
    for (const [y, color] of lines) {
      g.lineStyle(2, color, 0.55);
      for (let x = view.x; x < view.right; x += 24) g.lineBetween(x, y, Math.min(x + 12, view.right), y);
    }
    this.labels.forEach((l) => {
      l.setPosition(view.x + 8 / cam.zoom, (l.getData("y") as number) - 3 / cam.zoom).setScale(1 / cam.zoom);
    });

    // Where the solver got stuck on the last check.
    if (this.stuckAt !== null) {
      g.lineStyle(3, 0xd7261e, 0.9);
      g.lineBetween(this.stuckAt, view.y, this.stuckAt, view.bottom);
    }

    // The selected element and its handles.
    const e = this.element(this.selected);
    if (e) {
      g.lineStyle(2, 0x1e6fff, 1);
      const hs = 8 / cam.zoom;
      if (e.type === "sausage") {
        const t = e.thickness ?? COCKTAIL_THICKNESS;
        g.strokeRect(e.x - 3, e.y - t / 2 - 3, e.length + 6, t + 6);
        g.fillStyle(0x1e6fff, 1);
        g.fillRect(e.x - hs / 2, e.y - hs / 2, hs, hs);
        g.fillRect(e.x + e.length - hs / 2, e.y - hs / 2, hs, hs);
      } else if (e.type === "ramp") {
        g.strokeRect(e.x, VIEW.groundY - e.height, e.width, e.height);
        g.fillStyle(0x1e6fff, 1);
        g.fillRect(e.x - hs / 2, VIEW.groundY - hs / 2, hs, hs);
        g.fillRect(e.x + e.width - hs / 2, VIEW.groundY - hs / 2, hs, hs);
        g.fillRect(e.x + e.width - hs / 2, VIEW.groundY - e.height - hs / 2, hs, hs);
      } else if (e.type === "boost") {
        g.strokeRect(e.x - 4, VIEW.groundY - 14, e.width + 8, 24);
        g.fillStyle(0x1e6fff, 1);
        g.fillRect(e.x - hs / 2, VIEW.groundY - hs / 2, hs, hs);
        g.fillRect(e.x + e.width - hs / 2, VIEW.groundY - hs / 2, hs, hs);
      } else {
        g.strokeRect(e.x, VIEW.groundY - 6, e.width, VIEW.height - VIEW.groundY + 6);
        g.fillStyle(0x1e6fff, 1);
        g.fillRect(e.x - hs / 2, VIEW.groundY - hs / 2, hs, hs);
        g.fillRect(e.x + e.width - hs / 2, VIEW.groundY - hs / 2, hs, hs);
      }
    }
  }

  // ---- Pointer -------------------------------------------------------------

  private hit(wx: number, wy: number): { index: number; part: Part } | "finish" | null {
    const pad = EDGE / this.cameras.main.zoom;
    if (Math.abs(wx - this.file.length) < pad + 6 && wy > VIEW.groundY - 170 && wy < VIEW.groundY + 10) return "finish";
    for (let i = this.file.elements.length - 1; i >= 0; i--) {
      const e = this.file.elements[i];
      if (e.type !== "sausage") continue;
      const t = e.thickness ?? COCKTAIL_THICKNESS;
      if (Math.abs(wy - e.y) > t / 2 + pad) continue;
      if (Math.abs(wx - e.x) <= pad) return { index: i, part: "left" };
      if (Math.abs(wx - (e.x + e.length)) <= pad) return { index: i, part: "right" };
      if (wx > e.x && wx < e.x + e.length) return { index: i, part: "body" };
    }
    // Speed pads lie on the ground, and ramps stand on it.
    for (let i = this.file.elements.length - 1; i >= 0; i--) {
      const e = this.file.elements[i];
      if (e.type !== "boost" || Math.abs(wy - VIEW.groundY) > 12 + pad) continue;
      if (Math.abs(wx - e.x) <= pad) return { index: i, part: "left" };
      if (Math.abs(wx - (e.x + e.width)) <= pad) return { index: i, part: "right" };
      if (wx > e.x && wx < e.x + e.width) return { index: i, part: "body" };
    }
    for (let i = this.file.elements.length - 1; i >= 0; i--) {
      const e = this.file.elements[i];
      if (e.type !== "ramp") continue;
      const lipY = VIEW.groundY - e.height;
      if (Math.abs(wx - (e.x + e.width)) <= pad * 1.5 && Math.abs(wy - lipY) <= pad * 1.5) return { index: i, part: "top" };
      if (wy < lipY - pad || wy > VIEW.groundY + pad) continue;
      if (Math.abs(wx - e.x) <= pad && wy > VIEW.groundY - pad * 2) return { index: i, part: "left" };
      if (Math.abs(wx - (e.x + e.width)) <= pad) return { index: i, part: "right" };
      const rise = e.height * ((wx - e.x) / e.width) ** 2;
      if (wx > e.x && wx < e.x + e.width && wy >= VIEW.groundY - rise - pad) return { index: i, part: "body" };
    }
    if (wy > VIEW.groundY - pad) {
      for (let i = this.file.elements.length - 1; i >= 0; i--) {
        const e = this.file.elements[i];
        if (e.type !== "gap") continue;
        if (Math.abs(wx - e.x) <= pad) return { index: i, part: "left" };
        if (Math.abs(wx - (e.x + e.width)) <= pad) return { index: i, part: "right" };
        if (wx > e.x && wx < e.x + e.width) return { index: i, part: "body" };
      }
    }
    return null;
  }

  private bindPointer(): void {
    this.input.mouse?.disableContextMenu();
    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      const cam = this.cameras.main;
      const w = cam.getWorldPoint(p.x, p.y);
      const fine = p.event.shiftKey;
      if (p.rightButtonDown() || p.middleButtonDown()) {
        this.drag = { kind: "pan", startX: p.x, startY: p.y, scrollX: cam.scrollX, scrollY: cam.scrollY };
        return;
      }
      if (this.tool === "sausage") {
        const x = clamp(snap(w.x, fine), 0, this.file.length);
        const y = clamp(snap(w.y, fine), LIMITS.minY, LIMITS.maxY);
        this.commit(() => {
          this.file.elements.push({ type: "sausage", x, y, length: DEFAULT_SAUSAGE });
          this.selected = this.file.elements.length - 1;
        });
        this.drag = { kind: "new-sausage", index: this.selected ?? 0, anchor: x };
        return;
      }
      if (this.tool === "gap" || this.tool === "ramp" || this.tool === "boost") {
        const x = clamp(snap(w.x, fine), 0, this.file.length);
        const element: LevelElement =
          this.tool === "gap"
            ? { type: "gap", x, width: LIMITS.minGapWidth }
            : this.tool === "ramp"
              ? { type: "ramp", x, width: DEFAULT_RAMP.width, height: DEFAULT_RAMP.height }
              : { type: "boost", x, width: DEFAULT_BOOST };
        this.commit(() => {
          this.file.elements.push(element);
          this.selected = this.file.elements.length - 1;
        });
        this.drag = { kind: "new-gap", index: this.selected ?? 0, anchor: x };
        return;
      }
      const hit = this.hit(w.x, w.y);
      if (hit === "finish") {
        this.undoStack.push(JSON.stringify(this.file));
        this.redoStack = [];
        this.drag = { kind: "finish" };
        return;
      }
      if (hit) {
        this.selected = hit.index;
        this.undoStack.push(JSON.stringify(this.file));
        this.redoStack = [];
        const e = this.file.elements[hit.index];
        if (hit.part === "body") {
          this.drag = { kind: "move", index: hit.index, dx: w.x - e.x, dy: e.type === "sausage" ? w.y - e.y : 0, moved: false };
        } else {
          const kind = hit.part === "left" ? "resize-left" : hit.part === "top" ? "resize-height" : "resize-right";
          this.drag = { kind, index: hit.index };
        }
        this.refreshUi();
        return;
      }
      this.selected = null;
      this.refreshUi();
      this.drag = { kind: "pan", startX: p.x, startY: p.y, scrollX: cam.scrollX, scrollY: cam.scrollY };
    });

    this.input.on("pointermove", (p: Phaser.Input.Pointer) => {
      const d = this.drag;
      if (!d || !p.isDown) return;
      const cam = this.cameras.main;
      if (d.kind === "pan") {
        cam.setScroll(d.scrollX - (p.x - d.startX) / cam.zoom, d.scrollY - (p.y - d.startY) / cam.zoom);
        this.clampCamera();
        return;
      }
      const w = cam.getWorldPoint(p.x, p.y);
      const fine = p.event.shiftKey;
      const L = this.file.length;
      this.tweak(() => {
        if (d.kind === "finish") {
          this.file.length = clamp(snap(w.x, fine), LIMITS.minLength, LIMITS.maxLength);
          return;
        }
        const e = this.file.elements[d.index];
        if (!e) return;
        const min = minSize(e);
        const x = clamp(snap(w.x, fine), 0, L);
        const current = sizeOf(e);
        switch (d.kind) {
          case "move":
            d.moved = true;
            e.x = clamp(snap(w.x - d.dx, fine), 0, L);
            if (e.type === "sausage") e.y = clamp(snap(w.y - d.dy, fine), LIMITS.minY, LIMITS.maxY);
            break;
          case "resize-left": {
            const right = e.x + current;
            const nx = Math.min(x, right - min);
            e.x = Math.max(0, nx);
            setSize(e, right - e.x);
            break;
          }
          case "resize-right":
            setSize(e, x - e.x);
            break;
          case "resize-height":
            if (e.type === "ramp") {
              e.height = clamp(snap(VIEW.groundY - w.y, fine), LIMITS.minRampHeight, LIMITS.maxRampHeight);
            }
            break;
          case "new-sausage":
          case "new-gap": {
            const lo = Math.min(d.anchor, x);
            const hi = Math.max(d.anchor, x);
            // A click without a drag keeps the element's default size.
            if (hi - lo > SNAP || e.type === "gap" || e.type === "sausage") {
              e.x = lo;
              setSize(e, Math.max(min, hi - lo));
            }
            break;
          }
        }
      });
    });

    const end = () => {
      if (this.drag?.kind === "move" && !this.drag.moved) this.undoStack.pop();
      this.drag = null;
    };
    this.input.on("pointerup", end);
    this.input.on("pointerupoutside", end);

    this.input.on("wheel", (p: Phaser.Input.Pointer, _o: unknown, dx: number, dy: number) => {
      const ev = p.event as WheelEvent;
      if (ev.ctrlKey || ev.metaKey) {
        this.applyZoom(this.zoomIndex + (dy > 0 ? 1 : -1));
        return;
      }
      const cam = this.cameras.main;
      cam.scrollX += (Math.abs(dx) > Math.abs(dy) ? dx : dy) / cam.zoom;
      this.clampCamera();
    });
  }

  private applyZoom(index: number): void {
    this.zoomIndex = clamp(index, 0, ZOOMS.length - 1);
    const cam = this.cameras.main;
    cam.setOrigin(0, 0);
    cam.setZoom(ZOOMS[this.zoomIndex]);
    this.clampCamera();
  }

  private clampCamera(): void {
    const cam = this.cameras.main;
    const viewW = VIEW.width / cam.zoom;
    const viewH = VIEW.height / cam.zoom;
    cam.scrollX = clamp(cam.scrollX, -200, Math.max(-200, this.file.length + 300 - viewW));
    cam.scrollY = clamp(cam.scrollY, LIMITS.minY - 60, Math.max(LIMITS.minY - 60, VIEW.height + 40 - viewH));
  }

  // ---- Keys ----------------------------------------------------------------

  private bindKeys(): void {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping() || document.getElementById("editor-dialog")) return;
      const mod = e.ctrlKey || e.metaKey;
      const step = e.shiftKey ? 1 : SNAP;
      const cam = this.cameras.main;
      let handled = true;
      if (mod && e.key.toLowerCase() === "z") (e.shiftKey ? this.redo() : this.undo());
      else if (mod && e.key.toLowerCase() === "y") this.redo();
      else if (mod && e.key.toLowerCase() === "d") this.duplicateSelected();
      else if (mod) handled = false;
      else if (e.key === "v" || e.key === "V") this.setTool("select");
      else if (e.key === "s" || e.key === "S") this.setTool("sausage");
      else if (e.key === "g" || e.key === "G") this.setTool("gap");
      else if (e.key === "r" || e.key === "R") this.setTool("ramp");
      else if (e.key === "b" || e.key === "B") this.setTool("boost");
      else if (e.key === "Delete" || e.key === "Backspace") this.deleteSelected();
      else if (e.key === "Escape") {
        this.selected = null;
        this.refreshUi();
      } else if (e.key === "p" || e.key === "P") this.playTest(false);
      else if (e.key === "+" || e.key === "=") this.applyZoom(this.zoomIndex - 1);
      else if (e.key === "-") this.applyZoom(this.zoomIndex + 1);
      else if (e.key.startsWith("Arrow")) {
        const dx = e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : 0;
        const dy = e.key === "ArrowUp" ? -1 : e.key === "ArrowDown" ? 1 : 0;
        if (this.selected !== null) this.nudge(dx * step, dy * step);
        else {
          cam.scrollX += dx * 200;
          cam.scrollY += dy * 100;
          this.clampCamera();
        }
      } else handled = false;
      if (handled) e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => window.removeEventListener("keydown", onKey));
  }

  // ---- Actions -------------------------------------------------------------

  private setTool(tool: Tool): void {
    this.tool = tool;
    this.refreshUi();
    this.setStatus(TOOL_HELP[tool]);
  }

  private setStatus(text: string, tone: "plain" | "good" | "bad" = "plain"): void {
    this.ui.status.textContent = text;
    this.ui.status.dataset.tone = tone;
  }

  private validFile(): LevelFile | null {
    try {
      return parseLevelFile(this.file);
    } catch (err) {
      this.setStatus(err instanceof LevelFormatError ? err.message : String(err), "bad");
      return null;
    }
  }

  private playTest(demo: boolean): void {
    const file = this.validFile();
    if (!file) return;
    this.scene.start("level", { level: buildLevel(file), returnTo: "editor", demo });
  }

  private async check(): Promise<void> {
    const file = this.validFile();
    if (!file || this.checking) return;
    this.checking = true;
    this.ui.check.disabled = true;
    this.stuckAt = null;
    this.setStatus("Checking: can the level be finished?");
    const level = buildLevel(file);
    const options = runnerOptionsFor(file.topping);
    const snapshot = JSON.stringify(this.file);
    const clear = await solveAsync(level, options);
    let message: string;
    let tone: "good" | "bad" = "good";
    if (!clear.solvable) {
      message = `Not finishable with ${TOPPINGS[file.topping].name}: the solver gets no further than x = ${Math.round(clear.furthestX)} (red line).`;
      tone = "bad";
      this.stuckAt = clear.furthestX;
    } else if (level.sausages.length === 0) {
      message = "Finishable. There are no sausages to thread yet.";
    } else {
      this.setStatus("Finishable. Checking: can every sausage be threaded in one run?");
      const all = await solveAsync(level, { ...options, mustThread: level.sausages.map((_, i) => i) });
      if (all.solvable) message = "Finishable, and every sausage can be threaded in one run.";
      else {
        message = `Finishable, but not every sausage can be threaded in one run: the best run stops near x = ${Math.round(all.furthestX)} (red line).`;
        this.stuckAt = all.furthestX;
      }
    }
    this.checking = false;
    this.ui.check.disabled = false;
    if (!this.sys.isActive()) return;
    if (JSON.stringify(this.file) !== snapshot) {
      this.stuckAt = null;
      this.setStatus("The level changed during the check. Check again.");
      return;
    }
    this.setStatus(message, tone);
  }

  private save(): void {
    const file = this.validFile();
    if (!file) return;
    saveCustomLevel(file);
    this.setStatus(`Saved "${file.name}" to Your levels in the menu.`, "good");
  }

  private showDialog(title: string, body: HTMLElement[], actions: HTMLElement[]): HTMLElement {
    const close = () => document.getElementById("editor-dialog")?.remove();
    const el = overlay(
      "editor-dialog",
      h(
        "div",
        { class: "dialog", role: "dialog", "aria-label": title },
        h("h2", {}, title),
        ...body,
        h("div", { class: "dialog-actions" }, ...actions, h("button", { type: "button", onclick: close }, "Close")),
      ),
    );
    return el;
  }

  private exportLevel(): void {
    const text = stringifyLevelFile(this.file);
    const area = h("textarea", { id: "export-text", rows: 14, readonly: true, spellcheck: "false" }) as HTMLTextAreaElement;
    area.value = text;
    const note = h(
      "p",
      { class: "muted" },
      "To add it to the game, save this as a .json file in src/levels and list it in src/levels/index.ts, or paste it into Import on another device.",
    );
    const copy = h("button", { type: "button" }, "Copy") as HTMLButtonElement;
    copy.addEventListener("click", () => {
      void copyText(text, area).then((ok) => (copy.textContent = ok ? "Copied" : "Press Ctrl+C to copy"));
    });
    this.showDialog("Export level", [note, area], [copy]);
  }

  private importLevel(): void {
    const area = h("textarea", { id: "import-text", rows: 14, spellcheck: "false", placeholder: "Paste a level's JSON here" }) as HTMLTextAreaElement;
    const error = h("p", { class: "error", role: "alert" });
    const load = h(
      "button",
      {
        type: "button",
        onclick: () => {
          try {
            const file = parseLevelFile(JSON.parse(area.value));
            document.getElementById("editor-dialog")?.remove();
            this.commit(() => {
              this.file = file;
              this.selected = null;
            });
            this.setStatus(`Imported "${file.name}".`, "good");
          } catch (err) {
            error.textContent =
              err instanceof SyntaxError ? "That is not valid JSON." : err instanceof Error ? err.message : String(err);
          }
        },
      },
      "Load",
    );
    this.showDialog("Import level", [area, error], [load]);
    area.focus();
  }

  // ---- Page UI -------------------------------------------------------------

  private buildUi(): void {
    const button = (label: string, onclick: () => void, title?: string) =>
      h("button", { type: "button", onclick, title }, label) as HTMLButtonElement;
    const tools = {
      select: button("Select", () => this.setTool("select"), "Select and drag (V)"),
      sausage: button("Sausage", () => this.setTool("sausage"), "Place sausages (S)"),
      gap: button("Gap", () => this.setTool("gap"), "Cut gaps (G)"),
      ramp: button("Ramp", () => this.setTool("ramp"), "Place kicker ramps (R)"),
      boost: button("Speed pad", () => this.setTool("boost"), "Lay speed pads (B)"),
    };
    const undo = button("Undo", () => this.undo(), "Undo (Ctrl+Z)");
    const redo = button("Redo", () => this.redo(), "Redo (Ctrl+Shift+Z)");
    const check = button("Check", () => void this.check(), "Ask the solver whether the level can be finished");

    const name = h("input", { id: "level-name", type: "text", maxlength: 60, "aria-label": "Level name" }) as HTMLInputElement;
    name.addEventListener("change", () => {
      const v = name.value.trim();
      if (v) this.commit(() => (this.file.name = v), true);
      else name.value = this.file.name;
    });
    const length = h("input", {
      id: "level-length",
      type: "number",
      min: LIMITS.minLength,
      max: LIMITS.maxLength,
      step: 100,
      "aria-label": "Level length",
    }) as HTMLInputElement;
    length.addEventListener("change", () => {
      const v = Number(length.value);
      if (Number.isFinite(v)) this.commit(() => (this.file.length = clamp(Math.round(v), LIMITS.minLength, LIMITS.maxLength)));
    });
    const topping = h(
      "select",
      { id: "level-topping", "aria-label": "Topping" },
      ...TOPPING_IDS.map((id) => h("option", { value: id }, `${TOPPINGS[id].name} (${TOPPINGS[id].power.split(":")[0].toLowerCase()})`)),
    ) as HTMLSelectElement;
    topping.addEventListener("change", () => this.commit(() => (this.file.topping = topping.value as ToppingId)));

    const top = h(
      "div",
      { id: "editor-top", class: "editor-bar" },
      h("div", { class: "group", role: "group", "aria-label": "Tools" }, tools.select, tools.sausage, tools.gap, tools.ramp, tools.boost),
      h("div", { class: "group" }, undo, redo),
      h(
        "div",
        { class: "group" },
        button("Zoom in", () => this.applyZoom(this.zoomIndex - 1), "Zoom in (+)"),
        button("Zoom out", () => this.applyZoom(this.zoomIndex + 1), "Zoom out (−)"),
      ),
      h(
        "div",
        { class: "group" },
        check,
        button("Play", () => this.playTest(false), "Play-test from the start (P)"),
        button("Watch solver", () => this.playTest(true), "Let the solver play the level"),
      ),
      h(
        "div",
        { class: "group" },
        button("Save", () => this.save(), "Save to Your levels"),
        button("Export", () => this.exportLevel()),
        button("Import", () => this.importLevel()),
        button(
          "New",
          () =>
            this.commit(() => {
              this.file = newLevel();
              this.selected = null;
            }),
          "Start a new level (Undo brings the old one back)",
        ),
        button("Menu", () => this.scene.start("menu")),
      ),
    );

    const selection = h("div", { class: "group selection" });
    const status = h("p", { id: "editor-status", role: "status" });
    const bottom = h(
      "div",
      { id: "editor-bottom", class: "editor-bar" },
      h(
        "div",
        { class: "group" },
        h("label", { for: "level-name" }, "Name"),
        name,
        h("label", { for: "level-length" }, "Length"),
        length,
        h("label", { for: "level-topping" }, "Topping"),
        topping,
      ),
      selection,
      status,
    );
    for (const bar of [top, bottom]) {
      document.getElementById(bar.id)?.remove();
      document.body.append(bar);
    }
    this.ui = { tools, undo, redo, check, name, length, topping, selection, status };
    this.refreshUi();
    this.setStatus(TOOL_HELP.select);
  }

  /** Pads the game area so the canvas sits between the two bars. */
  private fitAroundPanels(): void {
    const game = document.getElementById("game");
    const topBar = document.getElementById("editor-top");
    const bottomBar = document.getElementById("editor-bottom");
    if (!game || !topBar || !bottomBar) return;
    const fit = () => {
      game.style.paddingBlock = `${topBar.offsetHeight}px ${bottomBar.offsetHeight}px`;
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(topBar);
    ro.observe(bottomBar);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => ro.disconnect());
  }

  private refreshUi(): void {
    const ui = this.ui;
    for (const [tool, btn] of Object.entries(ui.tools)) btn.setAttribute("aria-pressed", String(tool === this.tool));
    ui.undo.disabled = this.undoStack.length === 0;
    ui.redo.disabled = this.redoStack.length === 0;
    if (document.activeElement !== ui.name) ui.name.value = this.file.name;
    if (document.activeElement !== ui.length) ui.length.value = String(this.file.length);
    ui.topping.value = this.file.topping;

    const e = this.element(this.selected);
    ui.selection.replaceChildren();
    if (!e) {
      ui.selection.append(h("span", { class: "muted" }, "Nothing selected"));
      return;
    }
    const field = (label: string, key: string, value: number, min: number, max: number) => {
      const id = `sel-${key}`;
      const input = h("input", { id, type: "number", value, min, max, step: 1 }) as HTMLInputElement;
      input.addEventListener("change", () => {
        const v = Number(input.value);
        const cur = this.element(this.selected);
        if (!cur || !Number.isFinite(v)) return;
        this.commit(() => {
          (cur as unknown as Record<string, number>)[key] = clamp(Math.round(v), min, max);
        });
      });
      return [h("label", { for: id }, label), input];
    };
    const L = this.file.length;
    const titles = { sausage: "Sausage", gap: "Gap", ramp: "Ramp", boost: "Speed pad" } as const;
    ui.selection.append(h("strong", {}, titles[e.type]));
    switch (e.type) {
      case "sausage":
        ui.selection.append(
          ...field("x", "x", e.x, 0, L),
          ...field("y", "y", e.y, LIMITS.minY, LIMITS.maxY),
          ...field("Length", "length", e.length, LIMITS.minSausageLength, LIMITS.maxSausageLength),
        );
        break;
      case "gap":
        ui.selection.append(...field("x", "x", e.x, 0, L), ...field("Width", "width", e.width, LIMITS.minGapWidth, LIMITS.maxLength));
        break;
      case "ramp":
        ui.selection.append(
          ...field("x", "x", e.x, 0, L),
          ...field("Width", "width", e.width, LIMITS.minRampWidth, LIMITS.maxRampWidth),
          ...field("Height", "height", e.height, LIMITS.minRampHeight, LIMITS.maxRampHeight),
        );
        break;
      case "boost":
        ui.selection.append(...field("x", "x", e.x, 0, L), ...field("Width", "width", e.width, LIMITS.minBoostWidth, LIMITS.maxBoostWidth));
        break;
    }
    ui.selection.append(
      h("button", { type: "button", onclick: () => this.duplicateSelected(), title: "Duplicate (Ctrl+D)" }, "Duplicate"),
      h("button", { type: "button", onclick: () => this.deleteSelected(), title: "Delete (Del)" }, "Delete"),
    );
  }
}
