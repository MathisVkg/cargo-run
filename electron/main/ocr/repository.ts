import type { CargoDatabase } from "../storage/database";
import type { CaptureRecord, CaptureSettings } from "../../../src/types/ocr";
export const defaultCaptureSettings: CaptureSettings = {
  enabled: true,
  accelerator: "Ctrl+Shift+F9",
  sounds: true,
  displayId: "auto",
};
export class CaptureRepository {
  constructor(readonly database: CargoDatabase) {}
  diagnostics(): import("../../../src/types/shortcut").ShortcutDiagnostics {
    return (
      this.database.getSetting<
        import("../../../src/types/shortcut").ShortcutDiagnostics
      >("ocr.shortcutDiagnostics") ?? {
        totalInvocations: 0,
        lastInvocationAt: null,
        context: null,
        events: [],
      }
    );
  }
  saveDiagnostics(
    value: import("../../../src/types/shortcut").ShortcutDiagnostics,
  ) {
    this.database.setSetting("ocr.shortcutDiagnostics", value);
  }
  settings(): CaptureSettings {
    return (
      this.database.getSetting<CaptureSettings>("ocr.settings") ?? {
        ...defaultCaptureSettings,
      }
    );
  }
  saveSettings(settings: CaptureSettings) {
    this.database.setSetting("ocr.settings", settings);
  }
  private decorate(c: CaptureRecord): CaptureRecord {
    const row = this.database.db
      .prepare(
        "SELECT contract_id,attached FROM capture_contract_links WHERE capture_id=?",
      )
      .get(c.id);
    if (!row) return c;
    const contract = this.database.db
      .prepare("SELECT payload FROM contracts WHERE id=?")
      .get(String(row.contract_id));
    const value = contract
      ? (JSON.parse(
          String(contract.payload),
        ) as import("../../../src/types/models").Contract)
      : null;
    return {
      ...c,
      evidenceLink:
        row.attached && value
          ? {
              contractId: value.id,
              status: value.status,
              closedAt: value.completedAt ?? null,
            }
          : undefined,
    };
  }
  list(): CaptureRecord[] {
    return this.database.db
      .prepare("SELECT payload FROM ocr_captures ORDER BY sequence")
      .all()
      .map((r) =>
        this.decorate(JSON.parse(String(r.payload)) as CaptureRecord),
      );
  }
  get(id: string): CaptureRecord | null {
    const row = this.database.db
      .prepare("SELECT payload FROM ocr_captures WHERE id=?")
      .get(id);
    return row
      ? this.decorate(JSON.parse(String(row.payload)) as CaptureRecord)
      : null;
  }
  put(record: CaptureRecord) {
    this.database.db
      .prepare(
        "INSERT INTO ocr_captures(id,payload) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload",
      )
      .run(record.id, JSON.stringify(record));
  }
  remove(id: string) {
    this.database.db.prepare("DELETE FROM ocr_captures WHERE id=?").run(id);
  }
  clear() {
    this.database.db.exec("DELETE FROM ocr_captures");
  }
}
