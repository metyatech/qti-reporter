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

/**
 * Apply responses to a prompt's `qti-blank-input` elements while keeping the
 * inputs read-only. The result is the rendered "submitted answer" body inside
 * `<details class="candidate-response-block">` and the "correct answer" body
 * for cloze items inside `<details class="correct-answer-block">`. Cloze inputs
 * carry `class="cloze-input cloze-input-readonly"`, the submitted value as
 * `value`, and a `size` that is at least 6 and grows with the response length.
 * XSS-safe: response strings are HTML-encoded before being written into the
 * `value` attribute.
 */
export function applyResponsesToPromptHtmlReadonly(
  promptHtml: string,
  responses: string[]
): string {
  let responseIndex = 0;

  return promptHtml.replace(/<input\b[^>]*\bqti-blank-input\b[^>]*>/gi, (match) => {
    const response = responses[responseIndex] ?? '';
    responseIndex += 1;

    const escaped = escapeHtml(response);
    const size = Math.max(6, response.length);

    // Strip pre-existing value/size/readonly/disabled attributes, then rewrite
    // the class list so the read-only cloze case is styled independently from
    // the editable retake body. Each attribute strip pattern only consumes the
    // attribute itself, leaving surrounding whitespace intact.
    const attributePattern = (name: string) =>
      new RegExp(`\\s${name}(?:\\s*=\\s*(?:"[^"]*"|'[^']*'))?`, 'gi');
    let rewritten = match
      .replace(attributePattern('value'), '')
      .replace(attributePattern('size'), '')
      .replace(attributePattern('readonly'), '')
      .replace(attributePattern('disabled'), '');
    rewritten = rewritten.replace(/\sclass\s*=\s*(?:"[^"]*"|'[^']*')/gi, (classAttr) => {
      const quoteMatch = classAttr.match(/class\s*=\s*(['"])/);
      const quote = quoteMatch ? quoteMatch[1] : '"';
      const current = classAttr.slice(classAttr.indexOf(quote) + 1, classAttr.lastIndexOf(quote));
      const classes = new Set(current.split(/\s+/).filter((token) => token.length > 0));
      classes.add('cloze-input');
      classes.add('qti-blank-input');
      classes.add('cloze-input-readonly');
      return ` class=${quote}${Array.from(classes).join(' ')}${quote}`;
    });
    if (!/\sclass\s*=/.test(rewritten)) {
      rewritten = rewritten.replace(
        /^<input\b/,
        '<input class="cloze-input qti-blank-input cloze-input-readonly"'
      );
    }

    // Insertion must be prefixed with a single space, but we also need to
    // collapse any runs of whitespace left over after stripping attributes so
    // the output is well-formed regardless of how the renderer emitted the
    // original input.
    const insertion = ` value="${escaped}" size="${size}" readonly`;
    rewritten = rewritten.replace(/\s+/g, (run) => {
      // Preserve the first character of whitespace and discard the rest, so
      // any back-to-back stripped attributes collapse to a single space.
      if (run.length <= 1) return run;
      const tail = run[run.length - 1] === '/' ? '/' : '';
      return tail || ' ';
    });
    if (/\s*\/>$/.test(rewritten)) {
      return rewritten.replace(/\s*\/>$/, `${insertion} />`);
    }
    return rewritten.replace(/>$/, `${insertion}>`);
  });
}
