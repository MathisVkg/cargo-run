import { useState } from "react";
import { captureImage } from "../../stores/useOcrStore";
import type { CaptureRecord } from "../../types/ocr";
export function ObjectiveEvidence({
  capture,
  index,
}: {
  capture: CaptureRecord;
  index: number;
}) {
  const [missing, setMissing] = useState(false);
  const row = capture.observation?.objectives[index],
    box = row?.requiredSCU.evidence?.box;
  if (!row) return null;
  const width = capture.result?.width ?? capture.width ?? 1,
    height = capture.result?.height ?? capture.height ?? 1;
  return (
    <figure className="objective-evidence">
      {capture.screenshot && box && !missing ? (
        <svg
          role="img"
          aria-label={"Objective " + (index + 1) + " screenshot evidence"}
          viewBox={[
            Math.max(0, box.x - 20),
            Math.max(0, box.y - 15),
            box.width + 40,
            box.height + 30,
          ].join(" ")}
          preserveAspectRatio="xMinYMid meet"
          style={{ aspectRatio: (box.width + 40) / (box.height + 30) }}
        >
          <image
            href={captureImage(capture.id)}
            width={width}
            height={height}
            onError={() => setMissing(true)}
          />
        </svg>
      ) : (
        <blockquote>
          {row.requiredSCU.evidence?.text ??
            "Screenshot evidence is unavailable."}
        </blockquote>
      )}
      <figcaption>
        Objective {index + 1} · {row.commodity.value ?? "Cargo"} ·{" "}
        {row.destination.value ?? "Destination not read"}
        {missing ? " · Saved image unavailable; showing saved OCR text." : ""}
      </figcaption>
    </figure>
  );
}
