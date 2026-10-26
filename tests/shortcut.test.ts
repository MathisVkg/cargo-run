import { describe, it, expect } from "vitest";
import { normalizeShortcut, shortcutFromKey } from "../src/utils/shortcut";
import { CaptureShortcut } from "../electron/main/ocr/shortcut";
describe("shortcut validation and recording", () => {
  it("supports standalone function keys and canonicalizes modifier aliases", () => {
    expect(normalizeShortcut("f8")).toBe("F8");
    expect(normalizeShortcut("Control + Shift + s")).toBe("Ctrl+Shift+S");
    expect(() => normalizeShortcut("S")).toThrow();
    expect(() => normalizeShortcut("F")).toThrow();
    expect(() => normalizeShortcut("F12")).toThrow("reserved");
    expect(() => normalizeShortcut("Ctrl+Control+S")).toThrow();
  });
  it("records logical keys rather than substituting a different keyboard-layout character", () => {
    expect(
      shortcutFromKey({
        key: "a",
        code: "KeyQ",
        ctrlKey: true,
        altKey: false,
        shiftKey: false,
        metaKey: false,
        repeat: false,
      }),
    ).toBe("Ctrl+A");
    expect(
      shortcutFromKey({
        key: "F8",
        code: "F8",
        ctrlKey: false,
        altKey: false,
        shiftKey: false,
        metaKey: false,
        repeat: false,
      }),
    ).toBe("F8");
  });
  it("does not record Escape, pure modifiers or key repeat", () => {
    for (const key of ["Escape", "Control", "Shift"])
      expect(
        shortcutFromKey({
          key,
          code: key,
          ctrlKey: false,
          altKey: false,
          shiftKey: false,
          metaKey: false,
          repeat: false,
        }),
      ).toBeNull();
    expect(
      shortcutFromKey({
        key: "F8",
        code: "F8",
        ctrlKey: false,
        altKey: false,
        shiftKey: false,
        metaKey: false,
        repeat: true,
      }),
    ).toBeNull();
  });
  it("does not count registration or stale callbacks as successful invocation", () => {
    let callback = () => {};
    const controller = new CaptureShortcut(
      {
        register: (_key, fn) => {
          callback = fn;
          return true;
        },
        unregister: () => {},
        isRegistered: () => true,
      },
      () => {},
    );
    controller.apply({
      enabled: true,
      accelerator: "F8",
      sounds: false,
      displayId: "auto",
    });
    expect(controller.invocations).toBe(0);
    callback();
    expect(controller.invocations).toBe(1);
    controller.close();
    callback();
    expect(controller.invocations).toBe(1);
  });
});
