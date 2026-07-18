/**
 * SecretAuditService — startup secret & configuration audit (Phase 7.4, Part 6).
 *
 * Audits environment variables, provider keys, and API secrets.
 * Guarantees secrets are never exposed in logs or responses, startup
 * configuration is validated, and missing required secrets warn clearly.
 */

import { getConfig } from "../config/env";
import { createLogger } from "../utils/logger";

const logger = createLogger("SecretAudit");

export interface SecretAuditResult {
  ok: boolean;
  missing: string[];
  optionalMissing: string[];
  warnings: string[];
}

/**
 * Mask a secret value for safe display. Never returns the raw value.
 */
export function maskSecret(value: string | undefined): string {
  if (!value) return "***(empty)***";
  if (value.length <= 4) return "***";
  return `${value.slice(0, 2)}${"*".repeat(Math.min(value.length - 2, 6))}`;
}

export class SecretAuditService {
  audit(): SecretAuditResult {
    const config = getConfig();
    const missing: string[] = [];
    const optionalMissing: string[] = [];
    const warnings: string[] = [];

    if (config.aiProvider === "groq" && !config.groq.apiKey) {
      missing.push("GROQ_API_KEY");
    }
    if (process.env.AI_PROVIDER_PRIORITY?.includes("gemini") && !config.gemini.apiKey) {
      optionalMissing.push("GEMINI_API_KEY");
    }
    if (config.aiProvider === "ollama" && !config.ollama.baseUrl) {
      warnings.push("OLLAMA_URL is not set; defaulting to localhost.");
    }

    const secretEnvKeys = ["GROQ_API_KEY", "GEMINI_API_KEY", "OPENAI_API_KEY", "ANTHROPIC_API_KEY"];
    for (const key of secretEnvKeys) {
      const val = process.env[key];
      if (val && val.length < 8) {
        warnings.push(`${key} appears too short to be a valid secret.`);
      }
    }

    const ok = missing.length === 0;

    if (!ok) {
      logger.warn("Secret audit FAILED — missing required secrets", { missing });
    } else {
      logger.info("Secret audit passed — no required secrets missing.");
    }
    if (optionalMissing.length > 0) {
      logger.info(`Optional secrets not configured: ${optionalMissing.join(", ")}`);
    }
    for (const w of warnings) logger.warn(w);

    return { ok, missing, optionalMissing, warnings };
  }
}

let instance: SecretAuditService | null = null;

export function getSecretAuditService(): SecretAuditService {
  if (!instance) instance = new SecretAuditService();
  return instance;
}