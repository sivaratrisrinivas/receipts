// A minimal element builder, so screens read as markup without a framework.

export type Child = Node | string | null | undefined | false;
type Prop = string | number | boolean | EventListener | null | undefined;

/**
 * `h('button', { class: 'primary', onclick: handler }, 'Save')`.
 * `class` sets the class name, `on<event>` adds a listener, `true` sets a bare attribute,
 * and `false`/`null`/`undefined` leave the attribute off.
 */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Record<string, Prop> | null = null,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value === null || value === undefined || value === false) continue;
    if (typeof value === 'function') element.addEventListener(key.replace(/^on/, ''), value);
    else if (key === 'class') element.className = String(value);
    else element.setAttribute(key, value === true ? '' : String(value));
  }
  append(element, children);
  return element;
}

export function append(parent: ParentNode, children: Child[]): void {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    parent.append(child);
  }
}
