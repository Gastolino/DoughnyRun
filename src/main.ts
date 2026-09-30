import Phaser from "phaser";
// Comic Neue, for sentences; Bubble Toy is declared in page.css.
import "@fontsource/comic-neue/latin-700.css";
import "./page.css";
import { VIEW } from "./logic/tuning";
import { refitOnResize, setUpPage } from "./platform";
import { BootScene } from "./scenes/BootScene";
import { EditorScene } from "./scenes/EditorScene";
import { LevelScene } from "./scenes/LevelScene";
import { MapScene } from "./scenes/MapScene";
import { MenuScene } from "./scenes/MenuScene";
import { unlockAudioOnFirstPress } from "./sound";

function start(): void {
  setUpPage();
  unlockAudioOnFirstPress();
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
    // Sound comes from src/sound.ts, which synthesises everything itself.
    audio: { noAudio: true },
    // The level scene runs its own fixed-step clock and interpolates between
    // steps; Phaser's smoothing would slow the game down at 30 fps.
    fps: { smoothStep: false },
    scene: [BootScene, MenuScene, MapScene, LevelScene, EditorScene],
  });
  refitOnResize(game);
}

// Inside the claude.ai viewer, boot through its update hook so that a
// republished page restarts cleanly; everywhere else, start at once.
const hot = (window as Window & { claude?: { hot?: { ready?: (boot: () => void) => void } } }).claude?.hot;
if (hot?.ready) hot.ready(start);
else start();
