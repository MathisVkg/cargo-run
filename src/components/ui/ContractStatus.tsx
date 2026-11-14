import { CircleDot, CircleCheck, CircleX, CircleAlert } from "lucide-react";
export function ContractStatus({
  status,
}: {
  status: "Active" | "Completed" | "Abandoned" | "Needs review";
}) {
  const Icon =
    status === "Completed"
      ? CircleCheck
      : status === "Abandoned"
        ? CircleX
        : status === "Needs review"
          ? CircleAlert
          : CircleDot;
  return (
    <span
      className={
        "contract-status status-" + status.toLowerCase().replaceAll(" ", "-")
      }
      aria-label={status}
      title={status}
    >
      <Icon size={17} aria-hidden="true" />
      <span className="sr-only">{status}</span>
    </span>
  );
}
