/**
 * Skeleton — reusable loading skeleton components with subtle animations.
 *
 * Provides consistent loading states across the application:
 * - Conversation list items
 * - Knowledge Center documents
 * - Document preview
 * - Chat messages
 * - Health panel
 */

import React from "react";
import { motion } from "motion/react";

interface SkeletonBaseProps {
  className?: string;
  style?: React.CSSProperties;
}

const shimmerAnimation = {
  initial: { opacity: 0.5 },
  animate: { opacity: 1 },
  transition: {
    duration: 1.5,
    repeat: Infinity,
    repeatType: "reverse",
    ease: "easeInOut",
  },
};

export const Skeleton: React.FC<SkeletonBaseProps> = ({ className = "", style = {} }) => {
  return (
    <motion.div
      initial={{ opacity: 0.5 }}
      animate={{ opacity: 1 }}
      transition={{
        duration: 1.5,
        repeat: Infinity,
        repeatType: "reverse",
        ease: "easeInOut",
      }}
      className={`bg-gray-200 rounded ${className}`}
      style={style}
    />
  );
};

// ── Conversation List Item Skeleton ──────────────────────────────────

export const ConversationSkeleton: React.FC = () => {
  return (
    <div className="flex items-center gap-3 p-3 rounded-xl">
      <Skeleton className="w-10 h-10 rounded-lg flex-shrink-0" />
      <div className="flex-1 min-w-0 space-y-2">
        <Skeleton className="h-4 w-3/4 rounded" />
        <Skeleton className="h-3 w-1/2 rounded" />
      </div>
    </div>
  );
};

// ── Knowledge Center Document Skeleton ───────────────────────────────

export const DocumentSkeleton: React.FC = () => {
  return (
    <div className="p-4 rounded-xl border border-gray-200 bg-white space-y-3">
      <div className="flex items-start gap-3">
        <Skeleton className="w-10 h-10 rounded-lg flex-shrink-0" />
        <div className="flex-1 min-w-0 space-y-2">
          <Skeleton className="h-4 w-3/4 rounded" />
          <Skeleton className="h-3 w-1/2 rounded" />
        </div>
      </div>
      <Skeleton className="h-2 w-full rounded" />
      <div className="flex items-center justify-between">
        <Skeleton className="h-3 w-20 rounded" />
        <Skeleton className="h-3 w-16 rounded" />
      </div>
    </div>
  );
};

// ── Document Preview Skeleton ────────────────────────────────────────

export const DocumentPreviewSkeleton: React.FC = () => {
  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-3 pb-4 border-b border-gray-200">
        <Skeleton className="w-12 h-12 rounded-lg flex-shrink-0" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-5 w-2/3 rounded" />
          <Skeleton className="h-3 w-1/3 rounded" />
        </div>
      </div>
      <div className="space-y-3">
        <Skeleton className="h-4 w-full rounded" />
        <Skeleton className="h-4 w-full rounded" />
        <Skeleton className="h-4 w-4/5 rounded" />
        <Skeleton className="h-4 w-full rounded" />
        <Skeleton className="h-4 w-3/4 rounded" />
      </div>
      <div className="space-y-3 pt-4">
        <Skeleton className="h-32 w-full rounded-lg" />
        <Skeleton className="h-4 w-2/3 rounded" />
      </div>
    </div>
  );
};

// ── Chat Message Skeleton ────────────────────────────────────────────

export const ChatMessageSkeleton: React.FC = () => {
  return (
    <div className="flex items-start gap-3 mb-6">
      <Skeleton className="w-8 h-8 rounded-full flex-shrink-0" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-full rounded" />
        <Skeleton className="h-4 w-5/6 rounded" />
        <Skeleton className="h-4 w-4/6 rounded" />
      </div>
    </div>
  );
};

// ── Health Panel Skeleton ────────────────────────────────────────────

export const HealthPanelSkeleton: React.FC = () => {
  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-5 w-32 rounded" />
        <Skeleton className="h-6 w-16 rounded-full" />
      </div>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-24 rounded" />
          <Skeleton className="h-4 w-16 rounded" />
        </div>
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-28 rounded" />
          <Skeleton className="h-4 w-20 rounded" />
        </div>
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-20 rounded" />
          <Skeleton className="h-4 w-24 rounded" />
        </div>
      </div>
      <Skeleton className="h-2 w-full rounded-full" />
    </div>
  );
};

// ── Generic Card Skeleton ────────────────────────────────────────────

export const CardSkeleton: React.FC<{ lines?: number }> = ({ lines = 3 }) => {
  return (
    <div className="p-4 rounded-xl border border-gray-200 bg-white space-y-3">
      <Skeleton className="h-5 w-2/3 rounded" />
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className="h-3 rounded"
          style={{ width: `${100 - i * 15}%` }}
        />
      ))}
    </div>
  );
};