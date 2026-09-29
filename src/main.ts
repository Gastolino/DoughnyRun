import Phaser from "phaser";
import "./page.css";
import { VIEW } from "./logic/tuning";
import { refitOnResize, setUpPage } from "./platform";
import { BootScene } from "./scenes/BootScene";
import { LevelScene } from "./scenes/LevelScene";

function start(): void {
  setUpPage();
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: "stage",
    width: VIEW.width,
    height: VIEW.height,
    backgroundColor: "#ffd6e7",
    // The page centres the canvas with flexbox; Phaser's own centring would
    // add margins on top and push it off-centre.
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.NO_CENTER },
    // Inside the claude.ai frame, grabbing focus at load would close the
    // keyboard of whatever the reader is typing. The scene takes focus on
    // the first press instead.
    autoFocus: false,
    audio: { noAudio: true },
    // The level scene runs its own fixed-step clock and interpolates between
    // steps; Phaser's smoothing would slow the game down at 30 fps.
    fps: { smoothStep: false },
    scene: [BootScene, LevelScene],
  });
  refitOnResize(game);
}

// Inside the claude.ai viewer, boot through its update hook so that a
// republished page restarts cleanly; everywhere else, start at once.
const hot = (window as Window & { claude?: { hot?: { ready?: (boot: () => void) => void } } }).claude?.hot;
if (hot?.ready) hot.ready(start);
else start();
