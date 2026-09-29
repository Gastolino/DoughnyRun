// Greybox colours. They exist to make the scene readable, not to be the art.
export const COLORS = {
  sky: 0xffd6e7,
  hillFar: 0xf7b6cf,
  hillNear: 0xef9fbf,
  dough: 0xe0a458,
  doughShade: 0xb97a36,
  icing: 0xff7eb6,
  ground: 0x8a5a3c,
  groundTop: 0xfff1f7,
  sausage: 0xc0503a,
  sausageShade: 0x8e3424,
  sausageShine: 0xe98a6f,
  hurdle: 0x9c3f2c,
  text: "#4a2340",
} as const;

export const css = (c: number): string => `#${c.toString(16).padStart(6, "0")}`;
