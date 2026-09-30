// The game's two faces. Bubble Toy (Solid Bold, by ana & yvy, bundled in
// src/assets/fonts) is for big titles, single words and scores; it is hard
// to read in a sentence. Sentences use Comic Neue Bold, bundled from
// @fontsource/comic-neue.

export const TITLE_FONT = '"Bubble Toy", "Comic Sans MS", cursive';
export const READABLE_FONT = '"Comic Neue", "Comic Sans MS", "Chalkboard SE", cursive';

/**
 * Waits until both faces can be drawn on a canvas, or gives up after a short
 * wait so that a blocked font never stops the game from starting.
 */
export function loadFunFont(): Promise<void> {
  const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
  if (!fonts) return Promise.resolve();
  const wait = Promise.all([fonts.load('32px "Bubble Toy"'), fonts.load('700 32px "Comic Neue"')]).then(() => undefined);
  const timeout = new Promise<void>((resolve) => setTimeout(resolve, 1500));
  return Promise.race([wait, timeout]).catch(() => undefined);
}
