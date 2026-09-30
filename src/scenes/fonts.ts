// The game's lettering: Comic Sans where the device has it, and Comic Neue,
// a close match bundled with the game, where it does not (phones mostly).

export const FUN_FONT = '"Comic Sans MS", "Comic Neue", "Chalkboard SE", "Comic Sans", cursive';

/**
 * Waits until the bold face can be drawn on a canvas, or gives up after a
 * short wait so that a blocked font never stops the game from starting.
 */
export function loadFunFont(): Promise<void> {
  const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
  if (!fonts) return Promise.resolve();
  const wait = Promise.all([fonts.load('700 32px "Comic Neue"'), fonts.load('700 32px "Comic Sans MS"')]).then(() => undefined);
  const timeout = new Promise<void>((resolve) => setTimeout(resolve, 1500));
  return Promise.race([wait, timeout]).catch(() => undefined);
}
