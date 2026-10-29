const numeric = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
export const number = (value: number): string => numeric.format(value);
export const money = (value: number | null): string =>
  value === null ? "Unknown" : number(value) + " aUEC";
export const date = (value: string | null | undefined): string =>
  !value || !Number.isFinite(Date.parse(value))
    ? "Unknown"
    : new Date(value).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
