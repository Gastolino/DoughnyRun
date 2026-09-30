import Phaser from "phaser";
import { buildLevel } from "../levels/format";
import { CAMPAIGN } from "../levels/index";
import { TOPPINGS } from "../logic/toppings";
import { VIEW } from "../logic/tuning";
import { bestScore, customLevels, deleteCustomLevel, isUnlocked } from "../progress";
import { h, overlay } from "../ui";
import { drawRainbow, RAINBOW_SCALE } from "./rainbowText";
import type { EditorRequest } from "./EditorScene";
import type { PlayRequest } from "./LevelScene";
import { EYES_OFFSET } from "./BootScene";
import { addSkySprinkles, drawBackdrop, drawGround } from "./draw";

// The title screen: the campaign in order (each level opens when the one
// before it is finished), the player's own levels, and the editor.
export class MenuScene extends Phaser.Scene {
  constructor() {
    super("menu");
  }

  create(): void {
    this.cameras.main.setScroll(0, 0);
    addSkySprinkles(this);
    drawBackdrop(this, VIEW.width);
    drawGround(this, { name: "", length: VIEW.width, topping: "plain", ground: [{ x: 0, width: VIEW.width * 2 }], sausages: [] });
    this.add.image(VIEW.playerScreenX, VIEW.groundY - 48, "doughnut-back-plain");
    this.add.image(VIEW.playerScreenX, VIEW.groundY - 48, "doughnut-front-plain");
    this.add.image(VIEW.playerScreenX + EYES_OFFSET.x, VIEW.groundY - 48 + EYES_OFFSET.y, "doughnut-eyes");

    // Deep links: #demo lets the solver play the first level.
    if (window.location.hash === "#demo") {
      history.replaceState(null, "", window.location.pathname + window.location.search);
      this.play({ level: CAMPAIGN[0].level, campaignIndex: 0, returnTo: "menu", demo: true });
      return;
    }
    this.showMenu();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => document.getElementById("menu")?.remove());
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

  private showMenu(): void {
    const campaign = h(
      "ol",
      { class: "level-list" },
      ...CAMPAIGN.map((c, i) => {
        const open = isUnlocked(i);
        const best = bestScore(c.id);
        const topping = TOPPINGS[c.level.topping];
        return h(
          "li",
          {},
          h(
            "button",
            {
              type: "button",
              class: "level-card",
              disabled: !open,
              onclick: () => this.play({ level: c.level, campaignIndex: i, returnTo: "menu" }),
            },
            h("span", { class: "level-id" }, c.id),
            h("span", { class: "level-name" }, c.level.name),
            h(
              "span",
              { class: "level-meta" },
              open ? `${topping.name} · ${best ? `Best ${best}` : "Not finished yet"}` : `Finish ${CAMPAIGN[i - 1].id} to open`,
            ),
          ),
        );
      }),
    );

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

    overlay(
      "menu",
      h(
        "div",
        { class: "menu-card", role: "dialog", "aria-label": "Doughny Run menu" },
        this.title(),
        h("p", { class: "muted" }, "Thread the sausages through the hole. Grind them dead centre to go faster."),
        h("h2", {}, "Levels"),
        campaign,
        h("h2", {}, "Your levels"),
        custom,
        h("div", { class: "menu-actions" }, h("button", { type: "button", onclick: () => this.edit({}) }, "Open the level editor")),
      ),
    );
  }
}
