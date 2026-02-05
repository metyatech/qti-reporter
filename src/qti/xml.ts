export interface XmlAttributes {
  [key: string]: string;
}

export function parseAttributes(tagOpen: string): XmlAttributes {
  const attributes: XmlAttributes = {};
  const attributePattern = /([A-Za-z_:][A-Za-z0-9_.:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let match: RegExpExecArray | null = attributePattern.exec(tagOpen);
  while (match) {
    const value = match[2] ?? match[3] ?? '';
    attributes[match[1]] = value;
    match = attributePattern.exec(tagOpen);
  }
  return attributes;
}

export function decodeXmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

export function stripTags(xmlFragment: string): string {
  const withoutTags = xmlFragment.replace(/<[^>]+>/g, ' ');
  const normalizedWhitespace = withoutTags.replace(/\s+/g, ' ').trim();
  const decoded = decodeXmlEntities(normalizedWhitespace);
  return decoded.replace(/</g, '＜').replace(/>/g, '＞');
}

export function stripTagsPreserveWhitespace(xmlFragment: string): string {
  const withoutTags = xmlFragment.replace(/<[^>]+>/g, '');
  const decoded = decodeXmlEntities(withoutTags);
  return decoded.replace(/</g, '＜').replace(/>/g, '＞');
}

export function findFirstTagBlock(xml: string, tagName: string): string | null {
  const pattern = new RegExp(`<${tagName}\\b[^>]*>[\\s\\S]*?</${tagName}>`);
  const match = xml.match(pattern);
  return match ? match[0] : null;
}

export function extractOpenTag(tagBlock: string): string {
  const openTagMatch = tagBlock.match(/^<[^>]+>/);
  if (!openTagMatch) {
    throw new Error('Invalid XML: missing open tag');
  }
  return openTagMatch[0];
}

export function extractInnerXml(tagBlock: string, tagName: string): string {
  const pattern = new RegExp(`^<${tagName}\\b[^>]*>([\\s\\S]*?)</${tagName}>$`);
  const match = tagBlock.match(pattern);
  if (!match) {
    throw new Error(`Invalid XML: could not extract inner XML for ${tagName}`);
  }
  return match[1];
}
