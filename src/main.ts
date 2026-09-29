import Phaser from "phaser";
import { VIEW } from "./logic/tuning";
import { BootScene } from "./scenes/BootScene";
import { LevelScene } from "./scenes/LevelScene";

new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  width: VIEW.width,
  height: VIEW.height,
  backgroundColor: "#ffd6e7",
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [BootScene, LevelScene],
});
