import React, { useEffect, useRef, useState, useCallback } from "react";
import { motion } from "motion/react";
import {
  Activity,
  Server,
  Cpu,
  Database,
  Boxes,
  Layers,
  Brain,
  Network,
  Search,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Gauge,
} from "lucide-react";
import {
  fetchSystemHealth,
  type SystemHealthDTO,
  type HealthStatus,
  type ComponentHealthDTO,
  type ProviderHealthDTO,
} from "../lib/api";

/**
 * System Control Center — live operational status of the AI workspace.
 *
 * Surfaces the current provider/model/embedding visibility and the
 * tri-state health of every backend dependency. Polls the backend on a
 * fixed interval and stops polling on unmount to avoid memory leaks.
 *
 * Design language: premium, technical, professional — cards, badges,
 * status chips, subtle shadows, clear typographic hierarchy.
 */

const REFRESH_INTERVAL_MS = 45_000; // 45s — within the 30–60s requirement

// ── Status visual mapping ────────────────────────────────────────────

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

// ── Component card ───────────────────────────────────────────────────

function HealthCard({
  icon,
  title,
  health,
  sub,
}: {
  icon: React.ReactNode;
  title: string;
  health: ComponentHealthDTO;
  sub?: string;
}) {
  const meta = STATUS_META[health.status];
  return (
    <div
      className={`flex items-center gap-3 rounded-xl border border-gray-200/70 bg-white px-3 py-2.5 shadow-sm transition-shadow hover:shadow-md`}
    >
      <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-gray-50 ${meta.text}`}>
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-[13px] font-semibold text-gray-800">
            {title}
          </span>
          <StatusChip status={health.status} />
        </div>
        <div className="mt-0.5 truncate text-[11px] text-gray-400">
          {health.detail ?? sub ?? meta.label}
        </div>
      </div>
    </div>
  );
}

// ── Provider card (shows configured state) ──────────────────────────

function ProviderCard({
  icon,
  title,
  health,
}: {
  icon: React.ReactNode;
  title: string;
  health: ProviderHealthDTO;
}) {
  const meta = STATUS_META[health.status];
  const notConfigured = !health.configured;
  return (
    <div className="flex items-center gap-3 rounded-xl border border-gray-200/70 bg-white px-3 py-2.5 shadow-sm transition-shadow hover:shadow-md">
      <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-gray-50 ${meta.text}`}>
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-[13px] font-semibold text-gray-800">
            {title}
          </span>
          {notConfigured ? (
            <span className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-400">
              Not Configured
            </span>
          ) : (
            <StatusChip status={health.status} />
          )}
        </div>
        <div className="mt-0.5 truncate text-[11px] text-gray-400">
          {notConfigured ? "API key not set" : health.detail ?? meta.label}
        </div>
      </div>
    </div>
  );
}

// ── Model visibility row ─────────────────────────────────────────────

function ModelRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-[11px] font-medium uppercase tracking-wide text-gray-400">
        {label}
      </span>
      <span className="truncate font-mono text-[12px] font-semibold text-gray-800">
        {value}
      </span>
    </div>
  );
}

// ── "time ago" helper ────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return `${seconds} second${seconds === 1 ? "" : "s"} ago`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
}

// ── Main component ───────────────────────────────────────────────────

export const SystemHealthPanel: React.FC = () => {
  const [health, setHealth] = useState<SystemHealthDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);

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

  // Initial load + interval polling. Cleanup on unmount.
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

  return (
    <div className="flex h-full flex-col bg-gray-50/60">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
        <div className="flex items-center gap-2">
          <div className={`flex h-8 w-8 items-center justify-center rounded-lg bg-gray-900 text-white`}>
            <Gauge className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold tracking-tight text-gray-900">
              System Control Center
            </h2>
            <p className="text-[10px] text-gray-400">Live AI workspace status</p>
          </div>
        </div>
        <button
          onClick={loadHealth}
          disabled={isRefreshing}
          className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2 py-1 text-[11px] font-medium text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-700 disabled:opacity-50"
          title="Refresh now"
        >
          <RefreshCw className={`h-3 w-3 ${isRefreshing ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {loading && !health ? (
          <div className="flex items-center justify-center py-12 text-sm text-gray-400">
            <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
            Loading system status…
          </div>
        ) : error && !health ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-4 text-center text-[12px] text-red-600">
            {error}
          </div>
        ) : health ? (
          <div className="space-y-5">
            {/* Overall status banner */}
            <div
              className={`flex items-center justify-between rounded-xl border bg-white px-3 py-2.5 shadow-sm ring-1 ${overallMeta.ring}`}
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

            {/* Model Visibility */}
            <section>
              <div className="mb-2 flex items-center gap-1.5">
                <Cpu className="h-3.5 w-3.5 text-gray-400" />
                <span className="text-[11px] font-bold uppercase tracking-widest text-gray-500">
                  Model Visibility
                </span>
              </div>
              <div className="rounded-xl border border-gray-200/70 bg-white px-3 py-1 shadow-sm divide-y divide-gray-100">
                <ModelRow label="Provider" value={health.models.provider} />
                <ModelRow label="Model" value={health.models.model} />
                <ModelRow label="Embedding Model" value={health.models.embeddingModel} />
              </div>
            </section>

            {/* Infrastructure Health */}
            <section>
              <div className="mb-2 flex items-center gap-1.5">
                <Server className="h-3.5 w-3.5 text-gray-400" />
                <span className="text-[11px] font-bold uppercase tracking-widest text-gray-500">
                  Infrastructure
                </span>
              </div>
              <div className="grid grid-cols-1 gap-2">
                <HealthCard
                  icon={<Activity className="h-4 w-4" />}
                  title="Backend API"
                  health={health.backend}
                />
                <HealthCard
                  icon={<Database className="h-4 w-4" />}
                  title="SQLite"
                  health={health.database}
                />
                <HealthCard
                  icon={<Boxes className="h-4 w-4" />}
                  title="ChromaDB"
                  health={health.chromadb}
                />
              </div>
            </section>

            {/* AI Providers */}
            <section>
              <div className="mb-2 flex items-center gap-1.5">
                <Network className="h-3.5 w-3.5 text-gray-400" />
                <span className="text-[11px] font-bold uppercase tracking-widest text-gray-500">
                  AI Providers
                </span>
              </div>
              <div className="grid grid-cols-1 gap-2">
                <ProviderCard
                  icon={<Cpu className="h-4 w-4" />}
                  title="Groq API"
                  health={health.providers.groq}
                />
                <ProviderCard
                  icon={<Cpu className="h-4 w-4" />}
                  title="Gemini API"
                  health={health.providers.gemini}
                />
                <ProviderCard
                  icon={<Cpu className="h-4 w-4" />}
                  title="Ollama Service"
                  health={health.providers.ollama}
                />
              </div>
            </section>

            {/* Intelligence Layer */}
            <section>
              <div className="mb-2 flex items-center gap-1.5">
                <Brain className="h-3.5 w-3.5 text-gray-400" />
                <span className="text-[11px] font-bold uppercase tracking-widest text-gray-500">
                  Intelligence
                </span>
              </div>
              <div className="grid grid-cols-1 gap-2">
                <HealthCard
                  icon={<Layers className="h-4 w-4" />}
                  title="Embedding Model"
                  health={health.embeddings}
                />
                <HealthCard
                  icon={<Brain className="h-4 w-4" />}
                  title="Memory Service"
                  health={health.memory}
                />
                <HealthCard
                  icon={<Search className="h-4 w-4" />}
                  title="RAG Pipeline"
                  health={health.rag}
                />
              </div>
            </section>
          </div>
        ) : null}
      </div>

      {/* Footer: last updated */}
      <div className="border-t border-gray-200 px-4 py-2.5">
        <div className="flex items-center justify-between text-[10px] text-gray-400">
          <span>
            {lastUpdated ? `Last updated: ${timeAgo(lastUpdated)}` : "—"}
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