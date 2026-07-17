import React from "react";
import { BrainCircuit } from "lucide-react";

interface LogoProps {
  size?: "sm" | "md" | "lg" | "xl";
  showText?: boolean;
  className?: string;
  variant?: "light" | "dark";
}

export const Logo: React.FC<LogoProps> = ({ 
  size = "md", 
  showText = true,
  className = "",
  variant = "dark"
}) => {
  const sizeClasses = {
    sm: "w-8 h-8",
    md: "w-10 h-10",
    lg: "w-16 h-16",
    xl: "w-20 h-20"
  };

  const iconSizes = {
    sm: "w-4 h-4",
    md: "w-6 h-6",
    lg: "w-10 h-10",
    xl: "w-12 h-12"
  };

  const textSizes = {
    sm: "text-sm",
    md: "text-lg",
    lg: "text-2xl",
    xl: "text-4xl"
  };

  return (
    <div className={`flex flex-col items-center gap-3 ${className}`}>
      <div className={`${sizeClasses[size]} rounded-xl bg-red-600 flex items-center justify-center shadow-lg relative overflow-hidden`}>
        <BrainCircuit className={`text-white ${iconSizes[size]}`} />
        <div className="absolute inset-0 bg-gradient-to-t from-black/10 to-transparent" />
      </div>
      {showText && (
        <div className="text-center">
          <h1 className={`${textSizes[size]} font-bold tracking-tight ${variant === "light" ? "text-gray-900" : "text-white"}`} style={{ fontFamily: 'var(--font-display)' }}>
            Noryx
          </h1>
          {size === "xl" && (
            <span className={`text-xs font-medium tracking-[0.2em] block mt-1 uppercase ${variant === "light" ? "text-gray-500" : "text-red-400"}`}>
              AI Workspace
            </span>
          )}
          {size === "lg" && (
            <span className={`text-[10px] font-medium tracking-[0.15em] block mt-1 uppercase ${variant === "light" ? "text-gray-500" : "text-red-400"}`}>
              AI Workspace
            </span>
          )}
        </div>
      )}
    </div>
  );
};
