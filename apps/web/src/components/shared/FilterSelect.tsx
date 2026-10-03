import type { ReactNode } from "react";
import { NativeSelect } from "@/components/ui/native-select";

interface FilterSelectProps {
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
  "aria-label"?: string;
}

export function FilterSelect({
  value,
  onChange,
  children,
  ...rest
}: FilterSelectProps) {
  return (
    <NativeSelect
      value={value}
      onChange={(e) => onChange(e.target.value)}
      {...rest}
    >
      {children}
    </NativeSelect>
  );
}

export default FilterSelect;
