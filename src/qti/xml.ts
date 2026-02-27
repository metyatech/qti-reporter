import { JSDOM } from 'jsdom';

export interface XmlAttributes {
  [key: string]: string;
}

export function parseAttributes(tagOpen: string): XmlAttributes {
  // Ensure the tag is well-formed for XML parsing by closing it if necessary
  let wellFormed = tagOpen;
  if (!tagOpen.endsWith('/>') && !tagOpen.endsWith('/ >')) {
    const tagNameMatch = tagOpen.match(/^<([A-Za-z0-9_.:-]+)/);
    if (tagNameMatch) {
      wellFormed = `${tagOpen}</${tagNameMatch[1]}>`;
    }
  }

  const dom = new JSDOM(wellFormed, { contentType: 'text/xml' });
  const el = dom.window.document.documentElement;
  const attributes: XmlAttributes = {};

  if (el) {
    for (let i = 0; i < el.attributes.length; i++) {
      const attr = el.attributes[i];
      attributes[attr.name] = attr.value;
    }
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
  const fragment = JSDOM.fragment(xmlFragment);
  const text = fragment.textContent ?? '';
  return text.replace(/\s+/g, ' ').trim();
}

export function stripTagsPreserveWhitespace(xmlFragment: string): string {
  const fragment = JSDOM.fragment(xmlFragment);
  return fragment.textContent ?? '';
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
