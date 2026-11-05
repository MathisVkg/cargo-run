import type {
  ContractObservation,
  OcrResult,
  CaptureRecord,
} from "../../../src/types/ocr";
export const recognitionKey = (o: ContractObservation | null) =>
  JSON.stringify(
    o
      ? [
          o.title.value,
          o.company.value,
          o.reward.value,
          o.view.value,
          o.coverage?.state,
          o.objectives.map((r) => [
            r.commodity.value,
            r.pickup.value,
            r.destination.value,
            r.requiredSCU.value,
            r.requiredSCU.state,
            r.deliveredSCU.value,
            r.deliveredSCU.state,
          ]),
        ]
      : null,
  );
export const recognitionQuality = (o: ContractObservation | null) =>
  !o
    ? 0
    : [
        o.title,
        o.view,
        ...o.objectives.flatMap((r) => [
          r.commodity,
          r.pickup,
          r.destination,
          r.requiredSCU,
          r.deliveredSCU,
        ]),
      ].filter((f) => f.state === "Recognized" && f.value !== null).length;
export function recoveryMessage(
  changed: boolean,
  o: ContractObservation | null,
) {
  const missing = o?.objectives.some((r) => !r.pickup.value);
  return (
    (changed
      ? "OCR completed and recognized fields improved or changed."
      : "OCR completed; the same information was extracted.") +
    (missing
      ? " Pickup is still missing. Reprocessing cannot recover information that was not visible; inspect the screenshot and correct only the missing field."
      : "")
  );
}
export function recoveryHistory(
  c: CaptureRecord,
  result: OcrResult | undefined,
  observation: ContractObservation | undefined,
  message: string,
) {
  return [
    ...(c.recognitionHistory ?? []),
    {
      id: c.recovery!.id,
      at: new Date().toISOString(),
      message,
      result,
      observation,
    },
  ].slice(-3);
}
