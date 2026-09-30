// The game's lettering: Bubble Toy (Solid Bold, by ana & yvy), bundled with
// the game in src/assets/fonts and declared in page.css.

export const FUN_FONT = '"Bubble Toy", "Comic Sans MS", cursive';

/**
 * Waits until the bold face can be drawn on a canvas, or gives up after a
 * short wait so that a blocked font never stops the game from starting.
 */
export function loadFunFont(): Promise<void> {
  const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
  if (!fonts) return Promise.resolve();
  const wait = fonts.load('32px "Bubble Toy"').then(() => undefined);
  const timeout = new Promise<void>((resolve) => setTimeout(resolve, 1500));
  return Promise.race([wait, timeout]).catch(() => undefined);
}
