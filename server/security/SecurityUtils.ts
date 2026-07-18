/**
 * Shared security utilities used across the security services.
 *
 * These are pure, dependency-free functions focused on:
 *   - detecting dangerous / invisible Unicode control characters
 *   - normalising whitespace
 *   - redacting matched substrings
 *   - sanitising filenames (directory traversal, hidden files, invalid chars)
 *
 * No function here logs or stores user content.
 */

import { SecurityConfig } from "./SecurityConfig";

// ── Invisible / control character detection ────────────────────────────

/**
 * Unicode ranges that are invisible or control characters we strip/flag.
 * Covers C0/C1 controls, zero-width spaces, BOM, directional overrides,
 * and other non-printing marks.
 */
const INVISIBLE_RANGES: Array<[number, number]> = [
  [0x0000, 0x001f], // C0 controls (incl. NULL, tab handled separately)
  [0x007f, 0x009f], // DEL + C1 controls
  [0x200b, 0x200f], // zero-width space, ZWNJ, ZWJ, LRM, RLM
  [0x202a, 0x202e], // directional overrides (LRE, RLE, PDF, LRO, RLO)
  [0x2060, 0x2064], // word joiner, invisible plus, etc.
  [0xfeff, 0xfeff], // BOM / zero-width no-break space
  [0x034f, 0x034f], // combining grapheme joiner
  [0x061c, 0x061c], // Arabic letter mark
  [0x180e, 0x180e], // Mongolian vowel separator
  [0x2066, 0x2069], // directional isolates
];

const ZERO_WIDTH_CODEPOINTS = new Set([
  0x200b, 0x200c, 0x200d, 0x2060, 0x2061, 0x2062, 0x2063, 0x2064, 0xfeff, 0x034f, 0x180e, 0x061c,
]);

const BIDI_OVERRIDE_CODEPOINTS = new Set([
  0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x2066, 0x2067, 0x2068, 0x2069,
]);

/** Returns true if the code point is an invisible/control character. */
export function isInvisibleCodePoint(cp: number): boolean {
  for (const [start, end] of INVISIBLE_RANGES) {
    if (cp >= start && cp <= end) return true;
  }
  return false;
}

export function isZeroWidth(cp: number): boolean {
  return ZERO_WIDTH_CODEPOINTS.has(cp);
}

export function isBidiOverride(cp: number): boolean {
  return BIDI_OVERRIDE_CODEPOINTS.has(cp);
}

export interface ControlCharScan {
  /** Count of invisible/control characters removed. */
  controlCount: number;
  /** Count of zero-width characters removed. */
  zeroWidthCount: number;
  /** Count of bidirectional override characters removed. */
  bidiCount: number;
  /** Count of null bytes removed. */
  nullCount: number;
}

/**
 * Strip dangerous control / invisible characters from a string.
 * Returns the cleaned string plus a scan summary (counts only).
 */
export function stripControlCharacters(input: string): {
  cleaned: string;
  scan: ControlCharScan;
} {
  let controlCount = 0;
  let zeroWidthCount = 0;
  let bidiCount = 0;
  let nullCount = 0;

  let out = "";
  for (const ch of input) {
    const cp = ch.codePointAt(0) ?? 0;

    if (cp === 0x00) {
      nullCount++;
      continue;
    }
    if (isZeroWidth(cp)) {
      zeroWidthCount++;
      continue;
    }
    if (isBidiOverride(cp)) {
      bidiCount++;
      continue;
    }
    if (isInvisibleCodePoint(cp)) {
      controlCount++;
      continue;
    }
    out += ch;
  }

  return {
    cleaned: out,
    scan: { controlCount, zeroWidthCount, bidiCount, nullCount },
  };
}

// ── Whitespace normalisation ───────────────────────────────────────────

/**
 * Normalise whitespace: collapse runs of spaces/tabs/newlines into a single
 * space, trim leading/trailing, and remove excessive repetition.
 */
export function normalizeWhitespace(input: string): string {
  return input
    .replace(/[\t\f\v ]+/g, " ") // tabs / form feed / vertical tab / NBSP → space
    .replace(/[\r\n]+/g, " ") // newlines → space
    .replace(/ {2,}/g, " ") // collapse multiple spaces
    .trim();
}

// ── Token flooding detection ───────────────────────────────────────────

/**
 * Detect repeated-token flooding (e.g. "aaaa aaaa aaaa ...").
 * Returns the ratio of the most-frequent token to total tokens, and the
 * dominant token's repetition count.
 */
export function detectTokenFlooding(input: string): {
  ratio: number;
  dominantCount: number;
  totalTokens: number;
} {
  const tokens = input.toLowerCase().split(/\s+/).filter(Boolean);
  const total = tokens.length;
  if (total < SecurityConfig.tokenFloodMinTokens) {
    return { ratio: 0, dominantCount: 0, totalTokens: total };
  }

  const freq = new Map<string, number>();
  for (const t of tokens) {
    freq.set(t, (freq.get(t) ?? 0) + 1);
  }

  let dominant = 0;
  for (const c of freq.values()) {
    if (c > dominant) dominant = c;
  }

  return { ratio: dominant / total, dominantCount: dominant, totalTokens: total };
}

// ── Redaction ──────────────────────────────────────────────────────────

/**
 * Replace every occurrence of `term` (case-insensitive) in `text` with a
 * fixed-length mask. The mask length is constant so redaction does not leak
 * the length of the original word.
 */
export function redactTerm(text: string, term: string, mask = "█"): string {
  if (!term) return text;
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(escaped, "gi");
  return text.replace(re, mask.repeat(term.length));
}

/**
 * Redact a list of terms from text.
 */
export function redactTerms(text: string, terms: string[]): string {
  let out = text;
  for (const t of terms) {
    out = redactTerm(out, t);
  }
  return out;
}

// ── Filename sanitisation ──────────────────────────────────────────────

const INVALID_FILENAME_CHARS = /[<>:"/\\|?*\x00-\x1f]/g;
const TRAVERSAL_PATTERN = /(\.\.[/\\]|\.\.$|\.\.[/\\])/;

export interface FilenameSanitization {
  safe: string;
  hadTraversal: boolean;
  hadInvalidChars: boolean;
  wasHidden: boolean;
}

/**
 * Sanitise a filename for safe storage.
 *   - strips directory components (path traversal)
 *   - rejects hidden files (leading dot)
 *   - removes invalid characters
 *   - collapses to a safe basename with a preserved extension
 */
export function sanitizeFilename(original: string): FilenameSanitization {
  let hadTraversal = false;
  let hadInvalidChars = false;
  let wasHidden = false;

  // Detect traversal in the raw input
  if (TRAVERSAL_PATTERN.test(original) || original.includes("/") || original.includes("\\")) {
    hadTraversal = true;
  }

  // Take only the basename (strip any path)
  const basename = original.replace(/^.*[/\\]/, "");

  // Detect hidden file (leading dot, but not "." or "..")
  if (basename.startsWith(".") && basename.length > 1) {
    wasHidden = true;
  }

  // Remove invalid characters
  const cleaned = basename.replace(INVALID_FILENAME_CHARS, "_");
  if (cleaned !== basename) hadInvalidChars = true;

  // Collapse multiple dots in the middle, keep a single extension dot
  const lastDot = cleaned.lastIndexOf(".");
  let namePart = lastDot > 0 ? cleaned.slice(0, lastDot) : cleaned;
  const extPart = lastDot > 0 ? cleaned.slice(lastDot) : "";

  namePart = namePart.replace(/\.+/g, "_").replace(/_+/g, "_").replace(/^_+|_+$/g, "");
  if (namePart.length === 0) namePart = "document";

  const safe = `${namePart}${extPart}`.toLowerCase();

  return { safe, hadTraversal, hadInvalidChars, wasHidden };
}

/**
 * Validate that a string is valid UTF-8 / not malformed Unicode.
 * Returns true if the string round-trips through UTF-8 cleanly.
 */
export function isWellFormedUtf8(input: string): boolean {
  try {
    // encodeURIComponent throws on lone surrogates (malformed UTF-16)
    encodeURIComponent(input);
    return true;
  } catch {
    return false;
  }
}