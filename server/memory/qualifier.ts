/**
 * Memory Qualifier — determines whether a Q&A pair is worth saving
 * to global memory.
 *
 * Global memory should store long-term useful knowledge, not become a
 * dump of every message ever sent. This module implements heuristic
 * classification to filter out low-value entries before they reach
 * the repository layer.
 *
 * Design principles:
 *   - Deterministic and rule-based (no ML, no external calls)
 *   - False negatives preferred over false positives
 *   - Better to miss useful memory than to pollute memory
 *   - Simple, readable rules with clear intent
 */

import { createLogger } from "../utils/logger";

const logger = createLogger("MemoryQualifier");

// ── Thresholds ──────────────────────────────────────────────────────

/**
 * Minimum character length for the query to be considered meaningful.
 */
const MIN_QUERY_LENGTH = 15;

/**
 * Minimum character length for the answer to be considered meaningful.
 */
const MIN_ANSWER_LENGTH = 20;

/**
 * Minimum information density ratio (content words / total words).
 * Below this threshold, the text is likely filler or conversational.
 */
const MIN_INFORMATION_DENSITY = 0.35;

/**
 * Minimum number of content words required for a save-worthy entry.
 */
const MIN_CONTENT_WORDS = 4;

// ── Greeting / Acknowledgement Patterns ─────────────────────────────

/**
 * Patterns that indicate a greeting, acknowledgement, or conversational
 * filler that should NOT be saved to memory.
 * Matched case-insensitively against the query.
 */
const GREETING_PATTERNS: RegExp[] = [
  /^(hi|hello|hey|yo|sup|howdy)\b/i,
  /^(thanks|thank you|ty|thx|cheers|appreciate it)\b/i,
  /^(okay|ok|k|kk|sure|alright|got it|roger|copy)\b/i,
  /^(nice|cool|awesome|great|good|perfect|excellent|amazing|wonderful)\s*$/i,
  /^(yes|yeah|yep|yup|no|nope|nah)\s*$/i,
  /^(lol|lmao|rofl|haha|hehe)\b/i,
  /^(bye|goodbye|see you|cya|later|gotta go)\b/i,
  /^(continue|go on|proceed|next|keep going)\s*$/i,
  /^(let's do it|let's go|do it|go ahead)\s*$/i,
  /^(that worked|it worked|fixed|resolved|solved)\s*$/i,
  /^(that fixed it|that did it|that's it|that's all)\s*$/i,
  /^(wait|hold on|one moment|brb)\s*$/i,
  /^(what|huh|pardon|sorry|excuse me)\s*$/i,
];

// ── Save-Worthy Indicators ──────────────────────────────────────────

/**
 * Keywords/phrases in the query that strongly indicate the content
 * contains reusable information worth saving to memory.
 * Each keyword contributes a score; higher scores = more likely to save.
 */
const SAVE_INDICATORS: { pattern: RegExp; score: number }[] = [
  // Technology & stack declarations
  { pattern: /(preferred|favourite|favorite|use|using|chosen|selected)\s+(stack|tech|technology|framework|library|tool|platform|language|database)/i, score: 3 },
  { pattern: /(my|our|the)\s+(preferred|favourite|favorite|main|primary|go-to|default)\s+(stack|tech|language|framework|tool|platform)/i, score: 3 },
  { pattern: /\b(stack|tech|technology|framework|library|tool|platform|language|database|orm|ui|api)\s+(is|are|will be|should be)\s+/i, score: 2 },

  // Project decisions
  { pattern: /(project|app|application|system|service|platform)\s+(name|called|renamed|is|will be)\s+/i, score: 3 },
  { pattern: /(decided|chosen|selected|picked|settled on|going with|using)\s+/i, score: 2 },
  { pattern: /(architecture|design|pattern|approach|strategy|plan)\s+(decision|choice|is|was|will be)/i, score: 3 },

  // Configuration & settings
  { pattern: /(configured|set up|setup|settings|config|configuration)\s+(for|is|as|to)/i, score: 2 },
  { pattern: /(model|embedding|provider|endpoint|port|host|url)\s+(is|should be|will be|was set to)/i, score: 2 },

  // Conventions & rules
  { pattern: /(convention|standard|rule|policy|guideline|best practice|pattern)\s+(is|should be|follows|uses)/i, score: 3 },
  { pattern: /(naming|formatting|structure|organization)\s+(convention|standard|pattern|rule)/i, score: 3 },

  // Workflows & processes
  { pattern: /(workflow|process|pipeline|flow|step|procedure|method)\s+(is|involves|requires|uses|follows)/i, score: 2 },
  { pattern: /(deploy|build|test|run|migrate|release)\s+(process|pipeline|workflow|step|procedure)/i, score: 2 },

  // Facts & preferences
  { pattern: /(prefer|like|love|enjoy|want|need|require)\s+(working with|using|to use)/i, score: 2 },
  { pattern: /(fact|note|remember|important|key|critical|essential)\s*:/i, score: 3 },
  { pattern: /(user|client|customer)\s+(prefers|likes|wants|needs|requires)\s+/i, score: 2 },

  // Explanations with substance
  { pattern: /(because|reason|why|explain|meaning|purpose|goal|objective)\s+/i, score: 1 },
  { pattern: /(works by|functions by|operates|handles|manages|processes)\s+/i, score: 1 },
];

// ── Filler / Non-Memorable Patterns ─────────────────────────────────

/**
 * Patterns in the answer that suggest the response is a simple
 * acknowledgement or confirmation without reusable information.
 */
const FILLER_ANSWER_PATTERNS: RegExp[] = [
  /^(yes|no|okay|sure|alright|got it|understood|certainly|absolutely)\s*\.?\s*$/i,
  /^(i'll|i will|let me|let's|we'll)\s+(check|look|see|try|find|get back)\b/i,
  /^(that's|that is)\s+(great|good|nice|cool|awesome|fine|okay|correct|right)\s*\.?\s*$/i,
  /^(no problem|no worries|my pleasure|happy to help|glad to help|anytime)\s*\.?\s*$/i,
  /^(sounds|looks|seems)\s+(good|great|fine|okay|reasonable|about right)\s*\.?\s*$/i,
];

// ── Public API ──────────────────────────────────────────────────────

/**
 * Result of the memory qualification check.
 */
export interface QualificationResult {
  /** Whether the Q&A pair should be saved to global memory. */
  shouldSave: boolean;

  /** Human-readable reason for the decision (for logging/debugging). */
  reason: string;

  /** Quality score (0.0 – 1.0) for potential future tuning. */
  score: number;
}

/**
 * Evaluate whether a Q&A pair is worth saving to global memory.
 *
 * The qualification uses a multi-factor heuristic:
 *   1. Length checks — reject very short queries/answers
 *   2. Greeting/acknowledgement detection — reject conversational filler
 *   3. Information density — reject low-density text
 *   4. Save-worthy indicator scoring — reward substantive content
 *   5. Filler answer detection — reject empty confirmations
 *
 * @param query - The user's question text.
 * @param answer - The assistant's answer text.
 * @returns A QualificationResult indicating whether to save.
 */
export function qualifyForMemory(query: string, answer: string): QualificationResult {
  // ── 1. Length checks ────────────────────────────────────────────
  if (!query || query.trim().length < MIN_QUERY_LENGTH) {
    return { shouldSave: false, reason: `Query too short (${query?.length ?? 0} chars, min ${MIN_QUERY_LENGTH})`, score: 0 };
  }

  if (!answer || answer.trim().length < MIN_ANSWER_LENGTH) {
    return { shouldSave: false, reason: `Answer too short (${answer?.length ?? 0} chars, min ${MIN_ANSWER_LENGTH})`, score: 0 };
  }

  const queryTrimmed = query.trim();
  const answerTrimmed = answer.trim();

  // ── 2. Greeting / acknowledgement detection ─────────────────────
  for (const pattern of GREETING_PATTERNS) {
    if (pattern.test(queryTrimmed)) {
      logger.debug(`[qualifyForMemory] Rejected — matches greeting pattern: ${pattern}`);
      return { shouldSave: false, reason: `Matches greeting/acknowledgement pattern`, score: 0 };
    }
  }

  // ── 3. Information density check ────────────────────────────────
  const queryWords = queryTrimmed.split(/\s+/);
  const answerWords = answerTrimmed.split(/\s+/);
  const combinedWords = [...queryWords, ...answerWords];

  if (combinedWords.length < MIN_CONTENT_WORDS) {
    return { shouldSave: false, reason: `Too few words (${combinedWords.length}, min ${MIN_CONTENT_WORDS})`, score: 0 };
  }

  // Count "content words" — words that are not common stopwords
  const stopwords = new Set([
    "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for",
    "of", "with", "by", "from", "up", "about", "into", "over", "after",
    "is", "are", "was", "were", "be", "been", "being", "have", "has",
    "had", "do", "does", "did", "will", "would", "could", "should",
    "may", "might", "shall", "can", "need", "dare", "ought", "used",
    "i", "you", "he", "she", "it", "we", "they", "me", "him", "her",
    "us", "them", "my", "your", "his", "its", "our", "their", "this",
    "that", "these", "those", "some", "any", "each", "every", "all",
    "both", "few", "more", "most", "other", "such", "no", "nor", "not",
    "only", "own", "same", "so", "than", "too", "very", "just", "also",
    "if", "then", "else", "when", "where", "why", "how", "which", "who",
    "whom", "what", "here", "there",
  ]);

  const contentWordCount = combinedWords.filter(
    (w) => w.length > 2 && !stopwords.has(w.toLowerCase()),
  ).length;

  const density = contentWordCount / combinedWords.length;

  if (density < MIN_INFORMATION_DENSITY) {
    return {
      shouldSave: false,
      reason: `Information density too low (${density.toFixed(2)}, min ${MIN_INFORMATION_DENSITY})`,
      score: density,
    };
  }

  // ── 4. Filler answer detection ──────────────────────────────────
  for (const pattern of FILLER_ANSWER_PATTERNS) {
    if (pattern.test(answerTrimmed)) {
      logger.debug(`[qualifyForMemory] Rejected — answer matches filler pattern: ${pattern}`);
      return { shouldSave: false, reason: `Answer matches filler pattern`, score: 0.1 };
    }
  }

  // ── 5. Save-worthy indicator scoring ────────────────────────────
  let indicatorScore = 0;
  const combinedText = `${queryTrimmed} ${answerTrimmed}`;

  for (const { pattern, score } of SAVE_INDICATORS) {
    if (pattern.test(combinedText)) {
      indicatorScore += score;
    }
  }

  // Base score from information density (0.0 – 0.5)
  const baseScore = Math.min(density, 0.5);

  // Indicator bonus (0.0 – 0.5, capped)
  const indicatorBonus = Math.min(indicatorScore * 0.15, 0.5);

  const finalScore = Math.min(baseScore + indicatorBonus, 1.0);

  // Decision: save if score >= 0.3 OR if indicator score is high enough
  const shouldSave = finalScore >= 0.3 || indicatorScore >= 2;

  logger.debug(
    `[qualifyForMemory] Score: ${finalScore.toFixed(3)} ` +
    `(density: ${density.toFixed(3)}, indicators: ${indicatorScore}) ` +
    `→ ${shouldSave ? "SAVE" : "REJECT"}`,
  );

  return {
    shouldSave,
    reason: shouldSave
      ? `Quality score ${finalScore.toFixed(3)} meets threshold`
      : `Quality score ${finalScore.toFixed(3)} below threshold (indicators: ${indicatorScore})`,
    score: finalScore,
  };
}