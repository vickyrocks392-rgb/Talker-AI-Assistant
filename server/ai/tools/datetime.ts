/**
 * Date-time tool for the Talker AI Tool Engine.
 *
 * Returns the current date, time, ISO 8601 timestamp, and timezone.
 * This tool is stateless — it always returns the moment of execution.
 *
 * ── Returned fields ────────────────────────────────────────────────
 *   date      – Local date in YYYY-MM-DD format
 *   time      – Local time in HH:MM:SS (24-hour) format
 *   iso       – Full ISO 8601 timestamp (e.g. "2026-02-07T15:30:00.000+05:30")
 *   timezone  – IANA timezone name (e.g. "Asia/Calcutta", "America/New_York")
 */

import type { Tool, DateTimeResult } from "./types";

export class DateTimeTool implements Tool<DateTimeResult> {
  readonly name = "datetime";
  readonly description = "Returns the current date, time, ISO timestamp, and timezone";

  async execute(_args: Record<string, unknown>): Promise<
    | { success: true; data: DateTimeResult }
    | { success: false; error: string }
  > {
    try {
      const now = new Date();

      // ── Local date components ─────────────────────────────────
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, "0");
      const day = String(now.getDate()).padStart(2, "0");

      const hours = String(now.getHours()).padStart(2, "0");
      const minutes = String(now.getMinutes()).padStart(2, "0");
      const seconds = String(now.getSeconds()).padStart(2, "0");

      // ── Timezone ──────────────────────────────────────────────
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

      return {
        success: true,
        data: {
          date: `${year}-${month}-${day}`,
          time: `${hours}:${minutes}:${seconds}`,
          iso: now.toISOString(),
          timezone,
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: `DateTime tool failed: ${message}` };
    }
  }
}