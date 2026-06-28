/**
 * Text-to-Speech endpoint — POST /api/tts
 *
 * Returns a fallback response that tells the client to use browser-native
 * speech synthesis.  Ollama is a text-only LLM; for production TTS this
 * endpoint can be swapped for Google TTS, AWS Polly, ElevenLabs etc.
 */

import type express from "express";
import { validateTtsRequest } from "../utils/validation";
import { createLogger } from "../utils/logger";

const logger = createLogger("TTSRoute");

interface TTSResponse {
  error: string;
  fallback: boolean;
  message: string;
}

export async function handleTTS(
  req: express.Request,
  res: express.Response,
): Promise<void> {
  try {
    const { text } = validateTtsRequest(req.body as Record<string, unknown>);

    logger.debug("TTS request received", { textLength: text.length });

    const response: TTSResponse = {
      error: "NOT_SUPPORTED",
      fallback: true,
      message:
        "Ollama does not provide TTS. Browser-native speech synthesis is being used instead.",
    };

    res.json(response);
  } catch (error: unknown) {
    logger.error("TTS error", error);

    res.status(500).json({
      error: "INTERNAL_ERROR",
      fallback: true,
      message: "TTS service error. Using browser-native speech synthesis.",
    });
  }
}
