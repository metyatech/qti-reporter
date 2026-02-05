import test from 'node:test';
import assert from 'node:assert/strict';

import { stripTags, stripTagsPreserveWhitespace } from '../qti/xml.js';

test('stripTagsPreserveWhitespace does not decode angle brackets from entities', () => {
  const value = '&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;ok&quot;';
  const stripped = stripTagsPreserveWhitespace(value);

  assert.ok(!stripped.includes('<script'));
  assert.equal(stripped, '&lt;script&gt;alert(1)&lt;/script&gt; & "ok"');
});

test('stripTags removes tags without reintroducing decoded tags', () => {
  const value = '<p>Hello &lt;world&gt; &amp; friends</p>';
  const stripped = stripTags(value);

  assert.ok(!stripped.includes('<world'));
  assert.equal(stripped, 'Hello &lt;world&gt; & friends');
});
