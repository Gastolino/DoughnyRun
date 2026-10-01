// A small helper for the page UI around the game (menu, editor panels, back
// button), which is plain HTML so that it stays readable and accessible.

type Attrs = Record<string, string | number | boolean | EventListener | undefined>;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: (Node | string | null | undefined | false)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === false) continue;
    if (key.startsWith("on") && typeof value === "function") el.addEventListener(key.slice(2), value);
    else if (key === "class") el.className = String(value);
    else if (value === true) el.setAttribute(key, "");
    else el.setAttribute(key, String(value));
  }
  for (const c of children) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
}

const BUBBLE_COLORS = ["#ff4a64", "#ff8f2e", "#ffd23f", "#4fd66f", "#4fb3ff", "#a87bff", "#ff6fc6"];

/**
 * A word in the game's lettering: Bubble Toy letters in rainbow colours with
 * a white and a dark ring, and the outline cut laid over them in ink (see
 * .bubble in page.css). The plain text stays in the element for readers.
 */
export function bubbleText(text: string): HTMLSpanElement {
  let i = 0;
  const letters = [...text].map((ch) => {
    const span = h("span", { "aria-hidden": "true" }, ch);
    if (ch.trim()) span.style.color = BUBBLE_COLORS[i++ % BUBBLE_COLORS.length];
    return span;
  });
  const el = h("span", { class: "bubble", "data-text": text }, ...letters);
  el.setAttribute("aria-label", text);
  return el;
}

/** A layer of page UI above the game, removed as a whole when a scene ends. */
export function overlay(id: string, ...children: Node[]): HTMLElement {
  document.getElementById(id)?.remove();
  const el = h("div", { id, class: "overlay" }, ...children);
  document.body.append(el);
  return el;
}

/** Copies text, falling back to selecting it for the reader to copy by hand. */
export async function copyText(text: string, fallback: HTMLTextAreaElement): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    fallback.focus();
    fallback.select();
    return false;
  }
}
