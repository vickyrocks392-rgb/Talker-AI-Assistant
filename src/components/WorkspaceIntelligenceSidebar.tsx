import React, { useEffect, useRef, useState, useCallback } from "react";
import { motion } from "motion/react";
import {
  Brain,
  Cpu,
  Layers,
  Database,
  FileText,
  Wrench,
  Activity,
  Server,
  Boxes,
  Search,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Gauge,
  Zap,
  BookOpen,
  X,
} from "lucide-react";
import { Logo } from "./Logo";
import {
  fetchSystemHealth,
  type SystemHealthDTO,
  type HealthStatus,
  type ComponentHealthDTO,
  type ProviderHealthDTO,
} from "../lib/api";
import type { AIMonitorDTO } from "../lib/api";
import { useDocumentManager } from "../hooks/useDocumentManager";

// ── Constants ────────────────────────────────────────────────────────────

const REFRESH_INTERVAL_MS = 45_000; // 45s

// ── Status visual mapping ────────────────────────────────────────────────

const STATUS_META: Record<
  HealthStatus,
  { label: string; dot: string; chip: string; text: string; ring: string }
> = {
  healthy: {
    label: "Healthy",
    dot: "bg-green-500",
    chip: "bg-green-50 border-green-200 text-green-700",
    text: "text-green-600",
    ring: "ring-green-500/20",
  },
  degraded: {
    label: "Degraded",
    dot: "bg-yellow-500",
    chip: "bg-yellow-50 border-yellow-200 text-yellow-700",
    text: "text-yellow-600",
    ring: "ring-yellow-500/20",
  },
  unavailable: {
    label: "Offline",
    dot: "bg-red-500",
    chip: "bg-red-50 border-red-200 text-red-700",
    text: "text-red-600",
    ring: "ring-red-500/20",
  },
};

// ── Presentational helpers ────────────────────────────────────────────────

function StatusIcon({ status }: { status: HealthStatus }) {
  if (status === "healthy") return <CheckCircle2 className="h-3.5 w-3.5" />;
  if (status === "degraded") return <AlertTriangle className="h-3.5 w-3.5" />;
  return <XCircle className="h-3.5 w-3.5" />;
}

function StatusChip({ status }: { status: HealthStatus }) {
  const meta = STATUS_META[status];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${meta.chip}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
      {meta.label}
    </span>
  );
}

function SectionHeader({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle?: string }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gray-900 text-white">
        {icon}
      </div>
      <div>
        <h3 className="text-[11px] font-bold uppercase tracking-widest text-gray-900">
          {title}
        </h3>
        {subtitle && (
          <p className="text-[10px] text-gray-500">{subtitle}</p>
        )}
      </div>
    </div>
  );
}

function MetricRow({ label, value, accent }: { label: string; value: React.ReactNode; accent?: string }) {
  return (
    <div className="flex items-center justify-between gap-2 py-1.5">
      <span className="text-[11px] text-gray-500">{label}</span>
      <span className={`text-[11px] font-semibold text-gray-800 truncate ${accent || ""}`}>
        {value}
      </span>
    </div>
  );
}

function MiniCard({ icon, title, health, sub }: { icon: React.ReactNode; title: string; health: ComponentHealthDTO; sub?: string }) {
  const meta = STATUS_META[health.status];
  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-gray-200/70 bg-white px-2.5 py-2 shadow-sm">
      <div className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-gray-50 ${meta.text}`}>
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-1.5">
          <span className="truncate text-[12px] font-semibold text-gray-800">{title}</span>
          <StatusChip status={health.status} />
        </div>
        <div className="mt-0.5 truncate text-[10px] text-gray-400">
          {health.detail ?? sub ?? meta.label}
        </div>
      </div>
    </div>
  );
}

function ProviderMiniCard({ icon, title, health }: { icon: React.ReactNode; title: string; health: ProviderHealthDTO }) {
  const meta = STATUS_META[health.status];
  const notConfigured = !health.configured;
  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-gray-200/70 bg-white px-2.5 py-2 shadow-sm">
      <div className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-gray-50 ${meta.text}`}>
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-1.5">
          <span className="truncate text-[12px] font-semibold text-gray-800">{title}</span>
          {notConfigured ? (
            <span className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-400">
              Not Configured
            </span>
          ) : (
            <StatusChip status={health.status} />
          )}
        </div>
        <div className="mt-0.5 truncate text-[10px] text-gray-400">
          {notConfigured ? "API key not set" : health.detail ?? meta.label}
        </div>
      </div>
    </div>
  );
}

function timeAgo(iso: string): string {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ago`;
}

// ── Workspace status logic ────────────────────────────────────────────────

type WorkspaceStatus = "operational" | "degraded" | "offline";

interface WorkspaceSummary {
  status: WorkspaceStatus;
  label: string;
  description: string;
  healthyCount: number;
  totalCount: number;
}

/**
 * Determines whether a status value represents a healthy/operational state.
 * Single source of truth for health counting.
 */
function isHealthyState(status: string): boolean {
  return ["healthy", "ready", "active", "operational"].includes(status.toLowerCase());
}

function computeWorkspaceStatus(
  health: SystemHealthDTO,
  ragPipelineStatus: string | null,
): WorkspaceSummary {
  // Core capability: backend must be healthy
  const backendHealthy = health.backend.status === "healthy";

  // AI capability: at least one provider must be available and configured
  const providers = [health.providers.groq, health.providers.gemini, health.providers.ollama];
  const anyProviderAvailable = providers.some(
    (p) => p.status === "healthy" && p.configured
  );

  // Count ONLY visible System Health cards.
  // The embedding model card was removed from System Health (now in AI Monitor),
  // so health.embeddings is excluded. Only configured providers are counted.
  // Visible cards: Backend, SQLite, ChromaDB, configured providers, Memory, RAG.
  // RAG uses the session-aware ragPipelineStatus (active/ready/degraded/disabled)
  // rather than health.rag.status, matching what the RAG card actually displays.
  const configuredProviders = providers.filter((p) => p.configured);
  const totalCount = 5 + configuredProviders.length; // Backend, SQLite, ChromaDB, Memory, RAG
  const healthyCount = [
    health.backend.status,
    health.database.status,
    health.chromadb.status,
    health.memory.status,
    ragPipelineStatus ?? health.rag.status,
    ...configuredProviders.map((p) => p.status),
  ].filter((s) => isHealthyState(s)).length;

  // ── Determine workspace status ──
  // OFFLINE: backend unavailable OR no providers available
  if (!backendHealthy || !anyProviderAvailable) {
    return {
      status: "offline",
      label: "Workspace Offline",
      description: "AI chat is currently unavailable",
      healthyCount,
      totalCount,
    };
  }

  // Chat works — workspace is operational.
  // Optional services (ChromaDB, embeddings, RAG) do NOT downgrade status.
  // Only degrade when a core capability currently being used fails,
  // which is detected at the session level, not the infrastructure level.
  return {
    status: "operational",
    label: "Workspace Operational",
    description: "AI + Memory + RAG Ready",
    healthyCount,
    totalCount,
  };
}

// ── Main component ────────────────────────────────────────────────────────

interface WorkspaceIntelligenceSidebarProps {
  aiMonitorData: AIMonitorDTO | null;
  onClose?: () => void;
}

export const WorkspaceIntelligenceSidebar: React.FC<WorkspaceIntelligenceSidebarProps> = ({ aiMonitorData, onClose }) => {
  const [health, setHealth] = useState<SystemHealthDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);

  const { documents } = useDocumentManager();

  const loadHealth = useCallback(async () => {
    if (!mountedRef.current) return;
    setIsRefreshing(true);
    try {
      const data = await fetchSystemHealth();
      if (!mountedRef.current) return;

      setHealth(data);
      setLastUpdated(data.timestamp);
      setError(null);
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err instanceof Error ? err.message : "Failed to load health");
    } finally {
      if (mountedRef.current) {
        setLoading(false);
        setIsRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    loadHealth();

    timerRef.current = setInterval(loadHealth, REFRESH_INTERVAL_MS);

    return () => {
      mountedRef.current = false;
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [loadHealth]);

  // Active documents for current conversation context
  const activeDocuments = documents.filter((d) => d.isActive);

  // ── Determine which providers are configured ──
  const configuredProviders = health
    ? ([
        { key: "groq" as const, title: "Groq API", health: health.providers.groq },
        { key: "gemini" as const, title: "Gemini API", health: health.providers.gemini },
        { key: "ollama" as const, title: "Ollama Service", health: health.providers.ollama },
      ] as const).filter((p) => p.health.configured)
    : [];

  // ── Session evidence: have documents been indexed? ──
  const hasIndexedDocuments = documents.some(
    (d) => d.indexed && (d.chunkCount ?? 0) > 0
  );

  // ── Session evidence: has RAG been used in this session? ──
  const ragUsedInSession = (aiMonitorData?.rag?.activeDocCount ?? 0) > 0;

  // ── Embedding model status (capability-based, session-aware) ──
  // Priority: session evidence > health check
  const embeddingStatus = (() => {
    if (!health) return null;

    // Session evidence: if documents are indexed, embeddings demonstrably work
    if (hasIndexedDocuments || ragUsedInSession) {
      return { status: "healthy" as const, label: "Healthy" };
    }

    // Health check fallback
    const e = health.embeddings;
    if (e.status === "healthy") return { status: "healthy" as const, label: "Healthy" };
    if (e.status === "unavailable") return { status: "disabled" as const, label: "Not Installed" };
    return { status: "disabled" as const, label: "Not Installed" };
  })();

  // ── RAG Pipeline status (capability-based, session-aware) ──
  // Priority: session evidence > health check
  const ragStatus = (() => {
    if (!health) return null;

    // Session evidence: RAG was actively used in this session
    if (ragUsedInSession) {
      return { status: "active" as const, label: "Active" };
    }

    // Session evidence: documents are indexed and ready for retrieval
    if (hasIndexedDocuments) {
      return { status: "ready" as const, label: "Ready" };
    }

    // Health check fallback
    const r = health.rag;
    const e = health.embeddings;
    const c = health.chromadb;

    if (r.status === "healthy") return { status: "ready" as const, label: "Ready" };
    if (e.status !== "healthy") return { status: "disabled" as const, label: "Disabled" };
    if (c.status !== "healthy") return { status: "disabled" as const, label: "Disabled" };
    if (r.status === "degraded") return { status: "degraded" as const, label: "Degraded" };
    return { status: "disabled" as const, label: "Disabled" };
  })();

  // ── RAG chip color mapping (extends HealthStatus with custom states) ──
  const ragChipClass = (() => {
    if (!ragStatus) return "bg-gray-50 border-gray-200 text-gray-400";
    switch (ragStatus.status) {
      case "active":
        return "bg-green-50 border-green-200 text-green-700";
      case "ready":
        return "bg-green-50 border-green-200 text-green-700";
      case "degraded":
        return "bg-yellow-50 border-yellow-200 text-yellow-700";
      case "disabled":
        return "bg-gray-50 border-gray-200 text-gray-400";
    }
  })();

  const ragDotClass = (() => {
    if (!ragStatus) return "bg-gray-400";
    switch (ragStatus.status) {
      case "active": return "bg-green-500";
      case "ready": return "bg-green-500";
      case "degraded": return "bg-yellow-500";
      case "disabled": return "bg-gray-400";
    }
  })();

  // ── Compute workspace summary (after ragStatus is available) ──
  const summary = health ? computeWorkspaceStatus(health, ragStatus?.status ?? null) : null;

  const summaryMeta = (() => {
    if (!summary) return STATUS_META.unavailable;
    if (summary.status === "operational") return STATUS_META.healthy;
    if (summary.status === "degraded") return STATUS_META.degraded;
    return STATUS_META.unavailable;
  })();

  // ── Latency display (no fake precision) ──
  const latencyDisplay = (() => {
    if (!aiMonitorData) return "—";
    const ms = aiMonitorData.latencyMs;
    if (ms === 0 || ms === undefined || ms === null) return "—";
    if (ms < 1) return "<1ms";
    return `${Math.round(ms)}ms`;
  })();

  return (
    <div className="flex flex-col h-full min-h-0 bg-gray-50/60">
      {/* Header - Fixed */}
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Logo size="sm" showText={false} />
          <div>
            <h2 className="text-sm font-bold tracking-tight text-gray-900">
              Workspace Intelligence
            </h2>
            <p className="text-[10px] text-gray-400">AI operating environment</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={loadHealth}
            disabled={isRefreshing}
            className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2 py-1 text-[11px] font-medium text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-700 disabled:opacity-50 button-press"
            title="Refresh now"
          >
            <RefreshCw className={`h-3 w-3 ${isRefreshing ? "animate-spin" : ""}`} />
            Refresh
          </motion.button>
          {onClose && (
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition button-press"
            title="Close sidebar"
            aria-label="Close workspace sidebar"
          >
            <X className="w-4 h-4" />
          </motion.button>
          )}
        </div>
      </div>

      {/* Body - Independently scrollable */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-5">
        {loading && !health ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center justify-center py-12 text-sm text-gray-400"
          >
            <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
            Loading workspace status…
          </motion.div>
        ) : error && !health ? (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-xl border border-red-200 bg-red-50 px-3 py-4 text-center text-[12px] text-red-600"
          >
            {error}
          </motion.div>
        ) : health && summary ? (
          <>
            {/* Workspace Summary — Primary status indicator */}
            <section>
              <div
                className={`rounded-xl border bg-white px-4 py-3.5 shadow-sm ring-1 ${summaryMeta.ring}`}
              >
                <div className="flex items-center gap-3">
                  <span className="relative flex h-3 w-3">
                    {summary.status === "operational" && (
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-60" />
                    )}
                    <span className={`relative inline-flex h-3 w-3 rounded-full ${summaryMeta.dot}`} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-bold text-gray-900">
                      {summary.label}
                    </p>
                    <p className="text-[11px] text-gray-500 mt-0.5">
                      {summary.description}
                    </p>
                  </div>
                  <span className="text-[10px] text-gray-400 whitespace-nowrap">
                    {summary.healthyCount}/{summary.totalCount} healthy
                  </span>
                </div>
              </div>
            </section>

            {/* AI Monitor — No fake precision */}
            <section>
              <SectionHeader
                icon={<Brain className="h-4 w-4" />}
                title="AI Monitor"
                subtitle="Request-scoped telemetry"
              />
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-xl border border-gray-200/70 bg-white p-3 shadow-sm space-y-1"
              >
                <MetricRow label="Provider" value={aiMonitorData?.provider ?? "—"} />
                <MetricRow label="Model" value={aiMonitorData?.model ?? "—"} />
                <MetricRow 
                  label="Embeddings" 
                  value={
                    <span className="flex items-center gap-1">
                      <Layers className="h-3 w-3 text-indigo-600" />
                      nomic-embed-text
                    </span>
                  } 
                />
                <MetricRow 
                  label="Latency" 
                  value={
                    <span className="flex items-center gap-1">
                      <Zap className="h-3 w-3 text-yellow-600" />
                      {latencyDisplay}
                    </span>
                  } 
                />
                <MetricRow label="Mode" value={aiMonitorData?.mode ?? "—"} />
                
                {aiMonitorData?.memory && (
                  <div className="border-t border-gray-100 pt-1.5 mt-1.5 space-y-1">
                    <MetricRow 
                      label="Memory" 
                      value={
                        <span className="flex items-center gap-1">
                          <Database className="h-3 w-3 text-purple-600" />
                          {aiMonitorData.memory.entryCount} entries
                        </span>
                      }
                    />
                    <MetricRow 
                      label="Confidence" 
                      value={`${Math.round(aiMonitorData.memory.avgConfidence * 100)}%`}
                      accent="text-purple-600"
                    />
                  </div>
                )}
                
                {aiMonitorData?.rag && (
                  <div className="border-t border-gray-100 pt-1.5 mt-1.5 space-y-1">
                    <MetricRow 
                      label="RAG Docs" 
                      value={
                        <span className="flex items-center gap-1">
                          <FileText className="h-3 w-3 text-blue-600" />
                          {aiMonitorData.rag.activeDocCount} active
                        </span>
                      }
                    />
                    <MetricRow 
                      label="Chunks" 
                      value={aiMonitorData.rag.chunkCount}
                      accent="text-blue-600"
                    />
                  </div>
                )}
                
                {aiMonitorData?.tools && aiMonitorData.tools.executionCount > 0 ? (
                  <div className="border-t border-gray-100 pt-1.5 mt-1.5">
                    <MetricRow 
                      label="Tools" 
                      value={
                        <span className="flex items-center gap-1">
                          <Wrench className="h-3 w-3 text-orange-600" />
                          {aiMonitorData.tools.executionCount} executed
                        </span>
                      }
                    />
                  </div>
                ) : (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="border-t border-gray-100 pt-2 mt-1.5"
                  >
                    <div className="flex items-center gap-2 rounded-lg bg-gray-50 px-2.5 py-2">
                      <Wrench className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-[11px] font-medium text-gray-600">No Tool Usage Yet</p>
                        <p className="text-[10px] text-gray-400">Tool activity will appear here.</p>
                      </div>
                    </div>
                  </motion.div>
                )}
              </motion.div>
            </section>

            {/* System Health — Clean, accurate, user-centric */}
            <section>
              <SectionHeader
                icon={<Activity className="h-4 w-4" />}
                title="System Health"
                subtitle="Infrastructure status"
              />

              <div className="space-y-2">
                <MiniCard
                  icon={<Server className="h-3.5 w-3.5" />}
                  title="Backend API"
                  health={health.backend}
                />
                <MiniCard
                  icon={<Database className="h-3.5 w-3.5" />}
                  title="SQLite"
                  health={health.database}
                />
                <MiniCard
                  icon={<Boxes className="h-3.5 w-3.5" />}
                  title="ChromaDB"
                  health={health.chromadb}
                />

                {/* Only show configured providers */}
                {configuredProviders.map((p) => (
                  <div key={p.key}>
                    <ProviderMiniCard
                      icon={<Cpu className="h-3.5 w-3.5" />}
                      title={p.title}
                      health={p.health}
                    />
                  </div>
                ))}

                <MiniCard
                  icon={<Brain className="h-3.5 w-3.5" />}
                  title="Memory Service"
                  health={health.memory}
                />

                {/* RAG Pipeline — capability-based, session-aware, restored naming */}
                <div className="flex items-center gap-2.5 rounded-lg border border-gray-200/70 bg-white px-2.5 py-2 shadow-sm">
                  <div className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-gray-50 ${
                    ragStatus?.status === "active" || ragStatus?.status === "ready"
                      ? "text-green-600"
                      : ragStatus?.status === "degraded"
                        ? "text-yellow-600"
                        : "text-gray-400"
                  }`}>
                    <Search className="h-3.5 w-3.5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1.5">
                      <span className="truncate text-[12px] font-semibold text-gray-800">RAG Pipeline</span>
                      <span
                        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${ragChipClass}`}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full ${ragDotClass}`} />
                        {ragStatus?.label ?? "Disabled"}
                      </span>
                    </div>
                    <div className="mt-0.5 truncate text-[10px] text-gray-400">
                      {ragStatus?.label === "Active"
                        ? "Retrieving documents in current session"
                        : ragStatus?.label === "Ready"
                          ? "Documents indexed, ready for retrieval"
                          : ragStatus?.label === "Degraded"
                            ? "Retrieval impaired"
                            : "Retrieval not available"}
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* Workspace Context — reduced density */}
            <section>
              <SectionHeader
                icon={<BookOpen className="h-4 w-4" />}
                title="Workspace Context"
                subtitle="Current conversation state"
              />
              <div className="rounded-xl border border-gray-200/70 bg-white p-3 shadow-sm space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-gray-500">Active Documents</span>
                  <span className="text-[11px] font-semibold text-gray-800">
                    {activeDocuments.length}
                  </span>
                </div>
                
                {activeDocuments.length > 0 ? (
                  <div className="space-y-1.5 pt-1.5 border-t border-gray-100">
                    {activeDocuments.map((doc) => (
                      <div
                        key={doc.documentId}
                        className="flex items-center gap-2 rounded-lg bg-gray-50 px-2.5 py-2"
                      >
                        <FileText className="h-3.5 w-3.5 text-gray-600 flex-shrink-0" />
                        <span className="text-[11px] font-medium text-gray-800 truncate flex-1">
                          {doc.filename}
                        </span>
                        <span className="text-[10px] text-gray-500">
                          {doc.chunkCount ?? 0} chunks
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="pt-2 border-t border-gray-100">
                    <div className="flex items-center gap-2 rounded-lg bg-gray-50 px-2.5 py-2">
                      <FileText className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-[11px] font-medium text-gray-600">No Active Documents Yet</p>
                        <p className="text-[10px] text-gray-400">Attach documents to enable retrieval.</p>
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between pt-1.5 border-t border-gray-100">
                  <span className="text-[11px] text-gray-500">Memory Entries</span>
                  <span className="text-[11px] font-semibold text-gray-800">
                    {aiMonitorData?.memory ? aiMonitorData.memory.entryCount : "—"}
                  </span>
                </div>

                {!aiMonitorData?.memory && (
                  <div className="pt-2 border-t border-gray-100">
                    <div className="flex items-center gap-2 rounded-lg bg-gray-50 px-2.5 py-2">
                      <Database className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-[11px] font-medium text-gray-600">No Memory Retrieved Yet</p>
                        <p className="text-[10px] text-gray-400">Cross-conversation memory will appear here.</p>
                      </div>
                    </div>
                  </div>
                )}

                {!aiMonitorData && (
                  <div className="pt-2 border-t border-gray-100">
                    <div className="flex items-center gap-2 rounded-lg bg-gray-50 px-2.5 py-2">
                      <Activity className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-[11px] font-medium text-gray-600">No Workspace Activity Yet</p>
                        <p className="text-[10px] text-gray-400">Start chatting to activate workspace intelligence.</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </section>
          </>
        ) : null}
      </div>

      {/* Footer - Fixed */}
      <div className="border-t border-gray-200 px-4 py-2.5 flex-shrink-0">
        <div className="flex items-center justify-between text-[10px] text-gray-400">
          <span>
            {lastUpdated ? `Updated ${timeAgo(lastUpdated)}` : "—"}
          </span>
          <span className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-400" />
            Auto-refresh 45s
          </span>
        </div>
      </div>
    </div>
  );
};