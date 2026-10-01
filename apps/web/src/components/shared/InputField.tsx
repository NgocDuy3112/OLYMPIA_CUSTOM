import type { InputHTMLAttributes } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "cn";

type InputFieldProps = {
  label: string;
} & InputHTMLAttributes<HTMLInputElement>;

export const InputField = ({ label, className, ...props }: InputFieldProps) => (
  <div>
    <label className="block mb-1 font-medium text-sm">{label}</label>
    <Input
      {...props}
      className={cn("bg-white text-black border-(--oc-border)", className)}
    />
  </div>
);
