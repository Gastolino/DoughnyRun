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
