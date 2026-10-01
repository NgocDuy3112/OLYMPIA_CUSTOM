import React from "react";
import { Card as ShadcnCard } from "@/components/ui/card";
import { cn } from "cn";

interface CardProps {
  children: React.ReactNode;
  className?: string;
  padding?: "none" | "sm" | "md" | "lg";
  hover?: boolean;
  onClick?: () => void;
}

// `!` (important, Tailwind v4 syntax) để đè padding mặc định của shadcn Card.
const PADDING_STYLES = {
  none: "p-0!",
  sm: "p-3!",
  md: "p-4! sm:p-5!",
  lg: "p-5! sm:p-6!",
};

export const Card: React.FC<CardProps> = ({
  children,
  className = "",
  padding = "md",
  hover = false,
  onClick,
}) => {
  return (
    <ShadcnCard
      className={cn(
        PADDING_STYLES[padding],
        hover
          ? "hover:ring-blue-500 transition-colors cursor-pointer"
          : "",
        onClick ? "cursor-pointer" : "",
        className
      )}
      onClick={onClick}
    >
      {children}
    </ShadcnCard>
  );
};
