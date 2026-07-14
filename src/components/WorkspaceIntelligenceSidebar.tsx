import React, { useEffect, useRef, useState, useCallback } from "react";
import { motion } from "motion/react";
import {
  Brain,
  Cpu,
  Clock,
  Layers,
  Database,
  FileText,
  Wrench,
  Activity,
  Server,
  Boxes,
  Network,
  Search,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Gauge,
  Zap,
  BookOpen,
  Eye,
  X,
} from "lucide-react";
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
      
      // Check if system health became degraded or unavailable
      const prevOverallStatus = health ? (() => {
        const all: HealthStatus[] = [
          health.backend.status,
          health.database.status,
          health.chromadb.status,
          health.embeddings.status,
          health.memory.status,
          health.rag.status,
          health.providers.groq.status,
          health.providers.gemini.status,
          health.providers.ollama.status,
        ];
        if (all.some((s) => s === "unavailable")) return "unavailable";
        if (all.some((s) => s === "degraded")) return "degraded";
        return "healthy";
      })() : null;
      
      const newOverallStatus = (() => {
        const all: HealthStatus[] = [
          data.backend.status,
          data.database.status,
          data.chromadb.status,
          data.embeddings.status,
          data.memory.status,
          data.rag.status,
          data.providers.groq.status,
          data.providers.gemini.status,
          data.providers.ollama.status,
        ];
        if (all.some((s) => s === "unavailable")) return "unavailable";
        if (all.some((s) => s === "degraded")) return "degraded";
        return "healthy";
      })();
      
      // Dispatch event if health became degraded or unavailable
      if (prevOverallStatus === "healthy" && (newOverallStatus === "degraded" || newOverallStatus === "unavailable")) {
        const healthEvent = new CustomEvent('system-degraded');
        window.dispatchEvent(healthEvent);
      }
      
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
  }, [health]);

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

  const overallStatus: HealthStatus = (() => {
    if (!health) return "unavailable";
    const all: HealthStatus[] = [
      health.backend.status,
      health.database.status,
      health.chromadb.status,
      health.embeddings.status,
      health.memory.status,
      health.rag.status,
      health.providers.groq.status,
      health.providers.gemini.status,
      health.providers.ollama.status,
    ];
    if (all.some((s) => s === "unavailable")) return "unavailable";
    if (all.some((s) => s === "degraded")) return "degraded";
    return "healthy";
  })();

  const overallMeta = STATUS_META[overallStatus];

  // Active documents for current conversation context
  const activeDocuments = documents.filter((d) => d.isActive);
  const retrievalMode = (() => {
    const hasMemory = true; // Memory is always available
    const hasRag = activeDocuments.length > 0;
    const hasTools = aiMonitorData?.tools && aiMonitorData.tools.executionCount > 0;
    
    if (hasMemory && hasRag && hasTools) return "Hybrid";
    if (hasMemory && hasRag) return "Memory + RAG";
    if (hasRag) return "RAG";
    if (hasTools) return "Tool Mode";
    return "Memory";
  })();

  return (
    <div className="flex flex-col h-full min-h-0 bg-gray-50/60">
      {/* Header - Fixed */}
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className={`flex h-8 w-8 items-center justify-center rounded-lg bg-gray-900 text-white`}>
            <Gauge className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold tracking-tight text-gray-900">
              Workspace Intelligence
            </h2>
            <p className="text-[10px] text-gray-400">AI operating environment</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadHealth}
            disabled={isRefreshing}
            className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2 py-1 text-[11px] font-medium text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-700 disabled:opacity-50"
            title="Refresh now"
          >
            <RefreshCw className={`h-3 w-3 ${isRefreshing ? "animate-spin" : ""}`} />
            Refresh
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition"
              title="Close sidebar"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Body - Independently scrollable */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-5">
        {loading && !health ? (
          <div className="flex items-center justify-center py-12 text-sm text-gray-400">
            <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
            Loading workspace status…
          </div>
        ) : error && !health ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-4 text-center text-[12px] text-red-600">
            {error}
          </div>
        ) : health ? (
          <>
            {/* Section 1: AI Monitor */}
            <section>
              <SectionHeader
                icon={<Brain className="h-4 w-4" />}
                title="AI Monitor"
                subtitle="Request-scoped telemetry"
              />
              <div className="rounded-xl border border-gray-200/70 bg-white p-3 shadow-sm space-y-1">
                <MetricRow label="Provider" value={aiMonitorData?.provider ?? "—"} />
                <MetricRow label="Model" value={aiMonitorData?.model ?? "—"} />
                <MetricRow 
                  label="Latency" 
                  value={
                    <span className="flex items-center gap-1">
                      <Zap className="h-3 w-3 text-yellow-600" />
                      {aiMonitorData ? `${aiMonitorData.latencyMs}ms` : "—"}
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
                  <div className="border-t border-gray-100 pt-2 mt-1.5">
                    <div className="flex items-center gap-2 rounded-lg bg-gray-50 px-2.5 py-2">
                      <Wrench className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-[11px] font-medium text-gray-600">No Tool Usage Yet</p>
                        <p className="text-[10px] text-gray-400">Tool activity will appear here.</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </section>

            {/* Section 2: System Health */}
            <section>
              <SectionHeader
                icon={<Activity className="h-4 w-4" />}
                title="System Health"
                subtitle="Infrastructure status"
              />
              
              {/* Overall status banner */}
              <div
                className={`mb-3 flex items-center justify-between rounded-xl border bg-white px-3 py-2.5 shadow-sm ring-1 ${overallMeta.ring}`}
              >
                <div className="flex items-center gap-2.5">
                  <span className="relative flex h-2.5 w-2.5">
                    {overallStatus === "healthy" && (
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-60" />
                    )}
                    <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${overallMeta.dot}`} />
                  </span>
                  <span className="text-[12px] font-bold uppercase tracking-wide text-gray-800">
                    {overallStatus === "healthy"
                      ? "All Systems Operational"
                      : overallStatus === "degraded"
                        ? "Partial Degradation"
                        : "Service Disruption"}
                  </span>
                </div>
                <StatusChip status={overallStatus} />
              </div>

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
                <ProviderMiniCard
                  icon={<Cpu className="h-3.5 w-3.5" />}
                  title="Groq API"
                  health={health.providers.groq}
                />
                <ProviderMiniCard
                  icon={<Cpu className="h-3.5 w-3.5" />}
                  title="Gemini API"
                  health={health.providers.gemini}
                />
                <ProviderMiniCard
                  icon={<Cpu className="h-3.5 w-3.5" />}
                  title="Ollama Service"
                  health={health.providers.ollama}
                />
                <MiniCard
                  icon={<Layers className="h-3.5 w-3.5" />}
                  title="Embedding Model"
                  health={health.embeddings}
                />
                <MiniCard
                  icon={<Brain className="h-3.5 w-3.5" />}
                  title="Memory Service"
                  health={health.memory}
                />
                <MiniCard
                  icon={<Search className="h-3.5 w-3.5" />}
                  title="RAG Pipeline"
                  health={health.rag}
                />
              </div>
            </section>

            {/* Section 3: Active Workspace Context */}
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

                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-gray-500">Retrieval Mode</span>
                  <span className="inline-flex items-center rounded-md border border-gray-200 bg-gray-50 px-2 py-0.5 text-[10px] font-medium text-gray-700">
                    {retrievalMode}
                  </span>
                </div>
              </div>
            </section>

            {/* Section 4: Provider Visibility */}
            <section>
              <SectionHeader
                icon={<Eye className="h-4 w-4" />}
                title="Provider Visibility"
                subtitle="Current configuration"
              />
              <div className="rounded-xl border border-gray-200/70 bg-white p-3 shadow-sm space-y-1.5">
                <MetricRow 
                  label="Provider" 
                  value={
                    <span className="flex items-center gap-1">
                      <Network className="h-3 w-3 text-gray-600" />
                      {health.models.provider}
                    </span>
                  }
                />
                <MetricRow 
                  label="Model" 
                  value={
                    <span className="font-mono text-[11px]">
                      {health.models.model}
                    </span>
                  }
                />
                <MetricRow 
                  label="Embeddings" 
                  value={
                    <span className="font-mono text-[11px]">
                      {health.models.embeddingModel}
                    </span>
                  }
                />
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
