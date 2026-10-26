export type InputBackend = "Electron" | "RawInput";
export interface InputPrototypeSnapshot {
  selected: InputBackend;
  comparison: boolean;
  status: "Disabled" | "Starting" | "Listening" | "Error";
  error: string | null;
  rawInvocations: number;
  electronInvocations: number;
}
