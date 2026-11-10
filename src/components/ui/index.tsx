import type { ReactNode } from "react";
import { Info, PackageOpen } from "lucide-react";
export function PageHeader({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="description">{description}</p>
      </div>
      <div className="page-actions">{children}</div>
    </header>
  );
}
export function StatCard({
  label,
  value,
  detail,
  icon,
  children,
  hint,
}: {
  label: string;
  hint?: string;
  value: ReactNode;
  detail: string;
  icon: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section className="stat-card">
      <div className="stat-top">
        <span>
          {label} {hint && <InfoTip text={hint} />}
        </span>
        {icon}
      </div>
      <div className="stat-value numeric">{value}</div>
      {children}
      <p className="stat-detail">{detail}</p>
    </section>
  );
}
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

export function InfoTip({ text }: { text: string }) {
  return (
    <span className="info-tip" tabIndex={0} role="note" aria-label={text}>
      <Info size={13} aria-hidden="true" />
      <span className="info-tip-text" role="tooltip">
        {text}
      </span>
    </span>
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
