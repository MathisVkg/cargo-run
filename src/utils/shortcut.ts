export function normalizeShortcut(input: string): string {
  const parts = input
      .trim()
      .split("+")
      .map((p) => p.trim()),
    keyText = parts.pop() ?? "";
  const aliases: Record<string, string> = {
    ctrl: "Ctrl",
    control: "Ctrl",
    commandorcontrol: "Ctrl",
    alt: "Alt",
    shift: "Shift",
    super: "Super",
    meta: "Super",
  };
  const modifiers = parts.map((p) => aliases[p.toLowerCase()]);
  const key = /^f(?:[1-9]|1\d|2[0-4])$/i.test(keyText)
    ? keyText.toUpperCase()
    : /^[a-z0-9]$/i.test(keyText)
      ? keyText.toUpperCase()
      : null;
  if (
    !key ||
    modifiers.some((p) => !p) ||
    modifiers.length > 3 ||
    new Set(modifiers).size !== modifiers.length
  )
    throw Error(
      "Use F8/F9, or Ctrl/Alt plus a letter, digit or function key. Duplicate modifiers are not supported.",
    );
  if (key === "F12")
    throw Error(
      "F12 is reserved by Windows debugging. Choose another function key, such as F8.",
    );
  if (
    !/^F\d+$/.test(key) &&
    !modifiers.includes("Ctrl") &&
    !modifiers.includes("Alt")
  )
    throw Error(
      "Letters and digits require Ctrl or Alt. Standalone function keys such as F8 are supported.",
    );
  return [
    ...["Ctrl", "Alt", "Shift", "Super"].filter((m) => modifiers.includes(m)),
    key,
  ].join("+");
}
export interface RecordedKey {
  key: string;
  code: string;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
  repeat: boolean;
}
export function shortcutFromKey(event: RecordedKey): string | null {
  if (
    event.repeat ||
    ["Control", "Alt", "Shift", "Meta", "AltGraph", "Escape", "Tab"].includes(
      event.key,
    )
  )
    return null;
  const key = /^F(?:[1-9]|1\d|2[0-4])$/i.test(event.key)
    ? event.key
    : /^[a-z0-9]$/i.test(event.key)
      ? event.key
      : "Unsupported";
  return normalizeShortcut(
    [
      event.ctrlKey ? "Ctrl" : "",
      event.altKey ? "Alt" : "",
      event.shiftKey ? "Shift" : "",
      event.metaKey ? "Super" : "",
      key,
    ]
      .filter(Boolean)
      .join("+"),
  );
}
