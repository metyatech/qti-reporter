import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { parseAssessmentResult } from '../qti/assessmentResult.js';

function makeResultXml(blocks: string[]): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<assessmentResult xmlns="http://www.imsglobal.org/xsd/imsqti_result_v3p0">
  <context sourcedId="unit-test">
    <sessionIdentifier sourceID="candidateId" identifier="test-001" />
    <sessionIdentifier sourceID="candidateName" identifier="Test Candidate" />
  </context>
  <testResult identifier="unit-test-result" datestamp="2026-06-13T00:00:00+09:00">
    <outcomeVariable identifier="SCORE" baseType="float" cardinality="single">
      <value>0</value>
    </outcomeVariable>
  </testResult>
${blocks.map((block) => `  ${block}`).join('\n')}
</assessmentResult>
`;
}

function writeTempResult(blocks: string[]): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qti-reporter-result-'));
  const file = path.join(dir, 'result.xml');
  fs.writeFileSync(file, makeResultXml(blocks), 'utf8');
  return file;
}

test('self-closing candidateResponse with `<candidateResponse />` produces values: []', () => {
  const resultPath = writeTempResult([
    `<itemResult identifier="empty-self-closing" datestamp="2026-06-13T00:00:00+09:00" sessionStatus="final">
      <responseVariable identifier="RESPONSE" baseType="string" cardinality="single">
        <candidateResponse />
      </responseVariable>
      <outcomeVariable identifier="SCORE" baseType="float" cardinality="single">
        <value>0</value>
      </outcomeVariable>
    </itemResult>`,
  ]);
  const result = parseAssessmentResult(resultPath);
  const itemResult = result.itemResults.get('empty-self-closing');
  assert.ok(itemResult, 'itemResult must exist for empty-self-closing');
  assert.equal(itemResult?.responses.length, 1, 'one responseVariable must be present');
  assert.equal(itemResult?.responses[0]?.responseIdentifier, 'RESPONSE');
  assert.deepEqual(itemResult?.responses[0]?.values, []);
});

test('self-closing candidateResponse with `<candidateResponse/>` produces values: []', () => {
  const resultPath = writeTempResult([
    `<itemResult identifier="empty-self-closing-tight" datestamp="2026-06-13T00:00:00+09:00" sessionStatus="final">
      <responseVariable identifier="RESPONSE" baseType="string" cardinality="single">
        <candidateResponse/>
      </responseVariable>
      <outcomeVariable identifier="SCORE" baseType="float" cardinality="single">
        <value>0</value>
      </outcomeVariable>
    </itemResult>`,
  ]);
  const result = parseAssessmentResult(resultPath);
  const itemResult = result.itemResults.get('empty-self-closing-tight');
  assert.ok(itemResult);
  assert.equal(itemResult?.responses.length, 1);
  assert.equal(itemResult?.responses[0]?.responseIdentifier, 'RESPONSE');
  assert.deepEqual(itemResult?.responses[0]?.values, []);
});

test('responseVariable without candidateResponse element is skipped', () => {
  const resultPath = writeTempResult([
    `<itemResult identifier="no-candidate" datestamp="2026-06-13T00:00:00+09:00" sessionStatus="final">
      <responseVariable identifier="RESPONSE" baseType="string" cardinality="single" />
      <outcomeVariable identifier="SCORE" baseType="float" cardinality="single">
        <value>0</value>
      </outcomeVariable>
    </itemResult>`,
  ]);
  const result = parseAssessmentResult(resultPath);
  const itemResult = result.itemResults.get('no-candidate');
  assert.ok(itemResult);
  assert.equal(
    itemResult?.responses.length,
    0,
    'responseVariable without candidateResponse must be skipped'
  );
});

test('responseVariable document order is preserved', () => {
  const resultPath = writeTempResult([
    `<itemResult identifier="ordered" datestamp="2026-06-13T00:00:00+09:00" sessionStatus="final">
      <responseVariable identifier="Z" baseType="string" cardinality="single">
        <candidateResponse>
          <value>zebra</value>
        </candidateResponse>
      </responseVariable>
      <responseVariable identifier="A" baseType="string" cardinality="single">
        <candidateResponse>
          <value>apple</value>
        </candidateResponse>
      </responseVariable>
      <responseVariable identifier="M" baseType="string" cardinality="single">
        <candidateResponse>
          <value>mango</value>
        </candidateResponse>
      </responseVariable>
      <outcomeVariable identifier="SCORE" baseType="float" cardinality="single">
        <value>0</value>
      </outcomeVariable>
    </itemResult>`,
  ]);
  const result = parseAssessmentResult(resultPath);
  const itemResult = result.itemResults.get('ordered');
  assert.ok(itemResult);
  const ids = itemResult?.responses.map((response) => response.responseIdentifier);
  assert.deepEqual(ids, ['Z', 'A', 'M'], 'document order of responseVariables must be preserved');
});

test('paired empty <value></value> produces values: [""]', () => {
  const resultPath = writeTempResult([
    `<itemResult identifier="paired-empty" datestamp="2026-06-13T00:00:00+09:00" sessionStatus="final">
      <responseVariable identifier="RESPONSE" baseType="string" cardinality="single">
        <candidateResponse><value></value></candidateResponse>
      </responseVariable>
      <outcomeVariable identifier="SCORE" baseType="float" cardinality="single">
        <value>0</value>
      </outcomeVariable>
    </itemResult>`,
  ]);
  const result = parseAssessmentResult(resultPath);
  const itemResult = result.itemResults.get('paired-empty');
  assert.ok(itemResult, 'itemResult must exist for paired-empty');
  assert.equal(itemResult?.responses.length, 1, 'one responseVariable must be present');
  assert.equal(itemResult?.responses[0]?.responseIdentifier, 'RESPONSE');
  assert.deepEqual(itemResult?.responses[0]?.values, [''], 'paired empty <value> must yield [""]');
});

test('self-closing <value /> (with space) produces values: [""]', () => {
  const resultPath = writeTempResult([
    `<itemResult identifier="self-closing-spaced" datestamp="2026-06-13T00:00:00+09:00" sessionStatus="final">
      <responseVariable identifier="RESPONSE" baseType="string" cardinality="single">
        <candidateResponse><value /></candidateResponse>
      </responseVariable>
      <outcomeVariable identifier="SCORE" baseType="float" cardinality="single">
        <value>0</value>
      </outcomeVariable>
    </itemResult>`,
  ]);
  const result = parseAssessmentResult(resultPath);
  const itemResult = result.itemResults.get('self-closing-spaced');
  assert.ok(itemResult);
  assert.equal(itemResult?.responses.length, 1);
  assert.equal(itemResult?.responses[0]?.responseIdentifier, 'RESPONSE');
  assert.deepEqual(
    itemResult?.responses[0]?.values,
    [''],
    'self-closing <value /> with space must yield [""]'
  );
});

test('self-closing <value/> (no space) produces values: [""]', () => {
  const resultPath = writeTempResult([
    `<itemResult identifier="self-closing-tight" datestamp="2026-06-13T00:00:00+09:00" sessionStatus="final">
      <responseVariable identifier="RESPONSE" baseType="string" cardinality="single">
        <candidateResponse><value/></candidateResponse>
      </responseVariable>
      <outcomeVariable identifier="SCORE" baseType="float" cardinality="single">
        <value>0</value>
      </outcomeVariable>
    </itemResult>`,
  ]);
  const result = parseAssessmentResult(resultPath);
  const itemResult = result.itemResults.get('self-closing-tight');
  assert.ok(itemResult);
  assert.equal(itemResult?.responses.length, 1);
  assert.equal(itemResult?.responses[0]?.responseIdentifier, 'RESPONSE');
  assert.deepEqual(
    itemResult?.responses[0]?.values,
    [''],
    'self-closing <value/> without space must yield [""]'
  );
});

test('document order of responseVariables is preserved with mixed empty value forms', () => {
  // A has `<value></value>`, B has `<value />`, C has `<value>plain</value>`.
  // The parser must produce three responseVariable records in A, B, C
  // document order with values `[""]`, `[""]`, `["plain"]` respectively.
  const resultPath = writeTempResult([
    `<itemResult identifier="mixed-empty" datestamp="2026-06-13T00:00:00+09:00" sessionStatus="final">
      <responseVariable identifier="A" baseType="string" cardinality="single">
        <candidateResponse><value></value></candidateResponse>
      </responseVariable>
      <responseVariable identifier="B" baseType="string" cardinality="single">
        <candidateResponse><value /></candidateResponse>
      </responseVariable>
      <responseVariable identifier="C" baseType="string" cardinality="single">
        <candidateResponse><value>plain</value></candidateResponse>
      </responseVariable>
      <outcomeVariable identifier="SCORE" baseType="float" cardinality="single">
        <value>0</value>
      </outcomeVariable>
    </itemResult>`,
  ]);
  const result = parseAssessmentResult(resultPath);
  const itemResult = result.itemResults.get('mixed-empty');
  assert.ok(itemResult);
  assert.equal(itemResult?.responses.length, 3, 'three responseVariables must be present');
  const records = itemResult?.responses ?? [];
  assert.equal(records[0]?.responseIdentifier, 'A');
  assert.deepEqual(records[0]?.values, ['']);
  assert.equal(records[1]?.responseIdentifier, 'B');
  assert.deepEqual(records[1]?.values, ['']);
  assert.equal(records[2]?.responseIdentifier, 'C');
  assert.deepEqual(records[2]?.values, ['plain']);
});

test('non-empty values preserve whitespace, tabs, and newlines (no trim)', () => {
  // Whitespace-only values, values with leading/trailing whitespace, tabs,
  // and newlines must all be preserved verbatim. The parser only normalizes
  // CRLF/CR to LF; it does not trim.
  const resultPath = writeTempResult([
    `<itemResult identifier="ws-preserve" datestamp="2026-06-13T00:00:00+09:00" sessionStatus="final">
      <responseVariable identifier="RESPONSE" baseType="string" cardinality="single">
        <candidateResponse><value>	answer  with  spaces
	</value></candidateResponse>
      </responseVariable>
      <outcomeVariable identifier="SCORE" baseType="float" cardinality="single">
        <value>0</value>
      </outcomeVariable>
    </itemResult>`,
  ]);
  const result = parseAssessmentResult(resultPath);
  const itemResult = result.itemResults.get('ws-preserve');
  assert.ok(itemResult);
  const values = itemResult?.responses[0]?.values ?? [];
  assert.equal(values.length, 1);
  assert.equal(
    values[0],
    '\tanswer  with  spaces\n\t',
    'whitespace, tabs, and newlines must be preserved verbatim (no trim)'
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Mixed paired/self-closing <value> form tests
// ─────────────────────────────────────────────────────────────────────────────

test('self-closing then paired → values: ["", "beta"]', () => {
  const resultPath = writeTempResult([
    `<itemResult identifier="mixed-sc-then-paired" datestamp="2026-06-13T00:00:00+09:00" sessionStatus="final">
      <responseVariable identifier="RESPONSE" baseType="string" cardinality="single">
        <candidateResponse>
          <value/>
          <value>beta</value>
        </candidateResponse>
      </responseVariable>
      <outcomeVariable identifier="SCORE" baseType="float" cardinality="single">
        <value>0</value>
      </outcomeVariable>
    </itemResult>`,
  ]);
  const result = parseAssessmentResult(resultPath);
  const itemResult = result.itemResults.get('mixed-sc-then-paired');
  assert.ok(itemResult, 'itemResult must exist');
  assert.equal(itemResult?.responses.length, 1);
  assert.equal(itemResult?.responses[0]?.responseIdentifier, 'RESPONSE');
  assert.deepEqual(itemResult?.responses[0]?.values, ['', 'beta']);
});

test('paired then self-closing → values: ["alpha", ""]', () => {
  const resultPath = writeTempResult([
    `<itemResult identifier="mixed-paired-then-sc" datestamp="2026-06-13T00:00:00+09:00" sessionStatus="final">
      <responseVariable identifier="RESPONSE" baseType="string" cardinality="single">
        <candidateResponse>
          <value>alpha</value>
          <value/>
        </candidateResponse>
      </responseVariable>
      <outcomeVariable identifier="SCORE" baseType="float" cardinality="single">
        <value>0</value>
      </outcomeVariable>
    </itemResult>`,
  ]);
  const result = parseAssessmentResult(resultPath);
  const itemResult = result.itemResults.get('mixed-paired-then-sc');
  assert.ok(itemResult);
  assert.equal(itemResult?.responses.length, 1);
  assert.equal(itemResult?.responses[0]?.responseIdentifier, 'RESPONSE');
  assert.deepEqual(itemResult?.responses[0]?.values, ['alpha', '']);
});

test('self-closing, paired, self-closing → values: ["", "beta", ""]', () => {
  const resultPath = writeTempResult([
    `<itemResult identifier="mixed-sc-paired-sc" datestamp="2026-06-13T00:00:00+09:00" sessionStatus="final">
      <responseVariable identifier="RESPONSE" baseType="string" cardinality="single">
        <candidateResponse>
          <value/>
          <value>beta</value>
          <value/>
        </candidateResponse>
      </responseVariable>
      <outcomeVariable identifier="SCORE" baseType="float" cardinality="single">
        <value>0</value>
      </outcomeVariable>
    </itemResult>`,
  ]);
  const result = parseAssessmentResult(resultPath);
  const itemResult = result.itemResults.get('mixed-sc-paired-sc');
  assert.ok(itemResult);
  assert.equal(itemResult?.responses.length, 1);
  assert.equal(itemResult?.responses[0]?.responseIdentifier, 'RESPONSE');
  assert.deepEqual(itemResult?.responses[0]?.values, ['', 'beta', '']);
});

test('empty paired, paired, self-closing-with-space, paired → values: ["", "beta", "", "delta"]', () => {
  const resultPath = writeTempResult([
    `<itemResult identifier="mixed-empty-paired-sc-paired" datestamp="2026-06-13T00:00:00+09:00" sessionStatus="final">
      <responseVariable identifier="RESPONSE" baseType="string" cardinality="single">
        <candidateResponse>
          <value></value>
          <value>beta</value>
          <value />
          <value>delta</value>
        </candidateResponse>
      </responseVariable>
      <outcomeVariable identifier="SCORE" baseType="float" cardinality="single">
        <value>0</value>
      </outcomeVariable>
    </itemResult>`,
  ]);
  const result = parseAssessmentResult(resultPath);
  const itemResult = result.itemResults.get('mixed-empty-paired-sc-paired');
  assert.ok(itemResult);
  assert.equal(itemResult?.responses.length, 1);
  assert.equal(itemResult?.responses[0]?.responseIdentifier, 'RESPONSE');
  assert.deepEqual(itemResult?.responses[0]?.values, ['', 'beta', '', 'delta']);
});

test('paired <value data-test="x">alpha</value> — attribute must not bleed into value', () => {
  const resultPath = writeTempResult([
    `<itemResult identifier="paired-with-attr" datestamp="2026-06-13T00:00:00+09:00" sessionStatus="final">
      <responseVariable identifier="RESPONSE" baseType="string" cardinality="single">
        <candidateResponse><value data-test="x">alpha</value></candidateResponse>
      </responseVariable>
      <outcomeVariable identifier="SCORE" baseType="float" cardinality="single">
        <value>0</value>
      </outcomeVariable>
    </itemResult>`,
  ]);
  const result = parseAssessmentResult(resultPath);
  const itemResult = result.itemResults.get('paired-with-attr');
  assert.ok(itemResult);
  assert.equal(itemResult?.responses.length, 1);
  assert.equal(itemResult?.responses[0]?.responseIdentifier, 'RESPONSE');
  assert.deepEqual(itemResult?.responses[0]?.values, ['alpha']);
});

test('self-closing <value data-test="x" /> — attribute must not bleed into value', () => {
  const resultPath = writeTempResult([
    `<itemResult identifier="self-closing-with-attr" datestamp="2026-06-13T00:00:00+09:00" sessionStatus="final">
      <responseVariable identifier="RESPONSE" baseType="string" cardinality="single">
        <candidateResponse><value data-test="x" /></candidateResponse>
      </responseVariable>
      <outcomeVariable identifier="SCORE" baseType="float" cardinality="single">
        <value>0</value>
      </outcomeVariable>
    </itemResult>`,
  ]);
  const result = parseAssessmentResult(resultPath);
  const itemResult = result.itemResults.get('self-closing-with-attr');
  assert.ok(itemResult);
  assert.equal(itemResult?.responses.length, 1);
  assert.equal(itemResult?.responses[0]?.responseIdentifier, 'RESPONSE');
  assert.deepEqual(itemResult?.responses[0]?.values, ['']);
});

test('whitespace/tab/newline/CRLF preserved across multiple values', () => {
  const resultPath = writeTempResult([
    `<itemResult identifier="ws-multi" datestamp="2026-06-13T00:00:00+09:00" sessionStatus="final">
      <responseVariable identifier="RESPONSE" baseType="string" cardinality="single">
        <candidateResponse>
          <value>	answer  with  spaces
  </value>
          <value>line one
  	indented
  blank above</value>
          <value>crlf&#x0d;&#x0a;lf
  end</value>
        </candidateResponse>
      </responseVariable>
      <outcomeVariable identifier="SCORE" baseType="float" cardinality="single">
        <value>0</value>
      </outcomeVariable>
    </itemResult>`,
  ]);
  const result = parseAssessmentResult(resultPath);
  const itemResult = result.itemResults.get('ws-multi');
  assert.ok(itemResult);
  const values = itemResult?.responses[0]?.values ?? [];
  assert.equal(values.length, 3);
  assert.equal(values[0], '\tanswer  with  spaces\n  ');
  assert.equal(values[1], 'line one\n  \tindented\n  blank above');
  // CRLF (&#x0d;&#x0a;) normalized to LF
  assert.equal(values[2], 'crlf\nlf\n  end');
});
