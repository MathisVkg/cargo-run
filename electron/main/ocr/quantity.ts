import type { OcrLine } from "../../../src/types/ocr";
export const numericConfidenceFloor = 70;
export const regionalConfidenceFloor = 80;
// A missing slash is evidence loss, never permission to strip a leading digit.
// Group separators are accepted only in complete groups of three.
const number = "(?:\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.\\d+)?";
const row = new RegExp(
  "^Deliver\\s+(" +
    number +
    ")(?:\\s*[/⁄／]\\s*(?:[□☐☑✓✔•<>¢$]\\s*)?(" +
    number +
    "))?\\s*SCU\\s+(?:of\\s+)?(.+)$",
  "i",
);
export function deliveryQuantity(text: string, lines: OcrLine[]) {
  const m = row.exec(text);
  if (!m) return null;
  const required = Number((m[2] ?? m[1]).replaceAll(",", ""));
  const delivered = m[2] ? Number(m[1].replaceAll(",", "")) : null;
  const words = lines.flatMap((l) => l.words ?? []);
  const scu = words.findIndex((w) => /^SCU$/i.test(w.text));
  const numericWords = (scu < 0 ? words : words.slice(0, scu)).filter(
    (w) => /[0-9]/.test(w.text) && !/^[A-Za-z]/.test(w.text),
  );
  // Whole-line averages mix labels and destination words with the quantity.
  // Only the engine's actual numeric-word confidence can flag a numeric reading.
  const lowConfidence = numericWords.some(
    (w) => w.confidence !== null && w.confidence < numericConfidenceFloor,
  );
  const checks = lines.flatMap((l) =>
    l.quantityCheck ? [l.quantityCheck] : [],
  );
  const expected = m[2] ? m[1] + "/" + m[2] : "";
  const conflicting = checks.some(
    (c) =>
      c.confidence >= regionalConfidenceFloor &&
      c.text.replace(/\s/g, "").replace(/[⁄／]/g, "/") !== expected,
  );
  const corroborated =
    checks.length === 1 &&
    checks[0].confidence >= regionalConfidenceFloor &&
    checks[0].text.replace(/\s/g, "").replace(/[⁄／]/g, "/") === expected;
  const tokenConflict =
    numericWords.length > 0 &&
    !!expected &&
    numericWords
      .map((w) => w.text)
      .join("")
      .replace(/\s/g, "")
      .replace(/[⁄／]/g, "/") !== expected;
  const reason = tokenConflict
    ? "Numeric word evidence disagrees with objective text."
    : !m[2]
      ? "Progress separator is missing."
      : !Number.isFinite(required) ||
          required <= 0 ||
          (delivered !== null && delivered > required)
        ? "Progress quantities are invalid."
        : conflicting
          ? "Separate regional recognition disagrees with the objective."
          : lowConfidence && !corroborated
            ? "Numeric confidence needs corroboration."
            : "Validated delivered/required objective.";
  return {
    reason,
    code: (tokenConflict || conflicting
      ? "Conflict"
      : !m[2] ||
          !Number.isFinite(required) ||
          required <= 0 ||
          (delivered !== null && delivered > required)
        ? "Invalid"
        : lowConfidence && !corroborated
          ? "NumericConfidence"
          : "Validated") as
      | "Conflict"
      | "Invalid"
      | "NumericConfidence"
      | "Validated",
    source: corroborated ? ("Region OCR" as const) : ("Objective OCR" as const),
    required,
    delivered,
    body: m[3],
    ambiguous:
      !m[2] ||
      !Number.isFinite(required) ||
      required <= 0 ||
      (delivered !== null && delivered > required) ||
      tokenConflict ||
      conflicting ||
      (lowConfidence && !corroborated),
  };
}
