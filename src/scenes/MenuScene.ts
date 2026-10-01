import Phaser from "phaser";
import { buildLevel } from "../levels/format";
import { CAMPAIGN } from "../levels/index";
import { TOPPINGS } from "../logic/toppings";
import { customLevels, deleteCustomLevel } from "../progress";
import { h, overlay } from "../ui";
import { drawRainbow, RAINBOW_SCALE } from "./rainbowText";
import type { EditorRequest } from "./EditorScene";
import type { PlayRequest } from "./LevelScene";
import { drawTitleBackdrop } from "./titleBackdrop";

// The title screen: Doughnys rolling over wavy levels that stretch to the
// horizon, the title in front and Start under it, which leads straight into
// World 1. The player's own levels and the editor sit behind a small button.
export class MenuScene extends Phaser.Scene {
  constructor() {
    super("menu");
  }

  create(): void {
    this.cameras.main.setScroll(0, 0);
    drawTitleBackdrop(this);

    // Deep links: #demo lets the solver play the first level, and #demo-1-2
    // (any campaign id) plays that level.
    const demo = /^#demo(?:-(.+))?$/.exec(window.location.hash);
    if (demo) {
      history.replaceState(null, "", window.location.pathname + window.location.search);
      const index = Math.max(0, CAMPAIGN.findIndex((c) => c.id === (demo[1] ?? CAMPAIGN[0].id)));
      this.play({ level: CAMPAIGN[index].level, campaignIndex: index, returnTo: "menu", demo: true });
      return;
    }
    this.showTitle();
    const start = () => {
      if (!document.getElementById("menu-extras")) this.start();
    };
    this.input.keyboard?.on("keydown-ENTER", start);
    this.input.keyboard?.on("keydown-SPACE", start);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      document.getElementById("menu")?.remove();
      document.getElementById("menu-extras")?.remove();
    });
  }

  /** Straight into World 1's map. */
  private start(): void {
    this.scene.start("map", { world: 1 });
  }

  /** The title over the moving landscape, with Start under it. */
  private showTitle(): void {
    overlay(
      "menu",
      h(
        "div",
        { class: "title-screen" },
        this.title(),
        h("button", { type: "button", class: "start-button", onclick: () => this.start() }, "Start"),
        h("button", { type: "button", class: "small extras-button", onclick: () => this.showMenu() }, "Your levels and the editor"),
      ),
    );
    (document.querySelector(".start-button") as HTMLButtonElement | null)?.focus({ preventScroll: true });
  }

  private play(request: PlayRequest): void {
    this.scene.start("level", request);
  }

  private edit(request: EditorRequest): void {
    this.scene.start("editor", request);
  }

  /** The rainbow title, landing with a splash of sugar sprinkles. */
  private title(): HTMLElement {
    const canvas = drawRainbow("Doughny Run", 44);
    const img = h("img", {
      src: canvas.toDataURL(),
      alt: "Doughny Run",
      width: Math.round(canvas.width / RAINBOW_SCALE),
      height: Math.round(canvas.height / RAINBOW_SCALE),
    });
    const heading = h("h1", { class: "title" }, img);
    const colors = ["#ff5fa2", "#ffa24a", "#ffd23f", "#6fd66f", "#4fb3ff", "#a87bff", "#ffffff"];
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!reduced) {
      for (let i = 0; i < 28; i++) {
        const angle = (i / 28) * Math.PI * 2 + Math.random() * 0.3;
        const dist = 70 + Math.random() * 110;
        const bit = h("span", { class: "title-sprinkle", "aria-hidden": "true" });
        bit.style.background = colors[i % colors.length];
        bit.style.setProperty("--dx", `${Math.cos(angle) * dist * 1.6}px`);
        bit.style.setProperty("--dy", `${Math.sin(angle) * dist}px`);
        bit.style.setProperty("--r", `${Math.round(Math.random() * 540 - 270)}deg`);
        bit.style.animationDelay = `${Math.random() * 80}ms`;
        heading.append(bit);
      }
    }
    return heading;
  }

  /** The player's own levels and the way into the editor, over the title. */
  private showMenu(): void {
    const mine = customLevels();
    const custom = mine.length
      ? h(
          "ul",
          { class: "level-list" },
          ...mine.map((file) =>
            h(
              "li",
              { class: "custom-row" },
              h(
                "button",
                {
                  type: "button",
                  class: "level-card",
                  onclick: () => this.play({ level: buildLevel(file), returnTo: "menu" }),
                },
                h("span", { class: "level-name" }, file.name),
                h("span", { class: "level-meta" }, `${TOPPINGS[file.topping].name} · ${file.elements.length} elements`),
              ),
              h("button", { type: "button", class: "small", onclick: () => this.edit({ file }) }, "Edit"),
              h(
                "button",
                {
                  type: "button",
                  class: "small",
                  "aria-label": `Delete ${file.name}`,
                  onclick: () => {
                    deleteCustomLevel(file.name);
                    this.showMenu();
                  },
                },
                "Delete",
              ),
            ),
          ),
        )
      : h("p", { class: "muted" }, "Levels you save in the editor appear here.");

    const close = () => document.getElementById("menu-extras")?.remove();
    const card = overlay(
      "menu-extras",
      h(
        "div",
        { class: "menu-card", role: "dialog", "aria-label": "Your levels and the editor" },
        h("h2", {}, "Your levels"),
        custom,
        h(
          "div",
          { class: "menu-actions" },
          h("button", { type: "button", onclick: () => this.edit({}) }, "Open the level editor"),
          h("button", { type: "button", onclick: close }, "Close"),
        ),
      ),
    );
    card.addEventListener("click", (e) => {
      if (e.target === card) close();
    });
  }
}
