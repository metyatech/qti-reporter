import test from 'node:test';
import assert from 'node:assert/strict';

import { stripTags, stripTagsPreserveWhitespace } from '../qti/xml.js';

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
