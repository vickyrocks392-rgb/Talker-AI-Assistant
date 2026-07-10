import React from "react";
import { motion } from "motion/react";
import { BookOpen, FileText, Search } from "lucide-react";

interface RagIndicatorProps {
  used: boolean;
  documentsSearched?: number;
  contextType?: "resume" | "document" | "none";
}

export const RagIndicator: React.FC<RagIndicatorProps> = ({ 
  used, 
  documentsSearched = 0,
  contextType = "none"
}) => {
  if (!used) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="flex items-center gap-2 text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1 w-fit mb-2"
    >
      <BookOpen className="w-3.5 h-3.5 text-red-600" />
      <span className="font-medium">
        Knowledge Used
      </span>
      {contextType === "resume" && (
        <span className="text-gray-500">• Resume Context</span>
      )}
      {documentsSearched > 0 && (
        <span className="text-gray-500">• {documentsSearched} document{documentsSearched !== 1 ? 's' : ''} searched</span>
      )}
    </motion.div>
  );
};