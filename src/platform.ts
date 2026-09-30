import Phaser from "phaser";

// Everything the game needs from the page around it: touch handling for the
// letterbox, the prompt to turn a phone sideways, a screen that stays awake,
// and a canvas that refits after rotation.

/** True on phones and tablets, where the finger is the only jump button. */
export const coarsePointer = (): boolean => window.matchMedia("(pointer: coarse)").matches;

const portrait = window.matchMedia("(orientation: portrait)");
let portraitDismissed = false;
const blockedListeners: ((blocked: boolean) => void)[] = [];

// Inside a frame, the orientation media query reports the frame's shape. A
// landscape tablet showing the game in a narrow panel cannot fix that by
// turning, so the prompt also needs the screen itself to be portrait.
const screenPortrait = (): boolean => screen.orientation?.type.startsWith("portrait") ?? portrait.matches;

/** True while the rotate prompt covers the game. */
export function isBlocked(): boolean {
  return coarsePointer() && portrait.matches && screenPortrait() && !portraitDismissed;
}

/** Calls the listener when the rotate prompt appears or goes; returns an unsubscribe. */
export function onBlockedChange(listener: (blocked: boolean) => void): () => void {
  blockedListeners.push(listener);
  return () => {
    const i = blockedListeners.indexOf(listener);
    if (i >= 0) blockedListeners.splice(i, 1);
  };
}

export function gameElement(): HTMLElement {
  const el = document.getElementById("game");
  if (!el) throw new Error("Missing #game element");
  return el;
}

export function setUpPage(): void {
  const game = gameElement();
  // Phaser fits the canvas to its parent's border box, padding included, so
  // it gets an unpadded stage inside #game. #game keeps the gutter and stays
  // the jump button.
  const stage = document.createElement("div");
  stage.id = "stage";
  game.append(stage);

  // Phaser cancels the browser's default handling of touches on the canvas
  // only. The letterbox bars count as jump buttons too, so they get the same
  // treatment; this stops the iOS magnifier, double-tap zoom and emulated
  // mouse events there. The game reads presses from pointer events, which
  // the browser dispatches before these touch events.
  const cancel = (e: TouchEvent) => {
    if (e.cancelable) e.preventDefault();
  };
  for (const type of ["touchstart", "touchmove", "touchend"] as const) {
    game.addEventListener(type, cancel, { passive: false });
  }

  const prompt = document.createElement("div");
  prompt.id = "rotate";
  prompt.innerHTML =
    '<div class="phone" aria-hidden="true"></div>' +
    "<p>Turn your phone sideways to play.</p>" +
    '<button type="button" id="play-portrait">Play in portrait</button>';
  document.body.append(prompt);
  prompt.querySelector("button")?.addEventListener("click", () => {
    portraitDismissed = true;
    sync();
  });

  const sync = () => {
    const blocked = isBlocked();
    prompt.hidden = !blocked;
    blockedListeners.forEach((l) => l(blocked));
  };
  portrait.addEventListener("change", sync);
  screen.orientation?.addEventListener("change", sync);
  window.matchMedia("(pointer: coarse)").addEventListener("change", sync);
  sync();
}

/**
 * Phaser refits the canvas on orientation change using the parent size it
 * cached before the rotation, so at top level the canvas keeps the old
 * orientation's size. Observing the parent refits it from the new size.
 */
export function refitOnResize(game: Phaser.Game): void {
  const refit = () => {
    if (!game.isBooted) return;
    game.scale.getParentBounds();
    game.scale.refresh();
  };
  new ResizeObserver(refit).observe(document.getElementById("stage") ?? gameElement());
  // Two quick turns with no frame between them never reach the observer.
  const later = () => requestAnimationFrame(refit);
  window.addEventListener("resize", later);
  screen.orientation?.addEventListener("change", later);
}

interface WakeLockSentinelLike {
  released: boolean;
}
let wakeLock: WakeLockSentinelLike | null = null;

/** Asks the phone not to dim during play. Refusal is harmless. */
export function keepAwake(): void {
  const nav = navigator as Navigator & {
    wakeLock?: { request(type: "screen"): Promise<WakeLockSentinelLike> };
  };
  if (!nav.wakeLock || (wakeLock && !wakeLock.released)) return;
  nav.wakeLock
    .request("screen")
    .then((lock) => (wakeLock = lock))
    .catch(() => undefined);
}
