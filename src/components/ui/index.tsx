import type { ReactNode } from "react";
import { PackageOpen } from "lucide-react";
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
}: {
  label: string;
  value: ReactNode;
  detail: string;
  icon: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section className="stat-card">
      <div className="stat-top">
        <span>{label}</span>
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
