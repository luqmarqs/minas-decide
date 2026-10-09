/**
 * Plain-text sanitization for user-provided titles/descriptions. We never render
 * HTML from users; this strips tags/control chars and collapses whitespace so
 * even a naive consumer cannot execute anything (spec §9.8).
 */
export function sanitizePlainText(input: string, maxLen = 2000): string {
  return input
    .replace(/<[^>]*>/g, '')
    // eslint-disable-next-line no-control-regex -- stripping control characters is the intent
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, maxLen);
}
