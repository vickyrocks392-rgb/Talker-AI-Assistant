/**
 * Chat endpoint — POST /api/chat
 *
 * Thin HTTP controller. Business logic is delegated to ConversationService.
 * Supports both non-streaming and streaming (Server-Sent Events) responses.
 *
 * Security (Phase 7.4):
 *   - request size limit (express.json in server.ts)
 *   - rate limiting (per client IP)
 *   - input sanitisation + validation
 *   - input content filtering
 *   - output content filtering (post-LLM)
 *   - security telemetry attached to the response
 */

import type express from "express";
import { validateChatRequest } from "../utils/validation";
import { createLogger } from "../utils/logger";
import { getUserFriendlyErrorMessage, OllamaError, ParseError, ValidationError } from "../utils/errors";
import {
  handleNonStreaming,
  handleStreaming,
} from "../ai/conversation/conversationService";
import type { ChatResponse } from "../ai/types";
import {
  getInputSecurityService,
  getContentFilterService,
  getRateLimiter,
  createSecurityMonitor,
  SecurityConfig,
} from "../security";
import type { SecurityTelemetry } from "../security";

const logger = createLogger("ChatRoute");

/** Resolve a stable client identifier for rate limiting. */
function clientKey(req: express.Request): string {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd.length > 0) return fwd.split(",")[0].trim();
  return req.socket.remoteAddress ?? "unknown";
}

export async function handleChat(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
): Promise<void> {
  const sec = createSecurityMonitor();

  try {
    // ── Rate limiting ──
    if (SecurityConfig.enableRateLimit) {
      const rl = getRateLimiter().check(clientKey(req));
      res.setHeader("X-RateLimit-Limit", String(rl.limit));
      res.setHeader("X-RateLimit-Remaining", String(rl.remaining));
      res.setHeader("X-RateLimit-Reset", String(rl.resetSeconds));
      if (!rl.allowed) {
        sec.recordRateLimited();
        logger.warn("Rate limit exceeded", { client: clientKey(req) });
        res.status(429).json({
          error: { code: "RATE_LIMITED", message: "Too many requests. Please slow down." },
          security: sec.getData(),
        });
        return;
      }
    }

    const { text, conversationId, history, persona, stream, attachments, isVoice } = validateChatRequest(req.body as Record<string, unknown>);

    // ── Input sanitisation & validation ──
    const inputSvc = getInputSecurityService();
    const sanResult = inputSvc.sanitize(text, { field: "text" });
    if (sanResult.rejected) {
      sec.recordBlockedRequest(sanResult.reason ?? "INPUT_REJECTED");
      logger.warn("Input rejected by security", { reason: sanResult.reason });
      res.status(400).json({
        error: { code: "INPUT_REJECTED", message: sanResult.message },
        security: sec.getData(),
      });
      return;
    }
    if (sanResult.threats.length > 0) {
      sec.recordInput("warn", sanResult.threats.map((t) => t.type).join(","), sanResult.threats.length);
    }

    // ── Input content filter ──
    let safeText = sanResult.sanitized;
    if (SecurityConfig.enableInputFilter) {
      const cf = getContentFilterService();
      const inResult = cf.filter(sanResult.sanitized, { isOutput: false });
      if (inResult.decision === "block") {
        sec.recordBlockedRequest("CONTENT_FILTER_INPUT");
        logger.warn("Input blocked by content filter", { categories: inResult.matches.map((m) => m.category) });
        res.status(400).json({
          error: { code: "CONTENT_BLOCKED", message: inResult.message ?? "Message blocked by content policy." },
          security: sec.getData(),
        });
        return;
      }
      if (inResult.decision !== "allow") {
        sec.recordInput(inResult.decision, inResult.matches.map((m) => m.category).join(","));
      }
      safeText = inResult.filtered;
    }

    const securitySnapshot: SecurityTelemetry = sec.getData();

    logger.debug("Chat request received", {
      textLength: safeText.length,
      historyLength: history?.length ?? 0,
      streaming: stream ?? false,
      hasConversationId: !!conversationId,
      attachmentsCount: attachments?.length ?? 0,
    });

    // ── Streaming path (SSE) ──────────────────────────────────────
    if (stream === true) {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      await handleStreaming(
        { text: safeText, conversationId, history, persona, stream, attachments, isVoice, security: securitySnapshot },
        // onToken
        (token: string) => {
          res.write(`data: ${JSON.stringify({ token })}\n\n`);
        },
        // onDone
        (result: ChatResponse) => {
          // ── Output content filter (post-LLM) ──
          const finalResult = applyOutputFilter(result, sec);
          res.write(`data: ${JSON.stringify({ done: true, ...finalResult })}\n\n`);
          res.end();
        },
        // onError
        (error: string) => {
          res.write(`data: ${JSON.stringify({ error })}\n\n`);
          res.end();
        },
      );

      return;
    }

    // ── Non-streaming path ────────────────────────────────────────
    const chatResponse = await handleNonStreaming({
      text: safeText,
      conversationId,
      history,
      persona,
      attachments,
      isVoice,
      security: securitySnapshot,
    });

    // ── Output content filter (post-LLM) ──
    const finalResponse = applyOutputFilter(chatResponse, sec);

    logger.debug("Chat response generated", {
      replyLength: finalResponse.replyText.length,
      mapType: finalResponse.mapAction.type,
    });

    res.json(finalResponse);
  } catch (error: unknown) {
    // Model-level failures (Ollama down, parse errors) → graceful 200 fallback
    if (error instanceof OllamaError || error instanceof ParseError) {
      logger.error("Chat model error", error);
      const errorMessage = getUserFriendlyErrorMessage(error);
      res.status(200).json({
        replyText: errorMessage,
        mapAction: { type: "none" },
        searchSources: [],
      } satisfies ChatResponse);
      return;
    }

    // Validation errors from security layer → 400 with telemetry
    if (error instanceof ValidationError) {
      sec.recordBlockedRequest("VALIDATION");
      res.status(400).json({
        error: { code: error.code, message: error.message },
        security: sec.getData(),
      });
      return;
    }

    // Infrastructure errors (config, DB, unexpected) → global error handler
    next(error);
  }
}

/**
 * Apply the output content filter to a chat response.
 * Redacts dangerous output without crashing or leaking internal state.
 */
function applyOutputFilter(
  result: ChatResponse,
  sec: ReturnType<typeof createSecurityMonitor>,
): ChatResponse {
  if (!SecurityConfig.enableOutputFilter) {
    (result as ChatResponse & { security?: SecurityTelemetry }).security = sec.getData();
    return result;
  }

  const cf = getContentFilterService();
  const outResult = cf.filter(result.replyText, { isOutput: true });

  if (outResult.decision !== "allow") {
    sec.recordOutput(outResult.decision, outResult.matches.map((m) => m.category).join(","));
  }

  const finalResult: ChatResponse & { security?: SecurityTelemetry } = {
    ...result,
    replyText: outResult.filtered,
    security: sec.getData(),
  };

  return finalResult;
}