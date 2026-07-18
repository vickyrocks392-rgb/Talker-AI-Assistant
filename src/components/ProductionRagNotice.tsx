import React from "react";
import { motion } from "motion/react";
import { Info } from "lucide-react";

interface ProductionRagNoticeProps {
  visible: boolean;
}

/**
 * Professional information card shown when RAG is unavailable.
 * Displays a neutral, informational message about the production deployment.
 */
export const ProductionRagNotice: React.FC<ProductionRagNoticeProps> = ({ visible }) => {
  if (!visible) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="mx-4 mt-3"
    >
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
            <Info className="w-4 h-4 text-blue-600" />
          </div>
          <div>
            <h3 className="font-semibold text-blue-900 mb-1">
              Production Deployment Notice
            </h3>
            <p className="text-sm text-blue-800 leading-relaxed">
              This public deployment runs without the vector database to optimize deployment cost and portability. 
              The complete Retrieval-Augmented Generation (RAG) pipeline—including PDF ingestion, embedding generation, 
              vector search, document retrieval, and contextual augmentation—is fully implemented and available in the 
              local development environment.
            </p>
            <p className="text-sm text-blue-800 mt-2">
              All other AI capabilities remain fully functional in this live deployment.
            </p>
          </div>
        </div>
      </div>
    </motion.div>
  );
};