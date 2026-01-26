import fs from "node:fs";
import hljs from "highlight.js/lib/core";
import xmlLang from "highlight.js/lib/languages/xml";
import javascriptLang from "highlight.js/lib/languages/javascript";
import typescriptLang from "highlight.js/lib/languages/typescript";
import jsonLang from "highlight.js/lib/languages/json";
import cssLang from "highlight.js/lib/languages/css";
import sqlLang from "highlight.js/lib/languages/sql";
import bashLang from "highlight.js/lib/languages/bash";
import plaintextLang from "highlight.js/lib/languages/plaintext";
import {
  renderQtiItemForReport,
  type ChoiceOption,
  type ParsedItemForReport,
  type RubricCriterion,
} from "qti-html-renderer";

hljs.registerLanguage("xml", xmlLang);
hljs.registerLanguage("html", xmlLang);
hljs.registerLanguage("javascript", javascriptLang);
hljs.registerLanguage("js", javascriptLang);
hljs.registerLanguage("typescript", typescriptLang);
hljs.registerLanguage("ts", typescriptLang);
hljs.registerLanguage("json", jsonLang);
hljs.registerLanguage("css", cssLang);
hljs.registerLanguage("sql", sqlLang);
hljs.registerLanguage("bash", bashLang);
hljs.registerLanguage("sh", bashLang);
hljs.registerLanguage("plaintext", plaintextLang);
hljs.registerLanguage("plain", plaintextLang);

const AUTO_DETECT_LANGUAGES = ["html", "xml", "ts", "js", "json", "css", "sql", "bash", "plain"];

export type ParsedAssessmentItem = ParsedItemForReport;
export type { ChoiceOption, RubricCriterion };

function normalizeLanguage(language: string): string {
  const normalized = language.toLowerCase();
  if (normalized === "xml") {
    return "html";
  }
  if (normalized === "plaintext") {
    return "plain";
  }
  return normalized;
}

function highlightCode(codeContent: string, explicitLanguage: string | null): { language: string; html: string } {
  const trimmed = codeContent.trim();
  if (trimmed.length === 0) {
    return { language: "plain", html: "" };
  }
  if (codeContent.includes("cloze-input")) {
    return { language: "plain", html: codeContent };
  }

  if (explicitLanguage) {
    const normalizedExplicit = normalizeLanguage(explicitLanguage);
    if (normalizedExplicit !== "plain" && hljs.getLanguage(normalizedExplicit)) {
      const highlighted = hljs.highlight(trimmed, { language: normalizedExplicit, ignoreIllegals: true });
      return { language: normalizeLanguage(highlighted.language ?? normalizedExplicit), html: highlighted.value };
    }
  }

  const auto = hljs.highlightAuto(trimmed, AUTO_DETECT_LANGUAGES);
  const autoLanguage = auto.language ? normalizeLanguage(auto.language) : "plain";
  return { language: autoLanguage, html: auto.value };
}

export function parseAssessmentItem(itemPath: string, expectedIdentifier: string): ParsedAssessmentItem {
  const xml = fs.readFileSync(itemPath, "utf8");
  return renderQtiItemForReport(xml, expectedIdentifier, {
    codeHighlighter: highlightCode,
  });
}
