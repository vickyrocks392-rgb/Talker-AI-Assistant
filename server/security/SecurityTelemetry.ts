/**
 * SecurityTelemetry — request-scoped security event collector (Phase 7.4, Part 8).
 *
 * Aggregates security events for a single request and produces a
 * `SecurityTelemetry` object that is returned alongside the AI Monitor data.
 *
 * CRITICAL: No sensitive user data is ever stored or displayed. Only
 * counters, category labels, and dispositions are retained.
 */

import type {
  SecurityEvent,
  SecurityEventType,
  SecurityDecision,
  SecurityTelemetry,
} from "./SecurityTypes";
import { SecurityConfig } from "./SecurityConfig";
import { createLogger } from "../utils/logger";

const logger = createLogger("SecurityTelemetry");

export interface SecurityMonitorCollector {
  /** Record an input-filter decision. */
  recordInput(decision: SecurityDecision, category?: string, count?: number): void;
  /** Record an output-filter decision. */
  recordOutput(decision: SecurityDecision, category?: string, count?: number): void;
  /** Record a blocked request. */
  recordBlockedRequest(reason: string): void;
  /** Record a rejected file. */
  recordRejectedFile(threatType: string): void;
  /** Record a prompt-injection attempt. */
  recordPromptInjection(patterns: string[], score: number): void;
  /** Record a rate-limited request. */
  recordRateLimited(): void;
  /** Record a duplicate file upload. */
  recordDuplicateFile(): void;
  /** Finalise and return the telemetry snapshot. */
  getData(): SecurityTelemetry;
}

export function createSecurityMonitor(): SecurityMonitorCollector {
  const events: SecurityEvent[] = [];
  let inputDecision: SecurityDecision = "allow";
  let outputDecision: SecurityDecision = "allow";
  let promptInjectionAttempts = 0;
  let rejectedFiles = 0;
  let rateLimited = false;

  function push(type: SecurityEventType, decision: SecurityDecision, category: string | undefined, count: number) {
    events.push({ type, decision, category, count, timestamp: Date.now() });
  }

  return {
    recordInput(decision, category, count = 1) {
      inputDecision = decision;
      if (decision !== "allow") push("INPUT_FILTER", decision, category, count);
    },
    recordOutput(decision, category, count = 1) {
      outputDecision = decision;
      if (decision !== "allow") push("OUTPUT_FILTER", decision, category, count);
    },
    recordBlockedRequest(reason) {
      push("BLOCKED_REQUEST", "block", reason, 1);
    },
    recordRejectedFile(threatType) {
      rejectedFiles++;
      push("REJECTED_FILE", "block", threatType, 1);
    },
    recordPromptInjection(patterns, score) {
      promptInjectionAttempts++;
      push("PROMPT_INJECTION", score >= SecurityConfig.injectionFlagScore ? "warn" : "allow", patterns.join(","), patterns.length);
    },
    recordRateLimited() {
      rateLimited = true;
      push("RATE_LIMITED", "block", undefined, 1);
    },
    recordDuplicateFile() {
      push("FILE_DUPLICATE", "warn", "duplicate", 1);
    },
    getData(): SecurityTelemetry {
      const triggered =
        inputDecision !== "allow" ||
        outputDecision !== "allow" ||
        promptInjectionAttempts > 0 ||
        rejectedFiles > 0 ||
        rateLimited ||
        events.length > 0;

      if (triggered) {
        logger.debug("Security telemetry", {
          inputDecision,
          outputDecision,
          promptInjectionAttempts,
          rejectedFiles,
          rateLimited,
        });
      }

      return {
        triggered,
        inputDecision,
        outputDecision,
        promptInjectionAttempts,
        rejectedFiles,
        rateLimited,
        events,
      };
    },
  };
}