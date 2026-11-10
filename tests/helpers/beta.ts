// Existing lifecycle regressions explicitly exercise the opt-in beta.
// The early fixture epoch allows their historical, deterministic log timestamps;
// Task 07 default-Off and activation-boundary tests use the real service directly.
import { TrackingService as ActualService } from "../../electron/main/trackingService";
import { workflow } from "../../electron/main/workflow";
export class TrackingService extends ActualService {
  constructor(path: string) {
    super(path);
    this.database.setSetting("workflow.automation", {
      ...workflow(this.database),
      automaticCompletion: true,
      since: "2000-01-01T00:00:00Z",
      afterRow: 0,
    });
  }
}
