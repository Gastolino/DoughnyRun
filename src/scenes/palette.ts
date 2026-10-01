// Greybox colours. They exist to make the scene readable, not to be the art.
export const COLORS = {
  sky: 0xffd6e7,
  hillFar: 0xf7b6cf,
  hillNear: 0xef9fbf,
  dough: 0xe0a458,
  doughShade: 0xb97a36,
  icing: 0xff7eb6,
  glaze: 0x5b3120,
  glazeShine: 0xb07a5a,
  vanilla: 0xfff3e6,
  marshmallow: 0xd9c2ff,
  ground: 0x8a5a3c,
  groundTop: 0xfff1f7,
  sausage: 0xc97447,
  sausageShade: 0x8c4526,
  sausageShine: 0xeba57c,
  ketchup: 0xd7261e,
  mayo: 0xfff3d1,
  text: "#4a2340",
} as const;

export const SPRINKLE_COLORS = [0xffffff, 0x7ec8ff, 0xfff27e, 0x9dff7e, 0xb58cff, 0xff9f5a] as const;

export const css = (c: number): string => `#${c.toString(16).padStart(6, "0")}`;

/** Brighter sprinkles for the rainbow topping. */
export const RAINBOW_SPRINKLES = [0xff3d8b, 0xff9a2e, 0xffd23f, 0x4fd66f, 0x3fa9ff, 0x9a6bff] as const;
