import type { ReactNode } from "react";

interface FilterSelectProps {
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
  className?: string;
  "aria-label"?: string;
}

/** Select lọc chuẩn admin — style đồng bộ input (`bg-blue-950 border-blue-700`). */
export function FilterSelect({
  value,
  onChange,
  children,
  className = "",
  ...rest
}: FilterSelectProps) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`px-3 py-2 rounded-lg bg-blue-950 border border-blue-700 text-white text-sm ${className}`}
      {...rest}
    >
      {children}
    </select>
  );
}

export default FilterSelect;
