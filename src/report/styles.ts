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
.meta-label {
  font-weight: 600;
  margin-right: 6px;
  color: var(--muted);
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
.response-empty {
  color: var(--muted);
  font-style: italic;
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