export const DEFAULT_REPORT_CSS = `
:root {
  color-scheme: light;
  font-family: "Segoe UI", Arial, sans-serif;
  --page-bg: #f8fafc;
  --card-bg: #ffffff;
  --text: #0f172a;
  --muted: #475569;
  --border: #e2e8f0;
  --accent: #2563eb;
}
body {
  margin: 0;
  background: var(--page-bg);
  color: var(--text);
}
.report-root {
  margin: 24px auto 48px;
  max-width: 1080px;
  padding: 0 20px;
}
.report-header {
  background: var(--card-bg);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 20px 24px;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.06);
}
.report-title {
  margin: 0 0 12px;
  font-size: 28px;
  letter-spacing: 0.2px;
}
.meta-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 8px 16px;
  font-size: 15px;
}
.meta-row {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  align-items: flex-start;
  min-height: 56px;
  gap: 6px;
}
.meta-label {
  font-weight: 600;
  color: var(--muted);
}
.meta-value {
  display: inline-flex;
  align-items: baseline;
  font-weight: 700;
  font-size: 18px;
}
.score-badge {
  display: inline-flex;
  align-items: baseline;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 999px;
  border: 1px solid #1d4ed8;
  background: #1d4ed8;
  color: #ffffff;
  font-weight: 700;
  line-height: 1.1;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.15);
}
.score-total {
  padding: 6px 12px;
  font-size: 18px;
}
.item-summary .score-badge {
  font-size: 16px;
}
.score-value {
  font-size: 1.2em;
  font-weight: 800;
}
.score-max {
  opacity: 0.9;
}
.score-separator {
  opacity: 0.85;
}
.items-section {
  margin-top: 16px;
}
.item-block {
  margin: 14px 0;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--card-bg);
  overflow: hidden;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.05);
}
.item-summary {
  cursor: pointer;
  list-style: none;
  padding: 14px 18px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #f1f5f9;
  font-weight: 700;
  border-bottom: 1px solid var(--border);
}
.item-summary::marker,
.item-summary::-webkit-details-marker {
  display: none;
}
.item-block[open] .item-summary {
  background: #e2e8f0;
}
.item-content {
  padding: 18px;
}
.section-title {
  margin: 0 0 8px;
  font-size: 18px;
}
.item-body p {
  margin: 8px 0;
}
.rubric-section {
  margin-top: 14px;
}
.rubric-table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 8px;
  font-size: 14px;
}
.rubric-table th,
.rubric-table td {
  border: 1px solid var(--border);
  padding: 8px 10px;
  text-align: left;
  vertical-align: top;
}
.rubric-table thead {
  background: #f8fafc;
}
.criterion-status {
  font-weight: 700;
}
tr[data-criterion-status="true"] .criterion-status {
  color: #16a34a;
}
tr[data-criterion-status="false"] .criterion-status {
  color: #dc2626;
}
.candidate-response-block {
  margin-top: 16px;
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 8px 12px;
  background: #f8fafc;
}
.candidate-response-block > summary {
  cursor: pointer;
  font-weight: 700;
}
.candidate-response-content {
  margin-top: 8px;
  background: var(--card-bg);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 12px;
}
.comment-section {
  margin-top: 16px;
}
.comment-content {
  margin-top: 8px;
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  border-radius: 8px;
  padding: 12px;
}
.response-empty {
  color: var(--muted);
  font-style: italic;
}
.response-text {
  margin: 0;
}
.response-pre {
  white-space: pre-wrap;
  word-break: break-word;
  font-family: inherit;
  background: transparent;
  border: 0;
  padding: 0;
}
.comment-text {
  margin: 0;
}
.comment-pre {
  white-space: pre-wrap;
  word-break: break-word;
  font-family: inherit;
  background: transparent;
  border: 0;
  padding: 0;
}
.report-image {
  display: block;
  max-width: 100%;
  height: auto;
  margin: 8px 0 12px;
  border-radius: 8px;
  border: 1px solid #cbd5e1;
  background: #ffffff;
}
.code-inline {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
  background: #e2e8f0;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  padding: 0.1em 0.4em;
  font-size: 0.95em;
}
.code-block {
  position: relative;
  margin: 10px 0 14px;
  padding: 16px 18px 16px;
  border-radius: 10px;
  border: 1px solid #0f172a;
  background: #0f172a;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
  overflow: auto;
}
.code-block::before {
  content: attr(data-code-lang);
  position: absolute;
  top: 8px;
  right: 10px;
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.5);
  background: rgba(15, 23, 42, 0.9);
  color: #cbd5e1;
  font-size: 11px;
  letter-spacing: 0.3px;
  text-transform: uppercase;
}
.code-block-code {
  display: block;
  margin: 0;
  padding: 0;
  color: #e5e7eb;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
  font-size: 13.5px;
  line-height: 1.7;
  tab-size: 2;
  white-space: pre;
}
.code-block[data-code-lang="plain"]::before {
  content: "code";
}
.hljs {
  background: #0f172a;
  color: #e5e7eb;
}
.hljs-comment,
.hljs-quote {
  color: #94a3b8;
  font-style: italic;
}
.hljs-keyword,
.hljs-selector-tag,
.hljs-subst {
  color: #93c5fd;
}
.hljs-string,
.hljs-doctag,
.hljs-title,
.hljs-section,
.hljs-selector-id,
.hljs-selector-class,
.hljs-attribute,
.hljs-name,
.hljs-type,
.hljs-number,
.hljs-literal,
.hljs-template-tag,
.hljs-template-variable,
.hljs-addition {
  color: #86efac;
}
.hljs-built_in,
.hljs-builtin-name,
.hljs-variable,
.hljs-params,
.hljs-meta,
.hljs-symbol,
.hljs-bullet,
.hljs-link {
  color: #f9a8d4;
}
.hljs-deletion {
  color: #fca5a5;
}
.interaction-placeholder,
.choice-interaction {
  margin: 8px 0;
  padding: 8px 10px;
  border-radius: 8px;
}
.interaction-placeholder {
  border: 1px dashed #94a3b8;
  color: var(--muted);
  background: #f8fafc;
}
.choice-interaction {
  border: 1px solid var(--border);
  background: #f8fafc;
}
`;

export const DEFAULT_STYLE_ELEMENT = `<style data-qti-reporter-style="default">${DEFAULT_REPORT_CSS}</style>`;

export const EXTERNAL_STYLE_FILE_NAME = "report-style.css";
