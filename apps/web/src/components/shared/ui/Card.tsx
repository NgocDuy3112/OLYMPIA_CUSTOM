import React from "react";

interface CardProps {
  children: React.ReactNode;
  className?: string;
  padding?: "none" | "sm" | "md" | "lg";
  hover?: boolean;
  onClick?: () => void;
}

const PADDING_STYLES = {
  none: "",
  sm: "!p-3",
  md: "!p-4 sm:!p-5",
  lg: "!p-5 sm:!p-6",
};

export const Card: React.FC<CardProps> = ({
  children,
  className = "",
  padding = "md",
  hover = false,
  onClick,
}) => {
  return (
    <div
      className={`
        card
        ${PADDING_STYLES[padding]}
        ${hover ? "hover:border-blue-500 transition-colors cursor-pointer" : ""}
        ${onClick ? "cursor-pointer" : ""}
        ${className}
      `}
      onClick={onClick}
    >
      {children}
    </div>
  );
};
