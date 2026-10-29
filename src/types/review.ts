import type { Contract } from "./models";
import type { CaptureRecord } from "./ocr";
import type { AppSnapshot } from "./tracking";
export interface ReviewedObjective {
  commodity: string;
  pickupLocation: string;
  destination: string;
  quantitySCU: number | null;
  deliveredSCU: number | null;
  existingObjectiveId?: string;
  externalObjectiveId?: string;
  newDistinct?: boolean;
  sourceObjectiveId?: string;
}
export interface ReviewedDraft {
  name: string;
  company: string | null;
  payout: number | null;
  acceptedAt: string | null;
  objectives: ReviewedObjective[];
}
export interface ReviewConflict {
  path: string;
  stored: unknown;
  reviewed: unknown;
  message: string;
}
export interface MatchCandidate {
  contract: Contract;
  version: string;
  kind:
    | "Verified MissionId"
    | "Strong supporting match"
    | "Possible match"
    | "Unverified trigger";
  reasons: string[];
}
export interface PrepareReview {
  captureId: string;
  targetId?: string;
  draft?: ReviewedDraft;
  removeObjectiveIds?: string[];
  removeSourceObjectiveIds?: string[];
}
export interface OcrReview {
  capture: CaptureRecord;
  observationHash: string;
  original: ReviewedDraft;
  draft: ReviewedDraft;
  candidates: MatchCandidate[];
  targets: Contract[];
  conflicts: ReviewConflict[];
  errors: string[];
  warnings: string[];
  target?: Contract;
  targetVersion?: string;
  previous?: EvidenceLink;
  sourceContract?: Contract;
  sourceVersion?: string;
  pendingObjectives: {
    id: string;
    commodity: string;
    destination: string;
    quantitySCU: number;
    deliveredSCU: number;
  }[];
}
export interface ConfirmReview extends PrepareReview {
  action: "Create" | "Update";
  observationHash: string;
  targetVersion?: string;
  sourceVersion?: string;
  acceptedConfirmed: boolean;
  incompleteConfirmed: boolean;
  associationConfirmed: boolean;
  distinctConfirmed: boolean;
  consolidationConfirmed: boolean;
  objectiveRemovalConfirmed: boolean;
  choices: Record<string, "Keep" | "Reviewed">;
}
export interface EvidenceLink {
  rawText?: string;
  observation?: import("./ocr").ContractObservation;
  associationType?: "UserConfirmedCreate" | "UserConfirmedUpdate";
  captureId: string;
  contractId: string;
  attached: boolean;
  verified: boolean;
  associatedAt: string;
  source: string;
  capturedAt: string;
  title: string | null;
  warnings: string[];
  original: ReviewedDraft;
  reviewed: ReviewedDraft;
  corrections: string[];
  conflicts: ReviewConflict[];
  choices: Record<string, string>;
  missionId: string | null;
  imageAvailable?: boolean;
}
export interface ReviewResult {
  state: AppSnapshot;
  contractId: string;
  idempotent: boolean;
}
export function reviewErrors(d: ReviewedDraft): string[] {
  const errors: string[] = [];
  if (!d.name?.trim() || d.name.length > 2000)
    errors.push("Enter a contract title (at most 2000 characters).");
  if (
    d.company !== null &&
    (typeof d.company !== "string" || d.company.length > 2000)
  )
    errors.push("Invalid company.");
  if (
    d.payout !== null &&
    (!Number.isFinite(d.payout) || d.payout < 0 || d.payout > 1e15)
  )
    errors.push("Reward must be unknown or a non-negative amount.");
  if (
    d.acceptedAt !== null &&
    (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(
      d.acceptedAt,
    ) ||
      !Number.isFinite(Date.parse(d.acceptedAt)) ||
      Date.parse(d.acceptedAt) > Date.now() + 300000)
  )
    errors.push("Acceptance time must be unknown or a valid confirmed time.");
  if (
    !Array.isArray(d.objectives) ||
    !d.objectives.length ||
    d.objectives.length > 100
  )
    errors.push("Provide 1–100 delivery objectives.");
  for (const [i, o] of (d.objectives ?? []).entries()) {
    if (
      [o.commodity, o.pickupLocation, o.destination].some(
        (v) => typeof v !== "string" || !v.trim() || v.length > 2000,
      )
    )
      errors.push(
        "Complete commodity, pickup and destination for objective " +
          (i + 1) +
          ".",
      );
    if (
      o.quantitySCU === null ||
      !Number.isFinite(o.quantitySCU) ||
      o.quantitySCU <= 0 ||
      o.quantitySCU > 1e12
    )
      errors.push(
        "Required SCU must be greater than zero for objective " + (i + 1) + ".",
      );
    if (
      o.deliveredSCU === null ||
      !Number.isFinite(o.deliveredSCU) ||
      o.deliveredSCU < 0 ||
      o.deliveredSCU > (o.quantitySCU ?? 0)
    )
      errors.push("Confirm valid delivered SCU for objective " + (i + 1) + ".");
  }
  return errors;
}
