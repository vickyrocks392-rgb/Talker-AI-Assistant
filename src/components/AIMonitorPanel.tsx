import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Brain,
  ChevronDown,
  ChevronUp,
  Cpu,
  Clock,
  Layers,
  Database,
  FileText,
  Wrench,
  Zap,
  Shield,
  ShieldAlert,
} from "lucide-react";
import type { AIMonitorDTO, SecurityTelemetryDTO } from "../lib/api";
import { useDialogA11y } from "../hooks/useDialogA11y";

/** Map a security decision to a chip style. */
function decisionChip(decision: SecurityTelemetryDTO["inputDecision"]): { label: string; accent: string } {
  switch (decision) {
    case "block":
      return { label: "Blocked", accent: "border-red-200 bg-red-100/60 text-red-700" };
    case "redact":
      return { label: "Redacted", accent: "border-amber-200 bg-amber-100/60 text-amber-700" };
    case "warn":
      return { label: "Warned", accent: "border-yellow-200 bg-yellow-100/60 text-yellow-700" };
    default:
      return { label: "Allowed", accent: "border-green-200 bg-green-100/60 text-green-700" };
  }
}

interface AIMonitorPanelProps {
  data: AIMonitorDTO | null;
}

/**
 * AI Systems Command Center
 *
 * Collapsed: a compact telemetry bar integrated with message response.
 * Expanded: premium cockpit card with clear visual hierarchy and depth.
 *
 * Design principles:
 *   - Minimal whitespace in collapsed state
 *   - Card depth and spacing in expanded state
 *   - Visual hierarchy for easy scanning
 *   - Integrated with assistant response (not separate footer)
 */

// ── Small presentational helpers ──────────────────────────────────────

function MetricCard({
  icon,
  label,
  value,
  accent,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  accent: string;
  sub?: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-gray-200/70 bg-white px-3 py-2.5 shadow-sm">
      <div className={`mt-0.5 flex-shrink-0 ${accent}`}>{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
          {label}
        </div>
        <div className={`truncate text-sm font-semibold ${accent}`}>{value}</div>
        {sub && <div className="mt-0.5 text-[11px] text-gray-500">{sub}</div>}
      </div>
    </div>
  );
}

function SectionTitle({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="mb-2 flex items-center gap-1.5">
      <span className="text-gray-400">{icon}</span>
      <span className="text-[11px] font-bold uppercase tracking-widest text-gray-500">
        {children}
      </span>
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-[11px] text-gray-500">{label}</span>
      <span className="text-[11px] font-semibold text-gray-800">{value}</span>
    </div>
  );
}

function Chip({ children, accent, key }: { children: React.ReactNode; accent: string; key?: string }) {
  return (
    <span
      className="inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-medium transition-colors hover:brightness-95 ${accent}"
    >
      {children}
    </span>
  );
}

// ── Main component ─────────────────────────────────────────────────────

export const AIMonitorPanel: React.FC<AIMonitorPanelProps> = ({ data }) => {
  const [isOpen, setIsOpen] = useState(false);

  if (!data) return null;

  const hasMemory = !!data.memory && data.memory.entryCount > 0;
  const hasRag = !!data.rag && data.rag.activeDocCount > 0;
  const hasTools = !!data.tools && data.tools.executionCount > 0;
  const sec = data.security;

  // Compact collapsed summary chips
  const collapsedTags: string[] = [data.provider, data.mode];

  return (
    <div className="bg-gray-50 border-t border-gray-200/30">
      {/* Collapsed state: integrated with message response */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-label="Toggle AI Monitor details"
        className="group flex w-full items-center justify-between px-3 py-1.5 text-xs text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-700"
      >
        <div className="flex items-center gap-2">
          <Brain className="h-3.5 w-3.5 text-indigo-500 transition-transform group-hover:scale-110" />
          <span className="font-semibold text-gray-700">AI Monitor</span>
          <span className="text-gray-300">·</span>
          {collapsedTags.map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-gray-200/70 px-2 py-0.5 text-[10px] font-medium text-gray-600"
            >
              {tag}
            </span>
          ))}
          <span className="text-gray-300">·</span>
          <span className="font-mono text-[10px] text-yellow-600">{data.latencyMs}ms</span>
          {sec?.triggered && (
            <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-100/60 px-2 py-0.5 text-[10px] font-medium text-red-700">
              <ShieldAlert className="h-3 w-3" />
              Security
            </span>
          )}
        </div>
        <span className="flex items-center gap-1 text-gray-400">
          <span className="text-[10px] font-medium opacity-0 transition-opacity group-hover:opacity-100">
            {isOpen ? "collapse" : "details"}
          </span>
          {isOpen ? (
            <ChevronUp className="h-3.5 w-3.5" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" />
          )}
        </span>
      </button>

      {/* Expanded state: premium cockpit card with depth */}
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0, transform: "translateY(-4px)" }}
            animate={{ height: "auto", opacity: 1, transform: "translateY(0)" }}
            exit={{ height: 0, opacity: 0, transform: "translateY(-4px)" }}
            transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
            className="overflow-hidden bg-white rounded-lg shadow-md border border-gray-200/60 p-4"
          >
            <div className="mb-4">
              {/* Status banner */}
              <div className="flex items-center justify-between rounded-lg border border-green-200/60 bg-green-50/60 px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-60" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
                  </span>
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-green-700">
                    System Healthy
                  </span>
                </div>
                <span className="font-mono text-[10px] text-gray-400">
                  {data.provider} · {data.model}
                </span>
              </div>

              {/* Core telemetry grid */}
              <div className="grid grid-cols-2 gap-2">
                <MetricCard
                  icon={<Cpu className="h-4 w-4" />}
                  label="Provider"
                  value={data.provider}
                  accent="text-green-600"
                />
                <MetricCard
                  icon={<Zap className="h-4 w-4" />}
                  label="Latency"
                  value={`${data.latencyMs} ms`}
                  accent="text-yellow-600"
                />
                <MetricCard
                  icon={<Layers className="h-4 w-4" />}
                  label="Mode"
                  value={data.mode}
                  accent="text-green-600"
                />
                <MetricCard
                  icon={<Brain className="h-4 w-4" />}
                  label="Model"
                  value={data.model}
                  accent="text-gray-700"
                  sub={undefined}
                />
              </div>

              {/* Memory section */}
              {hasMemory && (
                <div className="mt-3 rounded-lg border border-purple-200/60 bg-purple-50/30 p-3">
                  <SectionTitle icon={<Database className="h-3.5 w-3.5" />}>
                    Memory
                  </SectionTitle>
                  <div className="border-t border-purple-100 pt-1">
                    <StatRow
                      label="Entries"
                      value={
                        <span className="text-purple-700">
                          {data.memory!.entryCount}
                        </span>
                      }
                    />
                    <StatRow
                      label="Confidence"
                      value={
                        <span className="text-purple-700">
                          {Math.round(data.memory!.avgConfidence * 100)}%
                        </span>
                      }
                    />
                  </div>
                </div>
              )}

              {/* Retrieval section */}
              {hasRag && (
                <div className="mt-3 rounded-lg border border-blue-200/60 bg-blue-50/30 p-3">
                  <SectionTitle icon={<FileText className="h-3.5 w-3.5" />}>
                    Retrieval
                  </SectionTitle>
                  <div className="border-t border-blue-100 pt-1">
                    <StatRow
                      label="Active Documents"
                      value={
                        <span className="text-blue-700">
                          {data.rag!.activeDocCount}
                        </span>
                      }
                    />
                    <StatRow
                      label="Chunks Retrieved"
                      value={
                        <span className="text-blue-700">{data.rag!.chunkCount}</span>
                      }
                    />
                    <StatRow
                      label="Retrieval Scope"
                      value={
                        <Chip accent="border-blue-200 bg-blue-100/60 text-blue-700">
                          Active Documents Only
                        </Chip>
                      }
                    />
                  </div>
                </div>
              )}

              {/* Tools section */}
              {hasTools && (
                <div className="mt-3 rounded-lg border border-orange-200/60 bg-orange-50/30 p-3">
                  <SectionTitle icon={<Wrench className="h-3.5 w-3.5" />}>
                    Tools
                  </SectionTitle>
                  <div className="border-t border-orange-100 pt-1">
                    <StatRow
                      label="Executed"
                      value={
                        <span className="text-orange-700">
                          {data.tools!.executionCount}
                        </span>
                      }
                    />
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {data.tools!.toolNames.map((name) => (
                        <Chip
                          key={name}
                          accent="border-orange-200 bg-orange-100/60 text-orange-700"
                        >
                          {name}
                        </Chip>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Security section (Phase 7.4, Part 8) */}
              {sec && (
                <div className="mt-3 rounded-lg border border-emerald-200/60 bg-emerald-50/30 p-3">
                  <SectionTitle icon={<Shield className="h-3.5 w-3.5" />}>
                    Security
                  </SectionTitle>
                  <div className="border-t border-emerald-100 pt-1">
                    <StatRow
                      label="Input Filter"
                      value={
                        <Chip accent={decisionChip(sec.inputDecision).accent}>
                          {decisionChip(sec.inputDecision).label}
                        </Chip>
                      }
                    />
                    <StatRow
                      label="Output Filter"
                      value={
                        <Chip accent={decisionChip(sec.outputDecision).accent}>
                          {decisionChip(sec.outputDecision).label}
                        </Chip>
                      }
                    />
                    <StatRow
                      label="Prompt Injection Attempts"
                      value={
                        <span className={sec.promptInjectionAttempts > 0 ? "text-red-700" : "text-gray-800"}>
                          {sec.promptInjectionAttempts}
                        </span>
                      }
                    />
                    <StatRow
                      label="Rejected Files"
                      value={
                        <span className={sec.rejectedFiles > 0 ? "text-red-700" : "text-gray-800"}>
                          {sec.rejectedFiles}
                        </span>
                      }
                    />
                    <StatRow
                      label="Rate Limited"
                      value={
                        sec.rateLimited ? (
                          <Chip accent="border-red-200 bg-red-100/60 text-red-700">Yes</Chip>
                        ) : (
                          <Chip accent="border-green-200 bg-green-100/60 text-green-700">No</Chip>
                        )
                      }
                    />
                  </div>
                </div>
              )}

              {/* Future-compatibility reserved slot */}
              {/* Token count · cost · failover · retry · reasoning · safety */}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};