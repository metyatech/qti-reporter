export const DEFAULT_REPORT_CSS = `
:root {
  color-scheme: light;
  font-family: "Segoe UI", "Hiragino Kaku Gothic ProN", "Yu Gothic UI", Meiryo, Arial, sans-serif;
  --page-bg: #f1f5f9;
  --card-bg: #ffffff;
  --text: #0f172a;
  --muted: #64748b;
  --border: #e2e8f0;
  --accent: #2563eb;
  --ok: #15803d;
  --ok-bg: #f0fdf4;
  --ok-border: #bbf7d0;
  --warn: #b45309;
  --warn-bg: #fffbeb;
  --warn-border: #fde68a;
  --bad: #b91c1c;
  --bad-bg: #fef2f2;
  --bad-border: #fecaca;
}
* {
  box-sizing: border-box;
}
body {
  margin: 0;
  background: var(--page-bg);
  color: var(--text);
  line-height: 1.6;
}
.report-root {
  margin: 28px auto 64px;
  max-width: 980px;
  padding: 0 20px;
}
.report-header {
  background: var(--card-bg);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 22px 26px;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.06);
}
.report-title {
  margin: 0 0 4px;
  font-size: 24px;
  letter-spacing: 0.2px;
}
.report-subtitle {
  margin: 0 0 18px;
  color: var(--muted);
  font-size: 14px;
}
.meta-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 28px;
  align-items: baseline;
  font-size: 14px;
}
.meta-row {
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.meta-label {
  font-weight: 600;
  color: var(--muted);
}
.meta-value {
  display: inline-flex;
  align-items: baseline;
  font-weight: 700;
  font-size: 15px;
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
  font-variant-numeric: tabular-nums;
}
.item-summary .score-badge {
  font-size: 16px;
  font-variant-numeric: tabular-nums;
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
.summary-bar {
  margin-top: 18px;
  padding-top: 16px;
  border-top: 1px solid var(--border);
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
}
.summary-chip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 7px 14px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 700;
  border: 1px solid var(--border);
  background: #f8fafc;
  color: var(--muted);
}
.summary-chip .summary-count {
  font-size: 16px;
}
.summary-chip.review {
  background: var(--warn-bg);
  border-color: var(--warn-border);
  color: var(--warn);
}
.summary-chip.ok {
  background: var(--ok-bg);
  border-color: var(--ok-border);
  color: var(--ok);
}
.items-section {
  margin-top: 18px;
  display: grid;
  gap: 12px;
}
.item-block {
  border: 1px solid var(--border);
  border-left: 6px solid var(--border);
  border-radius: 12px;
  background: var(--card-bg);
  overflow: hidden;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.05);
}
.item-block[data-item-result="full"] {
  border-left-color: var(--ok);
}
.item-block[data-item-result="partial"] {
  border-left-color: var(--warn);
}
.item-block[data-item-result="zero"] {
  border-left-color: var(--bad);
}
.item-block[data-has-comment="true"] {
  background: linear-gradient(
    to right,
    var(--warn-bg) 0,
    var(--warn-bg) 4px,
    var(--card-bg) 4px,
    var(--card-bg) 100%
  );
}
.item-block[data-has-comment="true"][data-item-result="full"] {
  background: linear-gradient(
    to right,
    var(--ok-bg) 0,
    var(--ok-bg) 4px,
    var(--card-bg) 4px,
    var(--card-bg) 100%
  );
}
.item-block[data-has-comment="true"][data-item-result="partial"] {
  background: linear-gradient(
    to right,
    var(--warn-bg) 0,
    var(--warn-bg) 4px,
    var(--card-bg) 4px,
    var(--card-bg) 100%
  );
}
.item-block[data-has-comment="true"][data-item-result="zero"] {
  background: linear-gradient(
    to right,
    var(--bad-bg) 0,
    var(--bad-bg) 4px,
    var(--card-bg) 4px,
    var(--card-bg) 100%
  );
}
.item-summary {
  cursor: pointer;
  list-style: none;
  padding: 14px 18px;
  display: flex;
  align-items: center;
  gap: 14px;
  background: #ffffff;
  font-weight: 700;
}
.item-summary::marker,
.item-summary::-webkit-details-marker {
  display: none;
}
.item-block[open] .item-summary {
  border-bottom: 1px solid var(--border);
}
.status-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 8px;
  font-size: 12.5px;
  font-weight: 800;
  white-space: nowrap;
  border: 1px solid transparent;
}
.status-pill .ico {
  font-size: 13px;
}
[data-item-result="full"] .status-pill {
  background: var(--ok-bg);
  color: var(--ok);
  border-color: var(--ok-border);
}
[data-item-result="partial"] .status-pill {
  background: var(--warn-bg);
  color: var(--warn);
  border-color: var(--warn-border);
}
[data-item-result="zero"] .status-pill {
  background: var(--bad-bg);
  color: var(--bad);
  border-color: var(--bad-border);
}
.item-head {
  display: flex;
  flex-direction: column;
  min-width: 0;
  gap: 2px;
  flex: 1 1 auto;
}
.item-title {
  font-weight: 700;
  font-size: 15px;
  line-height: 1.35;
  overflow-wrap: anywhere;
}
.item-no {
  color: var(--muted);
  font-weight: 700;
  margin-right: 6px;
}
.item-id {
  font-size: 11.5px;
  color: #94a3b8;
  font-weight: 600;
  font-family: ui-monospace, Consolas, monospace;
}
.item-spacer {
  flex: 1 1 auto;
}
.comment-flag {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 9px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  color: #1d4ed8;
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  white-space: nowrap;
}
.item-score {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  border: 1px solid transparent;
}
[data-item-result="full"] .item-score {
  background: var(--ok);
  border-color: var(--ok);
}
[data-item-result="partial"] .item-score {
  background: var(--warn);
  border-color: var(--warn);
}
[data-item-result="zero"] .item-score {
  background: var(--bad);
  border-color: var(--bad);
}
.toggle-caret {
  color: var(--muted);
  font-size: 12px;
  transition: transform 0.15s;
}
.item-block[open] .toggle-caret {
  transform: rotate(90deg);
}
@media (max-width: 520px) {
  .item-summary {
    flex-wrap: wrap;
    row-gap: 8px;
  }
  .status-pill {
    order: 1;
  }
  .item-head {
    order: 2;
    flex: 1 1 100%;
  }
  .item-spacer {
    display: none;
  }
  .comment-flag {
    order: 3;
  }
  .item-score {
    order: 4;
    margin-left: auto;
  }
  .toggle-caret {
    order: 5;
  }
}
.item-content {
  padding: 8px 18px 18px;
}
.section-title {
  margin: 18px 0 8px;
  font-size: 13px;
  font-weight: 800;
  letter-spacing: 0.4px;
  color: var(--muted);
  border-left: 4px solid var(--accent);
  padding-left: 8px;
}
.question-section .section-title {
  margin-top: 8px;
  border-left-color: var(--accent);
}
.comment-section .section-title {
  border-left-color: #2563eb;
}
.rubric-section .section-title {
  border-left-color: #475569;
}
.response-section .section-title {
  border-left-color: #94a3b8;
}
.item-body p {
  margin: 8px 0;
}
.choice-interaction {
  display: grid;
  gap: 8px;
  margin: 8px 0;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: #f8fafc;
}
.choice-interaction simple-choice {
  display: block;
  position: relative;
  padding: 8px 10px;
  padding-left: 34px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: #ffffff;
}
.choice-interaction simple-choice::before {
  content: "○";
  position: absolute;
  left: 10px;
  top: 8px;
  color: #64748b;
  font-weight: 700;
}
.cloze-input {
  display: inline-block;
  width: auto;
  min-width: 96px;
  max-width: 100%;
  height: 32px;
  padding: 4px 8px;
  margin: 0 6px;
  border-radius: 6px;
  border: 1px solid #94a3b8;
  background: #ffffff;
  color: #0f172a;
  font-size: 14px;
  line-height: 1.4;
  vertical-align: middle;
  box-sizing: border-box;
}
.cloze-input[readonly] {
  background: #f8fafc;
}
.rubric-section {
  margin-top: 14px;
}
.rubric-table {
  display: block;
  width: 100%;
  border-collapse: collapse;
  margin-top: 8px;
  font-size: 14px;
}
.rubric-table thead {
  display: block;
}
.rubric-table thead tr {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
.rubric-table tbody {
  display: grid;
  gap: 8px;
}
.rubric-table tbody tr {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: #ffffff;
}
.rubric-table tbody tr[data-criterion-status="false"] {
  background: var(--bad-bg);
  border-color: var(--bad-border);
}
.rubric-table tbody tr[data-criterion-status="true"] {
  opacity: 0.62;
}
.rubric-table td {
  border: 0;
  padding: 0;
  text-align: left;
  vertical-align: middle;
}
.criterion-status {
  order: 1;
  font-size: 0;
  font-weight: 800;
}
.criterion-status::before {
  font-size: 15px;
  font-weight: 800;
}
tr[data-criterion-status="true"] .criterion-status::before {
  content: "✓";
  color: var(--ok);
}
tr[data-criterion-status="false"] .criterion-status::before {
  content: "✗";
  color: var(--bad);
}
.criterion-text {
  order: 2;
  min-width: 0;
}
tr[data-criterion-status="false"] .criterion-text {
  font-weight: 700;
}
.criterion-points {
  order: 3;
  font-variant-numeric: tabular-nums;
  font-weight: 700;
  color: var(--muted);
  white-space: nowrap;
  font-size: 13px;
}
.criterion-points::after {
  content: " 点";
}
tr[data-criterion-status="false"] .criterion-points {
  color: var(--bad);
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
  border-left: 4px solid #2563eb;
  border-radius: 8px;
  padding: 12px 14px;
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
.choice-response-list {
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.choice-response-option {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: start;
  gap: 8px;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: #ffffff;
}
.choice-response-selected {
  border-color: #2563eb;
  background: #eff6ff;
  font-weight: 700;
}
.choice-response-marker {
  color: #2563eb;
  font-weight: 800;
}
.choice-response-label {
  color: #1d4ed8;
  font-size: 13px;
  font-weight: 700;
  white-space: nowrap;
}
.choice-response-unmatched {
  border-color: #f97316;
  background: #fff7ed;
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
  display: inline;
  vertical-align: baseline;
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
.interaction-placeholder {
  margin: 8px 0;
  padding: 8px 10px;
  border-radius: 8px;
}
.interaction-placeholder {
  border: 1px dashed #94a3b8;
  color: var(--muted);
  background: #f8fafc;
}
`;

export const DEFAULT_STYLE_ELEMENT = `<style data-qti-reporter-style="default">${DEFAULT_REPORT_CSS}</style>`;

export const EXTERNAL_STYLE_FILE_NAME = 'report-style.css';
