import { useEffect, useState } from "react";
import { Keyboard } from "lucide-react";
import { useOcrStore } from "../../stores/useOcrStore";
import { Badge } from "../../components/ui";
import { shortcutFromKey } from "../../utils/shortcut";
import { date } from "../../utils/format";
const elevation = (value: boolean | null) =>
  value === null ? "Unknown" : value ? "Elevated" : "Standard";
export function ShortcutControls() {
  const {
    state,
    busy,
    error,
    configure,
    beginRecording,
    endRecording,
    probeShortcut,
    resetShortcutDiagnostics,
  } = useOcrStore((s) => s);
  const [shortcut, setShortcut] = useState(""),
    [chosen, setChosen] = useState(false),
    [hint, setHint] = useState("");
  useEffect(() => {
    if (state) setShortcut(state.settings.accelerator);
  }, [state?.settings.accelerator]);
  useEffect(() => {
    if (!state?.recording) setChosen(false);
  }, [state?.recording]);
  useEffect(
    () => () => {
      void window.cargoRun.ocrEndRecording().catch(() => {});
    },
    [],
  );
  useEffect(() => {
    if (!state?.recording) return;
    const cancel = () => {
      setShortcut(state.settings.accelerator);
      setHint("Recording cancelled; saved shortcut restored.");
      void endRecording();
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        cancel();
        return;
      }
      if (chosen) {
        if (!["Tab", "Enter"].includes(event.key)) {
          event.preventDefault();
          event.stopImmediatePropagation();
        }
        return;
      }
      if (
        ["Control", "Alt", "Shift", "Meta", "AltGraph", "Tab"].includes(
          event.key,
        )
      )
        return;
      event.preventDefault();
      event.stopImmediatePropagation();
      try {
        const value = shortcutFromKey(event);
        if (value) {
          setShortcut(value);
          setChosen(true);
          setHint(
            "Recorded " +
              value +
              ". Save shortcut to confirm, or press Escape to cancel.",
          );
        }
      } catch (error) {
        setHint(error instanceof Error ? error.message : String(error));
      }
    };
    window.addEventListener("keydown", key, true);
    window.addEventListener("blur", cancel);
    return () => {
      window.removeEventListener("keydown", key, true);
      window.removeEventListener("blur", cancel);
    };
  }, [state?.recording, state?.settings.accelerator, chosen, endRecording]);
  if (!state) return null;
  const s = state.settings,
    diagnostics = state.shortcutDiagnostics,
    context = diagnostics.context,
    mismatch =
      context &&
      context.appElevated !== null &&
      context.gameElevated !== null &&
      context.appElevated !== context.gameElevated;
  return (
    <div className="shortcut-controls">
      {state.inputPrototype && (
        <div className="notice warning input-prototype-notice">
          <strong>Development input prototype</strong>
          <p>
            Capture backend: {state.inputPrototype.selected}. Comparison:{" "}
            {state.inputPrototype.comparison ? "on" : "off"}.
          </p>
          <p>
            Raw Input: {state.inputPrototype.status}; configured chord count:{" "}
            {state.inputPrototype.rawInvocations}. Electron callback count:{" "}
            {state.inputPrototype.electronInvocations}.
          </p>
          {state.inputPrototype.error && (
            <p role="alert">{state.inputPrototype.error}</p>
          )}
          <p>
            Only the selected backend can capture. Raw Input does not reserve or
            consume gameplay input. Release all keys after starting or changing
            layouts. Game delivery is unverified.
          </p>
        </div>
      )}
      <label htmlFor="ocr-shortcut">
        <Keyboard size={14} />
        Global shortcut
      </label>
      <div className="monitor-buttons">
        <input
          id="ocr-shortcut"
          value={shortcut}
          disabled={state.recording}
          onChange={(e) => setShortcut(e.target.value)}
          maxLength={80}
        />
        <button
          className="button"
          disabled={busy || state.recording}
          onClick={() => {
            setChosen(false);
            setHint("Preparing recorder…");
            void beginRecording();
          }}
        >
          Record Shortcut
        </button>
        <button
          className="button"
          disabled={busy || (state.recording && !chosen)}
          onClick={() => void configure({ ...s, accelerator: shortcut })}
        >
          Save shortcut
        </button>
        {state.recording && (
          <button
            className="button"
            disabled={busy}
            onClick={() => {
              setShortcut(s.accelerator);
              setHint("Recording cancelled.");
              void endRecording();
            }}
          >
            Cancel recording
          </button>
        )}
      </div>
      {state.recording && (
        <p className="notice warning" role="status">
          {chosen
            ? hint
            : "Press a key combination now. Capture is paused. Escape cancels."}
        </p>
      )}
      {!state.recording && hint && <p className="form-note">{hint}</p>}
      <p className="form-note">
        Electron suppresses repeated callbacks until one second of quiet. Very
        quick separate presses may also be ignored; this is not guaranteed
        physical key-release detection. Standalone F8/F9 and Ctrl/Alt
        combinations are supported. The configured key is reserved by the
        Electron backend while enabled. Raw Input only observes it. Recording
        pauses capture until Save, Cancel, focus loss, or a 45-second timeout.
      </p>
      <label className="checkbox-label">
        <input
          type="checkbox"
          checked={s.enabled}
          disabled={busy || state.recording}
          onChange={(e) => void configure({ ...s, enabled: e.target.checked })}
        />
        Enable global capture shortcut
      </label>
      <p className="form-note">
        <Badge
          tone={
            state.recording || state.inputPrototype?.status === "Starting"
              ? "amber"
              : state.registered
                ? state.shortcutInvocations
                  ? "green"
                  : "amber"
                : s.enabled
                  ? "red"
                  : "neutral"
          }
        >
          {state.recording
            ? "Paused for shortcut recording"
            : !s.enabled
              ? "Disabled"
              : state.inputPrototype?.selected === "RawInput" &&
                  state.inputPrototype.status === "Starting"
                ? "Starting native listener"
                : !state.registered
                  ? "Registration failed"
                  : state.shortcutInvocations
                    ? (state.inputPrototype?.selected === "RawInput"
                        ? "Listening · "
                        : "Registered · ") +
                      state.shortcutInvocations +
                      " callbacks observed"
                    : state.inputPrototype?.selected === "RawInput"
                      ? "Listening · invocation unverified"
                      : "Registered · invocation unverified"}
        </Badge>
      </p>
      <p className="form-note">
        Saved binding: {s.accelerator}. Electron registration reserves the
        shortcut; Raw Input listening does not. Only an Invocation event proves
        callback delivery. Delivery in Cargo Run does not prove delivery in the
        game.
      </p>
      {state.shortcutError && !state.recording && (
        <p className="form-error">{state.shortcutError}</p>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <details className="shortcut-diagnostics">
        <summary>
          Shortcut diagnostics · {diagnostics.totalInvocations} callbacks
          received
        </summary>
        <div className="monitor-buttons">
          <button
            className="button"
            disabled={busy || state.recording}
            onClick={() => void probeShortcut()}
          >
            Check environment
          </button>
          <button
            className="button"
            disabled={busy || state.recording}
            onClick={() => void resetShortcutDiagnostics()}
          >
            Reset shortcut diagnostics
          </button>
        </div>
        <p className="form-note">
          Capture backend: {state.inputPrototype?.selected ?? "Electron"}. Last
          selected-backend invocation:{" "}
          {diagnostics.lastInvocationAt
            ? date(diagnostics.lastInvocationAt)
            : "None recorded"}
          . Latest 50 lifecycle events are kept locally.
        </p>
        <p className="form-note">
          For the next game test: reset diagnostics, focus Star Citizen, press
          the saved binding once, then return here. No Invocation means no
          callback reached Cargo Run; CaptureError after Invocation means
          delivery worked and capture failed.
        </p>
        {context && (
          <div className="shortcut-context">
            <span>Checked {date(context.inspectedAt)}</span>
            <span>
              Foreground: {context.foregroundProcess ?? "Unknown"}{" "}
              {context.foregroundPid
                ? "(PID " + context.foregroundPid + ")"
                : ""}
            </span>
            <span>Cargo Run privilege: {elevation(context.appElevated)}</span>
            <span>
              Foreground privilege: {elevation(context.foregroundElevated)}
            </span>
            <span>
              Star Citizen:{" "}
              {context.gameVisible
                ? elevation(context.gameElevated)
                : "No queryable visible game window"}
            </span>
          </div>
        )}
        {mismatch && (
          <p className="form-error">
            A privilege mismatch was observed. Align Cargo Run and the game to
            the same privilege level—prefer both standard—and retest. This is a
            possible factor, not proof of the cause. No privilege change is
            performed automatically.
          </p>
        )}
        <div className="diagnostic-events">
          {diagnostics.events.map((event) => (
            <details className="shortcut-event" key={event.id}>
              <summary>
                <Badge
                  tone={
                    event.stage === "CaptureError"
                      ? "red"
                      : event.stage === "Invocation"
                        ? "green"
                        : "neutral"
                  }
                >
                  {event.stage}
                </Badge>
                <span>{event.message}</span>
                <time>{date(event.at)}</time>
              </summary>
              <p className="form-note">
                {event.accelerator} · {event.source ?? "Configuration"}
                {event.captureId ? " · Capture " + event.captureId : ""}
              </p>
              {event.context && (
                <p className="form-note">
                  Foreground {event.context.foregroundProcess ?? "Unknown"} ·
                  Cargo Run {elevation(event.context.appElevated)} · Foreground{" "}
                  {elevation(event.context.foregroundElevated)}
                </p>
              )}
            </details>
          ))}
        </div>
      </details>
    </div>
  );
}
