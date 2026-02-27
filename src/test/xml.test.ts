import test from 'node:test';
import assert from 'node:assert/strict';

import { stripTags, stripTagsPreserveWhitespace, parseAttributes } from '../qti/xml.js';

test('parseAttributes extracts attributes from a tag string', () => {
  const tag = '<qti-assessment-item identifier="item-1" title=\'Item One\'  empty="" >';
  const attrs = parseAttributes(tag);

  assert.deepEqual(attrs, {
    identifier: 'item-1',
    title: 'Item One',
    empty: '',
  });
});

test('parseAttributes handles attributes with namespaces and special characters', () => {
  const tag = '<test xml:lang="en" data-custom="val_123" _hidden="true">';
  const attrs = parseAttributes(tag);

  assert.deepEqual(attrs, {
    'xml:lang': 'en',
    'data-custom': 'val_123',
    _hidden: 'true',
  });
});

test('stripTagsPreserveWhitespace decodes XML entities', () => {
  const value = '&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;ok&quot;';
  const stripped = stripTagsPreserveWhitespace(value);

  assert.equal(stripped, '<script>alert(1)</script> & "ok"');
});

test('stripTags removes tags and decodes entities', () => {
  const value = '<p>Hello &lt;world&gt; &amp; friends</p>';
  const stripped = stripTags(value);

  assert.equal(stripped, 'Hello <world> & friends');
});
