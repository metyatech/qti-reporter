import { escapeHtml } from './htmlEscape.js';

export function applyResponsesToPromptHtmlSafely(promptHtml: string, responses: string[]): string {
  let responseIndex = 0;

  return promptHtml.replace(/<input\b[^>]*\bqti-blank-input\b[^>]*>/gi, (match) => {
    const response = responses[responseIndex] ?? '';
    responseIndex += 1;

    const escaped = escapeHtml(response);
    if (/\bvalue\s*=\s*(?:"[^"]*"|'[^']*')/i.test(match)) {
      return match.replace(/\bvalue\s*=\s*(?:"[^"]*"|'[^']*')/i, `value="${escaped}"`);
    }
    if (/\s*\/>$/.test(match)) {
      return match.replace(/\s*\/>$/, ` value="${escaped}" />`);
    }
    return match.replace(/>$/, ` value="${escaped}">`);
  });
}
