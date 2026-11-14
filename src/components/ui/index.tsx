import type { ReactNode } from "react";
import { PackageOpen } from "lucide-react";
export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "amber" | "green" | "red";
}) {
  return <span className={"badge " + tone}>{children}</span>;
}
export function EmptyState({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <PackageOpen size={32} />
      <h3>{title}</h3>
      <p>{description}</p>
      {children}
    </div>
  );
}

export function Pagination({
  page,
  pages,
  onChange,
  label = "Pagination",
}: {
  page: number;
  pages: number;
  onChange(page: number): void;
  label?: string;
}) {
  return (
    <div className="pagination" role="group" aria-label={label}>
      <button
        className="button small"
        disabled={page === 0}
        onClick={() => onChange(page - 1)}
      >
        Previous
      </button>
      <span>
        Page {page + 1} of {pages}
      </span>
      <button
        className="button small"
        disabled={page >= pages - 1}
        onClick={() => onChange(page + 1)}
      >
        Next
      </button>
    </div>
  );
}
