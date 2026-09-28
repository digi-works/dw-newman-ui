// Typo-tolerant text helpers, so "send me a calnder inviute for Mision Orientaton"
// is understood the same as the correctly spelled request.

/** Edit distance counting insertions, deletions, substitutions and adjacent swaps. */
export function editDistance(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[a.length][b.length];
}

// How many typos a word of this length may contain and still count as a match.
// Short words get none, so e.g. "even" never turns into "event".
function allowedTypos(word: string): number {
  if (word.length >= 7) return 2;
  if (word.length >= 5) return 1;
  return 0;
}

export function isTypoOf(typed: string, word: string): boolean {
  if (typed === word) return true;
  const allowed = allowedTypos(word);
  return allowed > 0 && Math.abs(typed.length - word.length) <= allowed && editDistance(typed, word) <= allowed;
}

// Words that decide what the user wants (booking form, calendar invite). Real
// English variants are listed too, so an exact match wins over a "correction".
const KEYWORDS = [
  'calendar', 'invite', 'invites', 'invited', 'invitation', 'schedule', 'scheduled',
  'reserve', 'reservation', 'booking', 'available', 'availability', 'orientation',
];

/**
 * Fixes misspellings of the app's key words ("calnder inviute" → "calendar
 * invite"), leaving every other word — and the original casing of correct
 * words — untouched.
 */
export function correctKeywordTypos(text: string): string {
  return text.replace(/[A-Za-z]{5,}/g, word => {
    const lower = word.toLowerCase();
    if (KEYWORDS.includes(lower)) return word;
    const fix = KEYWORDS.find(k => isTypoOf(lower, k));
    return fix ?? word;
  });
}

const STOP_WORDS = new Set(['the', 'of', 'for', 'and', 'a', 'an', 'to', 'in', 'on', 'at', 'with', 'my', 'me']);
// Words too common in event titles to identify one event on their own.
const GENERIC_WORDS = new Set([
  'meeting', 'event', 'events', 'training', 'session', 'class', 'club', 'game', 'practice',
  'calendar', 'invite', 'center', 'office', 'group', 'service', 'student', 'students',
]);

// Plurals count too: "meetings" is as generic as "meeting".
function isGeneric(word: string): boolean {
  return GENERIC_WORDS.has(word) || GENERIC_WORDS.has(word.replace(/e?s$/, ''));
}

function tokenize(text: string): string[] {
  return text.toLowerCase().replace(/['’]/g, '').split(/[^a-z0-9]+/).filter(Boolean);
}

/**
 * Finds the title the user most likely meant among `titles`, tolerating typos
 * and missing small words. Returns null unless the match is clear: either every
 * meaningful word of the title appears (possibly misspelled), or at least half
 * do and one of them is distinctive — and no other title matches as well.
 */
export function findTitleInText(text: string, titles: string[]): string | null {
  const tokens = tokenize(text);
  let best: { title: string; ratio: number; matched: number } | null = null;
  let tie = false;

  for (const title of titles) {
    const words = tokenize(title).filter(w => !STOP_WORDS.has(w));
    if (words.length === 0) continue;
    const matchedWords = words.filter(w => tokens.some(t => isTypoOf(t, w)));
    if (matchedWords.length === 0) continue;

    const ratio = matchedWords.length / words.length;
    const isFull = ratio === 1 && (words.length > 1 || words[0].length >= 5);
    const isDistinctivePartial = ratio >= 0.5 && matchedWords.some(w => w.length >= 6 && !isGeneric(w));
    if (!isFull && !isDistinctivePartial) continue;
    // A title made only of generic words ("Staff Meeting") needs every word present.
    if (!isFull && matchedWords.every(isGeneric)) continue;

    if (!best || ratio > best.ratio || (ratio === best.ratio && matchedWords.length > best.matched)) {
      best = { title, ratio, matched: matchedWords.length };
      tie = false;
    } else if (ratio === best.ratio && matchedWords.length === best.matched && title !== best.title) {
      tie = true;
    }
  }

  // Two different events matched equally well on a partial match — ambiguous, let the user pick.
  if (!best || (tie && best.ratio < 1)) return null;
  return best.title;
}
