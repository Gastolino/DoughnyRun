// The game's faces. Bubble Toy (by ana & yvy, bundled in src/assets/fonts)
// is for big titles, single words and scores; it is hard to read in a
// sentence. Its Outline Bold cut traces the same letters as Solid Bold, so
// the two stack exactly: the solid face is filled in colour and the outline
// face drawn over it in ink. Sentences use Comic Neue Bold, a Comic Sans
// look-alike bundled from @fontsource/comic-neue, because phones do not all
// have Comic Sans.

export const TITLE_FONT = '"Bubble Toy", "Comic Sans MS", cursive';
export const OUTLINE_FONT = '"Bubble Toy Outline", "Comic Sans MS", cursive';
/** The dark ink of the outline face and of the outer edge around lettering. */
export const INK = "#26131f";
export const READABLE_FONT = '"Comic Neue", "Comic Sans MS", "Chalkboard SE", cursive';

/**
 * Waits until the faces can be drawn on a canvas, or gives up after a short
 * wait so that a blocked font never stops the game from starting.
 */
export function loadFunFont(): Promise<void> {
  const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
  if (!fonts) return Promise.resolve();
  const wait = Promise.all([
    fonts.load('32px "Bubble Toy"'),
    fonts.load('32px "Bubble Toy Outline"'),
    fonts.load('700 32px "Comic Neue"'),
  ]).then(() => undefined);
  const timeout = new Promise<void>((resolve) => setTimeout(resolve, 1500));
  return Promise.race([wait, timeout]).catch(() => undefined);
}
