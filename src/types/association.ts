export interface MissionIdentityEvidence {
  id: string;
  kind: "Marker" | "ObjectiveState";
  missionId: string;
  objectiveId: string;
  at: string | null;
  template?: string;
  definitionId?: string;
  state?: string;
}
