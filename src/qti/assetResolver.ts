import fs from "node:fs";
import path from "node:path";

import { decodeXmlEntities, parseAttributes } from "./xml.js";

export interface ResolvedAssetsResult {
  html: string;
  copiedAssetPaths: string[];
}

const ASSETS_DIR_NAME = "assets";

function isExternalSource(src: string): boolean {
  const normalized = src.trim().toLowerCase();
  return (
    normalized.startsWith("http://") ||
    normalized.startsWith("https://") ||
    normalized.startsWith("data:") ||
    normalized.startsWith("//") ||
    normalized.startsWith("/")
  );
}

function sanitizePathSegment(segment: string): string {
  return segment.replace(/[^A-Za-z0-9._-]/g, "_");
}

function resolveLocalAssetPath(itemPath: string, src: string): string {
  const itemDir = path.dirname(itemPath);
  return path.resolve(itemDir, src);
}

function buildAssetOutputPath(outputDirPath: string, itemIdentifier: string, src: string): string {
  const fileName = sanitizePathSegment(path.basename(src));
  const assetDir = path.join(outputDirPath, ASSETS_DIR_NAME, sanitizePathSegment(itemIdentifier));
  return path.join(assetDir, fileName);
}

function rewriteImgTag(
  imgTag: string,
  itemPath: string,
  itemIdentifier: string,
  outputDirPath: string,
  copiedAssetPaths: string[],
): string {
  const attributes = parseAttributes(imgTag);
  const rawSrc = attributes.src;
  if (!rawSrc) {
    return imgTag;
  }
  const decodedSrc = decodeXmlEntities(rawSrc);
  if (isExternalSource(decodedSrc)) {
    return imgTag;
  }

  const absoluteAssetPath = resolveLocalAssetPath(itemPath, decodedSrc);
  if (!fs.existsSync(absoluteAssetPath)) {
    throw new Error(`Image asset not found: ${absoluteAssetPath}`);
  }

  const assetOutputPath = buildAssetOutputPath(outputDirPath, itemIdentifier, decodedSrc);
  fs.mkdirSync(path.dirname(assetOutputPath), { recursive: true });
  fs.copyFileSync(absoluteAssetPath, assetOutputPath);
  copiedAssetPaths.push(assetOutputPath);

  const relativeOutputPath = `./${ASSETS_DIR_NAME}/${sanitizePathSegment(itemIdentifier)}/${sanitizePathSegment(path.basename(decodedSrc))}`;

  let rewritten = imgTag.replace(/\ssrc\s*=\s*("[^"]*"|'[^']*')/, ` src="${relativeOutputPath}"`);
  if (!/\sclass\s*=/.test(rewritten)) {
    rewritten = rewritten.replace(/^<img\b/, '<img class="report-image"');
    return rewritten;
  }

  rewritten = rewritten.replace(/\sclass\s*=\s*("[^"]*"|'[^']*')/, (classAttr) => {
    const quoteMatch = classAttr.match(/class\s*=\s*(['"])/);
    const quote = quoteMatch ? quoteMatch[1] : '"';
    const current = classAttr.slice(classAttr.indexOf(quote) + 1, classAttr.lastIndexOf(quote));
    const classes = new Set(current.split(/\s+/).filter((token) => token.length > 0));
    classes.add("report-image");
    const merged = Array.from(classes).join(" ");
    return ` class=${quote}${merged}${quote}`;
  });
  return rewritten;
}

export function resolveItemAssets(
  questionHtml: string,
  itemPath: string,
  itemIdentifier: string,
  outputDirPath: string,
): ResolvedAssetsResult {
  const imgTagPattern = /<img\b[^>]*>/g;
  const copiedAssetPaths: string[] = [];
  const html = questionHtml.replace(imgTagPattern, (imgTag) =>
    rewriteImgTag(imgTag, itemPath, itemIdentifier, outputDirPath, copiedAssetPaths),
  );

  return { html, copiedAssetPaths };
}
