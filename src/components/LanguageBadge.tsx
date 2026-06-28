import React from "react";

interface LanguageBadgeProps {
  sourceLang?: "en" | "hi" | "hinglish";
}

export const LanguageBadge: React.FC<LanguageBadgeProps> = ({ sourceLang }) => {
  if (!sourceLang) return null;
  const langUpper = sourceLang === "hinglish" ? "HING" : sourceLang.toUpperCase();
  
  let colorClasses = "bg-slate-800/85 text-slate-400 border-slate-700/60";
  if (sourceLang === "hi") {
    colorClasses = "bg-amber-500/10 text-amber-400 border-amber-500/20";
  } else if (sourceLang === "en") {
    colorClasses = "bg-sky-500/10 text-sky-400 border-sky-500/20";
  } else if (sourceLang === "hinglish") {
    colorClasses = "bg-fuchsia-500/10 text-fuchsia-400 border-fuchsia-500/20";
  }

  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-bold font-mono tracking-wider border ${colorClasses} select-none shadow-sm`}>
      {langUpper}
    </span>
  );
};
