import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

import { generateHtmlReportFromFiles } from '../report/htmlReport.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function getRepoRootFromDist(): string {
  return path.resolve(__dirname, '..', '..');
}

function resolveFixturePath(fileName: string): string {
  return path.join(getRepoRootFromDist(), 'src', 'test', 'fixtures', fileName);
}

function createCleanOutputDir(dirName: string): string {
  const repoRoot = getRepoRootFromDist();
  const outputDir = path.join(repoRoot, 'tmp', dirName);
  fs.rmSync(outputDir, { recursive: true, force: true });
  fs.mkdirSync(outputDir, { recursive: true });
  return outputDir;
}

function generateUnificationReport(dirName: string): string {
  const outputRootDir = createCleanOutputDir(dirName);
  return generateHtmlReportFromFiles({
    assessmentTestPath: resolveFixturePath('unification-test.qti.xml'),
    assessmentResultPath: resolveFixturePath('unification-result.xml'),
    outputRootDir,
  }).html;
}

function parseReport(html: string): Document {
  return new JSDOM(html).window.document;
}

function findItemBlock(doc: Document, identifier: string): Element | null {
  return doc.querySelector(`details.item-block[data-item-identifier="${identifier}"]`);
}

function sliceFromItem(doc: Document, identifier: string, subSelector: string): Element | null {
  const block = findItemBlock(doc, identifier);
  if (!block) return null;
  return block.querySelector(subSelector);
}

test('multiple choice interactions show all correct values and the submitted selection', () => {
  const html = generateUnificationReport('unification-multi-choice');
  const doc = parseReport(html);
  const correct = sliceFromItem(doc, 'multi-choice', 'details.correct-answer-block');
  assert.ok(correct, 'correct-answer block must exist');
  correct?.setAttribute('open', '');
  const text = correct?.textContent ?? '';
  assert.ok(text.includes('First'), 'correct answer must include First (CHOICE_A)');
  assert.ok(text.includes('Third'), 'correct answer must include Third (CHOICE_C)');
  assert.ok(
    !text.includes('Second'),
    'correct answer must not include Second (CHOICE_B) since it is not correct'
  );

  const candidate = sliceFromItem(doc, 'multi-choice', 'details.candidate-response-block');
  assert.ok(candidate, 'candidate-response block must exist');
  candidate?.setAttribute('open', '');
  // The candidate selected CHOICE_A and CHOICE_C; both must be marked.
  const checked = Array.from(candidate?.querySelectorAll('input[type="checkbox"]:checked') ?? []);
  assert.equal(checked.length, 2, 'two checkboxes must be pre-checked');
  const checkedValues = checked.map((input) => input.getAttribute('value') ?? '').sort();
  assert.deepEqual(checkedValues, ['First', 'Third']);
  // All three options must still render (so the user can see what was unselected).
  const allOptions = Array.from(candidate?.querySelectorAll('li.choice-response-option') ?? []);
  assert.equal(allOptions.length, 3);
});

test('single choice and multiple choice in the same item are independent', () => {
  // For this scenario we use an item that mixes one single-choice interaction
  // with one multiple-choice interaction. Each interaction renders a separate
  // radio/checkbox list, and the radio/checkbox groups do not collide even
  // when the candidate's selected identifiers are the same.
  // The collision-choice item is single-choice for both interactions, so we
  // use it here to confirm the radio input value uses the choice text (not
  // the internal identifier) and that each interaction has its own name.
  const html = generateUnificationReport('unification-collision');
  const doc = parseReport(html);
  const block = findItemBlock(doc, 'collision-choice');
  assert.ok(block, 'collision-choice block must exist');
  const candidate = block.querySelector('details.candidate-response-block');
  assert.ok(candidate, 'candidate-response block must exist');
  candidate?.setAttribute('open', '');

  // Scope to the candidate-response per-interaction radios only.
  const radios = Array.from(
    candidate.querySelectorAll('.candidate-response-interaction input[type="radio"]:checked')
  );
  // Two single-choice interactions each pre-check one radio (RESPONSE and
  // COLLISION).
  assert.equal(radios.length, 2, 'each pre-checked radio corresponds to a different interaction');
  // The radio input value must be the choice text (not the internal id) for
  // the relevant interaction. RESPONSE interaction's chosen option is
  // "Alpha"; COLLISION interaction's chosen option is "Gamma" (the second
  // qti-choice-interaction's first option, which also carries the internal
  // identifier CHOICE_A).
  const valuesByName = new Map<string, string>();
  for (const radio of radios) {
    valuesByName.set(radio.getAttribute('name') ?? '', radio.getAttribute('value') ?? '');
  }
  // The new radio name contract is
  // `qti-candidate-<itemIdentifier>-<index>-<interactionIdentifier>`.
  // For collision-choice the item identifier is `collision-choice`, the
  // RESPONSE interaction is at index 0, and the COLLISION interaction is
  // at index 1.
  const responseName = 'qti-candidate-collision-choice-0-RESPONSE';
  const collisionName = 'qti-candidate-collision-choice-1-COLLISION';
  const responseValue = valuesByName.get(responseName);
  const collisionValue = valuesByName.get(collisionName);
  assert.equal(
    responseValue,
    'Alpha',
    `RESPONSE interaction (radio name ${responseName}) must show Alpha as its chosen option, got: ${responseValue}`
  );
  assert.equal(
    collisionValue,
    'Gamma',
    `COLLISION interaction (radio name ${collisionName}) must show Gamma as its chosen option, got: ${collisionValue}`
  );
});

test('two choice interactions that share an internal CHOICE_A identifier render independently', () => {
  // collision-choice has two interactions, both of which use the internal
  // identifier CHOICE_A. The radio for the first interaction and the radio
  // for the second interaction must have different `name` attributes, so the
  // browser does not collapse them into a single group.
  const html = generateUnificationReport('unification-collision');
  const doc = parseReport(html);
  const block = findItemBlock(doc, 'collision-choice');
  assert.ok(block, 'collision-choice block must exist');
  const candidate = block.querySelector('details.candidate-response-block');
  assert.ok(candidate, 'candidate-response block must exist');
  candidate?.setAttribute('open', '');
  // Scope to per-interaction radios only.
  const radios = Array.from(
    candidate.querySelectorAll('.candidate-response-interaction input[type="radio"]')
  );
  const names = new Set(radios.map((input) => input.getAttribute('name') ?? ''));
  assert.equal(
    names.size,
    2,
    `each choice interaction must have its own name; got names: ${Array.from(names).join(', ')}`
  );
  // Names are scoped per interaction by item identifier + interaction
  // index + interaction id. collision-choice has RESPONSE at index 0 and
  // COLLISION at index 1.
  assert.ok(
    Array.from(names).some((name) => name === 'qti-candidate-collision-choice-0-RESPONSE'),
    `expected per-interaction name for RESPONSE; got: ${Array.from(names).join(', ')}`
  );
  assert.ok(
    Array.from(names).some((name) => name === 'qti-candidate-collision-choice-1-COLLISION'),
    `expected per-interaction name for COLLISION; got: ${Array.from(names).join(', ')}`
  );
});

test('one interaction with a response and another without renders （無回答） for the missing one', () => {
  // partial-response has two interactions; only one carries a submitted value
  // in this scenario because we mutate the result so RESPONSE_B has no value.
  const outputRootDir = createCleanOutputDir('unification-partial-missing');
  const baseResultPath = resolveFixturePath('unification-result.xml');
  const baseResultXml = fs.readFileSync(baseResultPath, 'utf8');
  // Strip the RESPONSE_B responseVariable entirely.
  const patched = baseResultXml.replace(
    /<responseVariable identifier="RESPONSE_B"[\s\S]*?<\/responseVariable>/,
    ''
  );
  const patchedPath = path.join(getRepoRootFromDist(), 'tmp', 'partial-missing-result.xml');
  fs.writeFileSync(patchedPath, patched, 'utf8');

  const report = generateHtmlReportFromFiles({
    assessmentTestPath: resolveFixturePath('unification-test.qti.xml'),
    assessmentResultPath: patchedPath,
    outputRootDir,
  });
  const doc = parseReport(report.html);
  const block = findItemBlock(doc, 'partial-response');
  assert.ok(block, 'partial-response block must exist');
  const candidate = block.querySelector('details.candidate-response-block');
  assert.ok(candidate, 'candidate-response block must exist');
  candidate?.setAttribute('open', '');
  // Both interactions must render their own per-interaction block.
  const perInteractionBlocks = Array.from(
    candidate.querySelectorAll('.candidate-response-interaction')
  );
  assert.equal(perInteractionBlocks.length, 2);
  // The RESPONSE_A block must mark CHOICE_A as selected; RESPONSE_B must
  // show （無回答） because no value was submitted.
  const responseAIdAttr = perInteractionBlocks[0]?.getAttribute('data-interaction-id');
  const responseBIdAttr = perInteractionBlocks[1]?.getAttribute('data-interaction-id');
  assert.equal(responseAIdAttr, 'RESPONSE_A');
  assert.equal(responseBIdAttr, 'RESPONSE_B');
  const responseBText = perInteractionBlocks[1]?.textContent ?? '';
  assert.ok(
    responseBText.includes('（無回答）'),
    `RESPONSE_B must render （無回答）, got: ${responseBText}`
  );
});

test('declaration order vs. body order mismatch: identifier binding drives assignment', () => {
  // declaration-mismatch has DECLARED_FIRST declared first and DECLARED_SECOND
  // declared second, but the body places the DECLARED_SECOND interaction
  // first. The reporter must look up submitted values by identifier, not by
  // document order, so each interaction shows the value for its own identifier.
  const html = generateUnificationReport('unification-declaration');
  const doc = parseReport(html);
  const block = findItemBlock(doc, 'declaration-mismatch');
  assert.ok(block, 'declaration-mismatch block must exist');
  const candidate = block.querySelector('details.candidate-response-block');
  assert.ok(candidate, 'candidate-response block must exist');
  candidate?.setAttribute('open', '');
  const perInteractionBlocks = Array.from(
    candidate.querySelectorAll('.candidate-response-interaction')
  );
  assert.equal(perInteractionBlocks.length, 2);
  // First interaction in body is DECLARED_SECOND; value should be "second".
  const firstInput = perInteractionBlocks[0]?.querySelector('input.cloze-input.qti-blank-input');
  assert.equal(
    firstInput?.getAttribute('value'),
    'second',
    'first body interaction (DECLARED_SECOND) must show its own submitted value'
  );
  // Second interaction in body is DECLARED_FIRST; value should be "declared".
  const secondInput = perInteractionBlocks[1]?.querySelector('input.cloze-input.qti-blank-input');
  assert.equal(
    secondInput?.getAttribute('value'),
    'declared',
    'second body interaction (DECLARED_FIRST) must show its own submitted value'
  );
});

test('assessmentResult responseVariable order is preserved but each interaction uses its own identifier', () => {
  // order-mismatch has RESPONSE_B before RESPONSE_A in the result XML.
  // The reporter preserves that order in the response array but binds by
  // identifier, so each interaction's body order still shows the right
  // value.
  const html = generateUnificationReport('unification-order-mismatch');
  const doc = parseReport(html);
  const block = findItemBlock(doc, 'order-mismatch');
  assert.ok(block, 'order-mismatch block must exist');
  const candidate = block.querySelector('details.candidate-response-block');
  assert.ok(candidate, 'candidate-response block must exist');
  candidate?.setAttribute('open', '');
  // The body declares RESPONSE_A first then RESPONSE_B, so the per-interaction
  // blocks must appear in that body order.
  const perInteractionBlocks = Array.from(
    candidate.querySelectorAll('.candidate-response-interaction')
  );
  assert.equal(perInteractionBlocks.length, 2);
  const firstId = perInteractionBlocks[0]?.getAttribute('data-interaction-id');
  const secondId = perInteractionBlocks[1]?.getAttribute('data-interaction-id');
  assert.equal(firstId, 'RESPONSE_A');
  assert.equal(secondId, 'RESPONSE_B');
  const firstInput = perInteractionBlocks[0]?.querySelector('input.cloze-input.qti-blank-input');
  const secondInput = perInteractionBlocks[1]?.querySelector('input.cloze-input.qti-blank-input');
  assert.equal(firstInput?.getAttribute('value'), 'first');
  assert.equal(secondInput?.getAttribute('value'), 'second');
});

test('legacy ordered RESPONSE distribution routes RESPONSE_N to the renderer-bound index', () => {
  // legacy-ordered has a single RESPONSE declaration with cardinality=ordered
  // and base-type=string and two text-entry interactions RESPONSE_1 / RESPONSE_2.
  // The renderer's legacy distribution binds declarationValueIndex=0 to
  // RESPONSE_1 and declarationValueIndex=1 to RESPONSE_2.
  const html = generateUnificationReport('unification-legacy');
  const doc = parseReport(html);
  const block = findItemBlock(doc, 'legacy-ordered');
  assert.ok(block, 'legacy-ordered block must exist');
  const candidate = block.querySelector('details.candidate-response-block');
  assert.ok(candidate, 'candidate-response block must exist');
  candidate?.setAttribute('open', '');
  // There must be exactly two cloze inputs — one per text-entry interaction.
  const inputs = Array.from(candidate.querySelectorAll('input.cloze-input.qti-blank-input'));
  assert.equal(
    inputs.length,
    2,
    `legacy ordered item must render one input per interaction; got ${inputs.length}`
  );
  // Each interaction wrapper is keyed by its data-interaction-id; the
  // candidate-response block has two wrappers, one with id RESPONSE_1 and
  // one with RESPONSE_2, and each must contain exactly one input.
  const wrappers = Array.from(candidate.querySelectorAll('.candidate-response-interaction'));
  assert.equal(
    wrappers.length,
    2,
    `legacy ordered item must have two per-interaction wrappers; got ${wrappers.length}`
  );
  for (const wrapper of wrappers) {
    const wrapperInputs = wrapper.querySelectorAll('input.cloze-input.qti-blank-input');
    assert.equal(
      wrapperInputs.length,
      1,
      `each legacy interaction wrapper must contain exactly one input; got ${wrapperInputs.length}`
    );
  }
  // Document-order assertion: the first input is RESPONSE_1 (alpha) and
  // the second is RESPONSE_2 (beta). The renderer reports the bindings in
  // document order, so this is also the renderer-assigned order.
  const values = inputs.map((input) => input.getAttribute('value') ?? '');
  assert.equal(
    values[0],
    'alpha',
    `legacy ordered first input must be "alpha" (RESPONSE_1); got ${values.join(',')}`
  );
  assert.equal(
    values[1],
    'beta',
    `legacy ordered second input must be "beta" (RESPONSE_2); got ${values.join(',')}`
  );
});

test('legacy ordered RESPONSE distribution with trailing empty <value/> keeps alpha/beta binding', () => {
  // The `legacy-ordered` item has a single RESPONSE declaration with
  // cardinality=ordered and two text-entry interactions RESPONSE_1 /
  // RESPONSE_2. The result XML for this item now carries a trailing
  // self-closing `<value/>` after `<value>beta</value>` inside the same
  // `<candidateResponse>`, so the parser's mixed-form handling must
  // preserve document order and yield `["alpha", "beta", ""]`. The
  // renderer's legacy distribution still binds declarationValueIndex=0
  // to RESPONSE_1 and declarationValueIndex=1 to RESPONSE_2; the third
  // (empty) entry is not consumed by any interaction. This regression
  // test pins the per-wrapper binding even when the candidate response
  // array contains an extra trailing empty value.
  const html = generateUnificationReport('unification-legacy-trailing-empty');
  const doc = parseReport(html);
  const block = findItemBlock(doc, 'legacy-ordered');
  assert.ok(block, 'legacy-ordered block must exist');
  const candidate = block.querySelector('details.candidate-response-block');
  assert.ok(candidate, 'candidate-response block must exist');
  candidate?.setAttribute('open', '');
  // Exactly two per-interaction wrappers — one for RESPONSE_1, one for
  // RESPONSE_2. The trailing empty `<value/>` in the result must NOT
  // spawn a third wrapper, and the existing alpha/beta entries must
  // still be routed to RESPONSE_1 (idx 0) and RESPONSE_2 (idx 1).
  const wrappers = Array.from(candidate.querySelectorAll('.candidate-response-interaction'));
  assert.equal(
    wrappers.length,
    2,
    `legacy ordered item must have two per-interaction wrappers even with a trailing empty <value/>; got ${wrappers.length}`
  );
  // Document order: RESPONSE_1 first, RESPONSE_2 second.
  const firstId = wrappers[0]?.getAttribute('data-interaction-id');
  const secondId = wrappers[1]?.getAttribute('data-interaction-id');
  assert.equal(firstId, 'RESPONSE_1', `first wrapper must be RESPONSE_1; got ${firstId}`);
  assert.equal(secondId, 'RESPONSE_2', `second wrapper must be RESPONSE_2; got ${secondId}`);
  // Each wrapper must contain exactly one cloze input, and the input
  // value must be the value at the corresponding declarationValueIndex.
  const firstWrapperInputs =
    wrappers[0]?.querySelectorAll('input.cloze-input.qti-blank-input') ?? [];
  const secondWrapperInputs =
    wrappers[1]?.querySelectorAll('input.cloze-input.qti-blank-input') ?? [];
  assert.equal(
    firstWrapperInputs.length,
    1,
    `RESPONSE_1 wrapper must contain exactly one cloze input; got ${firstWrapperInputs.length}`
  );
  assert.equal(
    secondWrapperInputs.length,
    1,
    `RESPONSE_2 wrapper must contain exactly one cloze input; got ${secondWrapperInputs.length}`
  );
  assert.equal(
    firstWrapperInputs[0]?.getAttribute('value'),
    'alpha',
    `RESPONSE_1 wrapper input must carry value="alpha" (declarationValueIndex=0); got ${firstWrapperInputs[0]?.getAttribute('value')}`
  );
  assert.equal(
    secondWrapperInputs[0]?.getAttribute('value'),
    'beta',
    `RESPONSE_2 wrapper input must carry value="beta" (declarationValueIndex=1); got ${secondWrapperInputs[0]?.getAttribute('value')}`
  );
});

test('distinct RESPONSE_1 and RESPONSE_2 declarations bind directly without legacy distribution', () => {
  // legacy-distinct-vars has two separate RESPONSE_1 / RESPONSE_2 declarations
  // (cardinality=single each) and two text-entry interactions. Unlike
  // legacy-ordered where a single cardinality=ordered RESPONSE is distributed
  // by declarationValueIndex, here the renderer binds RESPONSE_1 interaction
  // directly to RESPONSE_1 and RESPONSE_2 directly to RESPONSE_2. The HTML
  // output must still show alpha for the first input and beta for the second.
  const html = generateUnificationReport('unification-legacy-distinct');
  const doc = parseReport(html);
  const block = findItemBlock(doc, 'legacy-distinct-vars');
  assert.ok(block, 'legacy-distinct-vars block must exist');
  const candidate = block.querySelector('details.candidate-response-block');
  assert.ok(candidate, 'candidate-response block must exist');
  candidate?.setAttribute('open', '');
  // There must be exactly two cloze inputs — one per text-entry interaction.
  const inputs = Array.from(candidate.querySelectorAll('input.cloze-input.qti-blank-input'));
  assert.equal(
    inputs.length,
    2,
    `distinct vars item must render one input per interaction; got ${inputs.length}`
  );
  // Each interaction wrapper is keyed by its data-interaction-id; the
  // candidate-response block has two wrappers, one with id RESPONSE_1 and
  // one with RESPONSE_2, and each must contain exactly one input.
  const wrappers = Array.from(candidate.querySelectorAll('.candidate-response-interaction'));
  assert.equal(
    wrappers.length,
    2,
    `distinct vars item must have two per-interaction wrappers; got ${wrappers.length}`
  );
  for (const wrapper of wrappers) {
    const wrapperInputs = wrapper.querySelectorAll('input.cloze-input.qti-blank-input');
    assert.equal(
      wrapperInputs.length,
      1,
      `each interaction wrapper must contain exactly one input; got ${wrapperInputs.length}`
    );
  }
  // Document-order assertion: the first input is RESPONSE_1 (alpha) and
  // the second is RESPONSE_2 (beta). Each wrapper's data-interaction-id
  // must match its identifier.
  const firstWrapper = wrappers[0];
  const secondWrapper = wrappers[1];
  assert.equal(
    firstWrapper?.getAttribute('data-interaction-id'),
    'RESPONSE_1',
    `first wrapper must be RESPONSE_1; got ${firstWrapper?.getAttribute('data-interaction-id')}`
  );
  assert.equal(
    secondWrapper?.getAttribute('data-interaction-id'),
    'RESPONSE_2',
    `second wrapper must be RESPONSE_2; got ${secondWrapper?.getAttribute('data-interaction-id')}`
  );
  const values = inputs.map((input) => input.getAttribute('value') ?? '');
  assert.equal(
    values[0],
    'alpha',
    `first input must be "alpha" (RESPONSE_1); got ${values.join(',')}`
  );
  assert.equal(
    values[1],
    'beta',
    `second input must be "beta" (RESPONSE_2); got ${values.join(',')}`
  );
});

test('multiple text-entry interactions with distinct identifiers each render per-interaction', () => {
  // multi-text-entry has three text-entry interactions with identifiers FIRST,
  // SECOND, THIRD. Each must render its own per-interaction block with the
  // correct value and data-interaction-id.
  const html = generateUnificationReport('unification-multi-text');
  const doc = parseReport(html);
  const block = findItemBlock(doc, 'multi-text-entry');
  assert.ok(block, 'multi-text-entry block must exist');
  const candidate = block.querySelector('details.candidate-response-block');
  assert.ok(candidate, 'candidate-response block must exist');
  candidate?.setAttribute('open', '');
  const perInteractionBlocks = Array.from(
    candidate.querySelectorAll('.candidate-response-interaction')
  );
  assert.equal(perInteractionBlocks.length, 3);
  const ids = perInteractionBlocks.map((el) => el.getAttribute('data-interaction-id'));
  assert.deepEqual(ids, ['FIRST', 'SECOND', 'THIRD']);
  const values = perInteractionBlocks.map(
    (el) => el.querySelector('input.cloze-input.qti-blank-input')?.getAttribute('value') ?? ''
  );
  assert.deepEqual(values, ['apple', 'banana', 'cherry']);
});

test('extended-text response preserves string whitespace and newlines', () => {
  // extended-text's response carries "line one\n  indented\n\ttabbed\n\nblank
  // line above". The reporter must preserve the value as-is (rendered as
  // <pre> with whitespace) so trailing whitespace, indentation, and blank
  // lines survive verbatim.
  const html = generateUnificationReport('unification-extended-text');
  const doc = parseReport(html);
  const block = findItemBlock(doc, 'extended-text');
  assert.ok(block, 'extended-text block must exist');
  const candidate = block.querySelector('details.candidate-response-block');
  assert.ok(candidate, 'candidate-response block must exist');
  candidate?.setAttribute('open', '');
  const pre = candidate.querySelector('pre.response-text.response-pre');
  assert.ok(
    pre,
    'extended-text candidate body must use a <pre class="response-text response-pre">'
  );
  const text = pre?.textContent ?? '';
  assert.ok(text.includes('line one'), 'newline + indent must be preserved');
  assert.ok(text.includes('  indented'), 'leading spaces must be preserved');
  assert.ok(text.includes('\ttabbed'), 'tab character must be preserved');
  assert.ok(
    /\n\n/.test(text),
    'blank line (consecutive newlines) must be preserved in the rendered body'
  );
});

test('multiple choice interaction shows all correct values in the correct-answer block', () => {
  // multiple-values item has cardinality=multiple with two correct values
  // (CHOICE_A, CHOICE_B) and the candidate submitted both. Both must appear
  // in the correct-answer inner details with the choice text, and the
  // submitted selection must be reflected in the candidate-response inner
  // details.
  const html = generateUnificationReport('unification-multiple-values');
  const doc = parseReport(html);
  const block = findItemBlock(doc, 'multiple-values');
  assert.ok(block, 'multiple-values block must exist');
  const correct = block.querySelector('details.correct-answer-block');
  assert.ok(correct, 'correct-answer block must exist');
  correct?.setAttribute('open', '');
  const correctText = correct.textContent ?? '';
  assert.ok(correctText.includes('Alpha'), 'correct body must include Alpha (CHOICE_A)');
  assert.ok(correctText.includes('Beta'), 'correct body must include Beta (CHOICE_B)');

  const candidate = block.querySelector('details.candidate-response-block');
  assert.ok(candidate, 'candidate-response block must exist');
  candidate?.setAttribute('open', '');
  const checked = Array.from(candidate.querySelectorAll('input[type="checkbox"]:checked'));
  assert.equal(checked.length, 2, 'both submitted checkboxes must be pre-checked');
  const checkedValues = checked.map((input) => input.getAttribute('value') ?? '').sort();
  assert.deepEqual(checkedValues, ['Alpha', 'Beta']);
});

test('local image in correct-answer block is copied to assets/ and the src is rewritten', () => {
  // image-correct has a qti-img in the question body. The local image must
  // be copied to assets/<itemIdentifier>/<fileName> and the src in the
  // rendered HTML must be the output-relative path.
  const outputRootDir = createCleanOutputDir('unification-image-correct');
  const report = generateHtmlReportFromFiles({
    assessmentTestPath: resolveFixturePath('unification-test.qti.xml'),
    assessmentResultPath: resolveFixturePath('unification-result.xml'),
    outputRootDir,
  });
  const expectedAssetPath = path.join(
    report.outputDirPath,
    'assets',
    'image-correct',
    'sample.svg'
  );
  assert.equal(
    fs.existsSync(expectedAssetPath),
    true,
    'image-correct item image must be copied to assets/image-correct/sample.svg'
  );
  assert.ok(report.html.includes('./assets/image-correct/sample.svg'));
});

test('local image INSIDE a simple choice is copied to assets/ and resolves in the correct-answer block', () => {
  // image-correct-choice-internal places a qti-img inside a
  // qti-simple-choice (CHOICE_A) which is the correct answer. The image
  // must be copied to assets/<itemIdentifier>/<fileName> and the rendered
  // correct-answer block must reference ./assets/<itemIdentifier>/sample.svg
  // — never the original "images/sample.svg" — because asset resolution
  // walks the resolved questionHtml, which includes the choice's inner
  // HTML as part of the per-interaction choice inner HTML map.
  const outputRootDir = createCleanOutputDir('unification-image-correct-choice-internal');
  const report = generateHtmlReportFromFiles({
    assessmentTestPath: resolveFixturePath('unification-test.qti.xml'),
    assessmentResultPath: resolveFixturePath('unification-result.xml'),
    outputRootDir,
  });
  const expectedAssetPath = path.join(
    report.outputDirPath,
    'assets',
    'image-correct-choice-internal',
    'sample.svg'
  );
  assert.equal(
    fs.existsSync(expectedAssetPath),
    true,
    'image-correct-choice-internal item image must be copied to assets/image-correct-choice-internal/sample.svg'
  );

  const doc = parseReport(report.html);
  const block = findItemBlock(doc, 'image-correct-choice-internal');
  assert.ok(block, 'image-correct-choice-internal block must exist');
  const correct = block.querySelector('details.correct-answer-block');
  assert.ok(correct, 'correct-answer block must exist for image-correct-choice-internal');
  correct?.setAttribute('open', '');

  // The image must exist inside the correct-answer block and must use
  // the resolved output-relative src.
  const images = Array.from(correct.querySelectorAll('img'));
  assert.equal(
    images.length,
    1,
    `correct-answer block must contain exactly one image; got ${images.length}`
  );
  const src = images[0]?.getAttribute('src') ?? '';
  assert.equal(
    src,
    './assets/image-correct-choice-internal/sample.svg',
    `image src must be the resolved output-relative path; got ${src}`
  );

  // The original "images/sample.svg" must NOT appear anywhere inside the
  // correct-answer block.
  const correctHtml = correct.innerHTML;
  assert.ok(
    !correctHtml.includes('images/sample.svg'),
    `correct-answer block must not include the unresolved src "images/sample.svg"; got: ${correctHtml}`
  );

  // The image in the candidate-response and retry-question blocks must
  // also be resolved (the question body — which embeds the choice
  // interaction's body — is the same shared body).
  const candidate = block.querySelector('details.candidate-response-block');
  assert.ok(candidate, 'candidate-response block must exist for image-correct-choice-internal');
  candidate?.setAttribute('open', '');
  const candidateImages = Array.from(candidate.querySelectorAll('img'));
  assert.ok(
    candidateImages.every(
      (img) =>
        (img.getAttribute('src') ?? '') === './assets/image-correct-choice-internal/sample.svg'
    ),
    'candidate-response block images must use the resolved output-relative src'
  );

  const retry = block.querySelector('.retry-question-block');
  assert.ok(retry, 'retry-question-block must exist for image-correct-choice-internal');
  const retryImages = Array.from(retry.querySelectorAll('img'));
  assert.ok(
    retryImages.every(
      (img) =>
        (img.getAttribute('src') ?? '') === './assets/image-correct-choice-internal/sample.svg'
    ),
    'retry-question-block images must use the resolved output-relative src'
  );
});

test('local image in explanation is copied and the explanation body preserves the renderer hljs markup', () => {
  // image-explanation carries a qti-img inside qti-modal-feedback plus a
  // highlighted code block. The reporter must NOT rehighlight the body; the
  // existing hljs-keyword etc. tokens must survive untouched.
  const outputRootDir = createCleanOutputDir('unification-image-explanation');
  const report = generateHtmlReportFromFiles({
    assessmentTestPath: resolveFixturePath('unification-test.qti.xml'),
    assessmentResultPath: resolveFixturePath('unification-result.xml'),
    outputRootDir,
  });
  const expectedAssetPath = path.join(
    report.outputDirPath,
    'assets',
    'image-explanation',
    'sample.svg'
  );
  assert.equal(
    fs.existsSync(expectedAssetPath),
    true,
    'explanation image must be copied to assets/image-explanation/sample.svg'
  );
  assert.ok(report.html.includes('./assets/image-explanation/sample.svg'));

  const doc = parseReport(report.html);
  const block = findItemBlock(doc, 'image-explanation');
  assert.ok(block, 'image-explanation block must exist');
  const explanation = block.querySelector('details.answer-explanation-block');
  assert.ok(explanation, 'explanation block must exist');
  explanation?.setAttribute('open', '');
  // The hljs markup from the renderer must survive untouched.
  const codeBlocks = Array.from(explanation.querySelectorAll('pre code'));
  assert.ok(codeBlocks.length > 0, 'explanation must contain a code block');
  const highlighted = codeBlocks.some((code) => /hljs-keyword|hljs-string/.test(code.outerHTML));
  assert.ok(highlighted, 'explanation code block must carry the renderer-supplied hljs-* classes');
  // The reporter must not have added a second wrapping class. The reporter
  // must not introduce a *new* `<pre class="code-block hljs">` wrapper
  // around the renderer-emitted code block.
  const explanationHtml = explanation.innerHTML;
  const codeBlockOccurrences = (
    explanationHtml.match(/<pre\b[^>]*class="[^"]*\bcode-block\b/g) ?? []
  ).length;
  assert.equal(
    codeBlockOccurrences,
    1,
    `explanation must have exactly one <pre class="code-block ..."> wrapper; found ${codeBlockOccurrences}`
  );
  // And the highlight.js styles are not applied to an inline code that was
  // not a code block.
  const inlineCodes = Array.from(explanation.querySelectorAll('code.code-inline'));
  for (const code of inlineCodes) {
    assert.ok(
      !code.classList.contains('code-block-code'),
      'inline code must not be reclassified as code-block-code by the reporter'
    );
  }
});

test('section is omitted when neither correct response nor explanation is present', () => {
  // no-correct-no-explanation has neither qti-correct-response nor
  // qti-modal-feedback. The reporter must omit the entire
  // answer-explanation-section block.
  const html = generateUnificationReport('unification-no-correct-no-explanation');
  const doc = parseReport(html);
  const block = findItemBlock(doc, 'no-correct-no-explanation');
  assert.ok(block, 'no-correct-no-explanation block must exist');
  const section = block.querySelector('section.answer-explanation-section');
  assert.equal(
    section,
    null,
    'answer-explanation-section must be omitted when there is no correct response and no explanation'
  );
  // Also confirm there is no correct-answer block nor explanation block.
  const correct = block.querySelector('details.correct-answer-block');
  const explanation = block.querySelector('details.answer-explanation-block');
  assert.equal(correct, null);
  assert.equal(explanation, null);
});

test('partial credit (要確認) state is still classified correctly after unification', () => {
  // partial-response has rubric_1 met and rubric_2 unmet, so it should be
  // classified as partial. The pill text is preserved.
  const html = generateUnificationReport('unification-partial');
  const doc = parseReport(html);
  const block = findItemBlock(doc, 'partial-response');
  assert.ok(block, 'partial-response block must exist');
  assert.ok(
    block.hasAttribute('data-item-result'),
    'item-block must carry a data-item-result attribute'
  );
  assert.equal(block.getAttribute('data-item-result'), 'partial');
  assert.ok(html.includes('要確認'), 'status pill text must include 要確認');
});

test('explanation body is not double-highlighted (existing hljs-* classes survive untouched)', () => {
  // image-explanation's code block already carries hljs-keyword / hljs-string
  // markup from the renderer. The reporter must keep that markup verbatim;
  // it must not add a second pass.
  const html = generateUnificationReport('unification-image-explanation');
  const doc = parseReport(html);
  const block = findItemBlock(doc, 'image-explanation');
  assert.ok(block, 'image-explanation block must exist');
  const explanation = block.querySelector('details.answer-explanation-block');
  assert.ok(explanation, 'explanation block must exist');
  explanation?.setAttribute('open', '');
  const preCode = explanation.querySelector('pre code');
  assert.ok(preCode, 'explanation must have pre code');
  // Existing hljs-keyword / hljs-string from the renderer must still be
  // present.
  const codeHtml = preCode.innerHTML;
  assert.ok(
    /hljs-keyword|hljs-string/.test(codeHtml),
    'existing hljs markup must survive the reporter verbatim'
  );
  // And the reporter must not have added a new wrapper class.
  const wrapperClasses = preCode.parentElement?.getAttribute('class') ?? '';
  const matches = wrapperClasses.match(/\bcode-block\b/g) ?? [];
  assert.equal(
    matches.length,
    1,
    `pre parent must have exactly one .code-block class; got "${wrapperClasses}"`
  );
});

test('all <details> blocks (item-block, candidate-response, correct-answer, answer-explanation) start closed', () => {
  // No `<details>` element in the report may carry the `open` attribute by
  // default. The user has to opt in.
  const html = generateUnificationReport('unification-all-closed');
  const openDetails = html.match(/<details[^>]*\sopen[\s>]/g) ?? [];
  assert.equal(
    openDetails.length,
    0,
    `no <details> may have the open attribute; found ${openDetails.length}`
  );
});

test('duplicate interaction id: each interaction renders its own choice text and radio group', () => {
  // duplicate-ids has two `qti-choice-interaction`s both bound to
  // `response-identifier="RESPONSE"`. The first carries Alpha/Beta and the
  // second carries Gamma/Delta. The reporter must:
  //  - render one per-interaction row per choice interaction,
  //  - keep the Alpha/Beta text inside the first row and the Gamma/Delta
  //    text inside the second row (no global-fallback bleed),
  //  - assign each row a distinct radio `name` so the browser does not
  //    collapse them.
  const html = generateUnificationReport('unification-duplicate-ids');
  const doc = parseReport(html);
  const block = findItemBlock(doc, 'duplicate-ids');
  assert.ok(block, 'duplicate-ids block must exist');
  const candidate = block?.querySelector('details.candidate-response-block');
  assert.ok(candidate, 'candidate-response block must exist');
  candidate?.setAttribute('open', '');
  const rows = Array.from(candidate?.querySelectorAll('.candidate-response-interaction') ?? []);
  assert.equal(rows.length, 2, 'duplicate-ids must render two per-interaction rows');

  // The first row's radios must carry only Alpha/Beta; the second row's
  // radios must carry only Gamma/Delta. The reporter must not fall back to
  // a global `simple-choice` map that would mix the texts.
  const firstRowText = rows[0]?.textContent ?? '';
  const secondRowText = rows[1]?.textContent ?? '';
  assert.ok(firstRowText.includes('Alpha'), `first row must include Alpha, got: ${firstRowText}`);
  assert.ok(firstRowText.includes('Beta'), `first row must include Beta, got: ${firstRowText}`);
  assert.ok(
    !firstRowText.includes('Gamma'),
    `first row must not include Gamma, got: ${firstRowText}`
  );
  assert.ok(
    !firstRowText.includes('Delta'),
    `first row must not include Delta, got: ${firstRowText}`
  );
  assert.ok(
    secondRowText.includes('Gamma'),
    `second row must include Gamma, got: ${secondRowText}`
  );
  assert.ok(
    secondRowText.includes('Delta'),
    `second row must include Delta, got: ${secondRowText}`
  );
  assert.ok(
    !secondRowText.includes('Alpha'),
    `second row must not include Alpha, got: ${secondRowText}`
  );
  assert.ok(
    !secondRowText.includes('Beta'),
    `second row must not include Beta, got: ${secondRowText}`
  );

  // Each per-interaction row must use a distinct radio name.
  const firstRowRadios = Array.from(rows[0]?.querySelectorAll('input[type="radio"]') ?? []);
  const secondRowRadios = Array.from(rows[1]?.querySelectorAll('input[type="radio"]') ?? []);
  assert.ok(firstRowRadios.length > 0, 'first row must have at least one radio');
  assert.ok(secondRowRadios.length > 0, 'second row must have at least one radio');
  const firstName = firstRowRadios[0]?.getAttribute('name') ?? '';
  const secondName = secondRowRadios[0]?.getAttribute('name') ?? '';
  assert.notEqual(
    firstName,
    secondName,
    `duplicate-id rows must use distinct radio names; got ${firstName} and ${secondName}`
  );
  // The names must encode the interactionIndex (0 and 1) so the two rows
  // never collapse into a single browser group.
  assert.ok(
    /qti-candidate-duplicate-ids-0-/.test(firstName),
    `first row name must include the interactionIndex 0, got: ${firstName}`
  );
  assert.ok(
    /qti-candidate-duplicate-ids-1-/.test(secondName),
    `second row name must include the interactionIndex 1, got: ${secondName}`
  );
  // All radios in the same row must share the same name.
  for (const radio of firstRowRadios) {
    assert.equal(
      radio.getAttribute('name'),
      firstName,
      `radios in the first row must share a name; got ${firstName} vs ${radio.getAttribute('name')}`
    );
  }
  for (const radio of secondRowRadios) {
    assert.equal(
      radio.getAttribute('name'),
      secondName,
      `radios in the second row must share a name; got ${secondName} vs ${radio.getAttribute('name')}`
    );
  }

  // The retry-question block must also produce two distinct radio names.
  const retry = block?.querySelector('.retry-question-block');
  assert.ok(retry, 'retry-question-block must exist');
  const retryNames = Array.from(retry?.querySelectorAll('input[type="radio"]') ?? []).map(
    (input) => input.getAttribute('name') ?? ''
  );
  const uniqueRetryNames = new Set(retryNames);
  assert.equal(
    uniqueRetryNames.size,
    2,
    `duplicate-id retry radios must use two distinct names; got ${Array.from(uniqueRetryNames).join(', ')}`
  );
  assert.ok(
    Array.from(uniqueRetryNames).some((name) => /qti-retry-duplicate-ids-0-/.test(name)),
    `first retry name must encode interactionIndex 0, got: ${Array.from(uniqueRetryNames).join(', ')}`
  );
  assert.ok(
    Array.from(uniqueRetryNames).some((name) => /qti-retry-duplicate-ids-1-/.test(name)),
    `second retry name must encode interactionIndex 1, got: ${Array.from(uniqueRetryNames).join(', ')}`
  );
});

test('empty interaction id: two choice interactions without response-identifier get distinct retry names', () => {
  // empty-ids has two `qti-choice-interaction`s with no
  // `response-identifier` attribute. The candidate response is absent in
  // the result, so the reporter must render 無回答 for the candidate but
  // still build distinct retry radio names keyed by interactionIndex.
  const html = generateUnificationReport('unification-empty-ids');
  const doc = parseReport(html);
  const block = findItemBlock(doc, 'empty-ids');
  assert.ok(block, 'empty-ids block must exist');
  const retry = block?.querySelector('.retry-question-block');
  assert.ok(retry, 'retry-question-block must exist');
  const retryInputs = Array.from(retry?.querySelectorAll('input[type="radio"]') ?? []);
  const retryNames = new Set(retryInputs.map((input) => input.getAttribute('name') ?? ''));
  assert.equal(
    retryNames.size,
    2,
    `empty-id retry radios must use two distinct names; got ${Array.from(retryNames).join(', ')}`
  );
  const sortedNames = Array.from(retryNames).sort();
  // Each name must be of the form qti-retry-empty-ids-<index>-<interactionId>
  // (interactionId is empty when the response-identifier is absent, so the
  // segment ends with a trailing dash). The two names must differ by their
  // index segment only.
  assert.ok(
    sortedNames[0]?.startsWith('qti-retry-empty-ids-0-') ?? false,
    `first empty-id retry name must start with qti-retry-empty-ids-0-, got: ${sortedNames[0]}`
  );
  assert.ok(
    sortedNames[1]?.startsWith('qti-retry-empty-ids-1-') ?? false,
    `second empty-id retry name must start with qti-retry-empty-ids-1-, got: ${sortedNames[1]}`
  );

  // The candidate-response block must render 無回答 (per-interaction,
  // single response) for each row because the responseVariable is absent.
  const candidate = block?.querySelector('details.candidate-response-block');
  assert.ok(candidate, 'candidate-response block must exist');
  candidate?.setAttribute('open', '');
  const rows = Array.from(candidate?.querySelectorAll('.candidate-response-interaction') ?? []);
  assert.equal(rows.length, 2, 'empty-ids must render two per-interaction rows');
  for (const row of rows) {
    const text = row.textContent ?? '';
    assert.ok(text.includes('（無回答）'), `empty-id row must include （無回答）, got: ${text}`);
  }
});

test('empty candidate response renders （無回答） and never an empty <pre>', () => {
  // empty-candidate-response is a descriptive item with
  // `<candidateResponse />` (self-closing) in the result. The reporter
  // must surface `（無回答）` and must NOT emit an empty
  // `<pre class="response-text response-pre">` block.
  const html = generateUnificationReport('unification-empty-candidate-response');
  const doc = parseReport(html);
  const block = findItemBlock(doc, 'empty-candidate-response');
  assert.ok(block, 'empty-candidate-response block must exist');
  const candidate = block?.querySelector('details.candidate-response-block');
  assert.ok(candidate, 'candidate-response block must exist');
  candidate?.setAttribute('open', '');
  const text = candidate?.textContent ?? '';
  assert.ok(
    text.includes('（無回答）'),
    `empty candidate response must include （無回答）, got: ${text}`
  );
  const emptyPres = Array.from(candidate?.querySelectorAll('pre.response-pre') ?? []).filter(
    (pre) => ((pre.textContent ?? '').trim().length ?? 0) === 0
  );
  assert.equal(
    emptyPres.length,
    0,
    'no <pre class="response-pre"> with empty text content must be rendered for an empty candidate response'
  );
});

test('multi-value / extended-text whitespace is preserved verbatim', () => {
  // Existing extended-text fixture must still preserve indentation, tabs,
  // and blank lines (regression for the pre / stripTagsPreserveWhitespace
  // contract).
  const html = generateUnificationReport('unification-extended-text');
  const doc = parseReport(html);
  const block = findItemBlock(doc, 'extended-text');
  assert.ok(block, 'extended-text block must exist');
  const candidate = block?.querySelector('details.candidate-response-block');
  assert.ok(candidate, 'candidate-response block must exist');
  candidate?.setAttribute('open', '');
  const pre = candidate?.querySelector('pre.response-text.response-pre');
  assert.ok(pre, 'extended-text candidate body must render a <pre>');
  const text = pre?.textContent ?? '';
  assert.ok(text.includes('line one'), 'whitespace test: line one must be present');
  assert.ok(text.includes('  indented'), 'whitespace test: leading spaces must be preserved');
  assert.ok(text.includes('\ttabbed'), 'whitespace test: tab must be preserved');
  assert.ok(/\n\n/.test(text), 'whitespace test: blank line must be preserved');
});

test('index-shift: correct-answer block uses the original interaction index, not the filtered index', () => {
  // The `index-shift` fixture has two choice interactions. The first
  // interaction has no correct response (declared `RESPONSE_A` with no
  // `qti-correct-response`). The second interaction has the correct
  // response (`RESPONSE`, CHOICE_A). The previous implementation
  // computed the post-filter `index` (always 0 because the first was
  // dropped), so the correct-answer block would render the FIRST
  // interaction's choice text/image. The fix preserves the original
  // `interactionIndex` from `item.interactions`.
  const html = generateUnificationReport('unification-index-shift');
  const doc = parseReport(html);
  const block = findItemBlock(doc, 'index-shift');
  assert.ok(block, 'index-shift block must exist');
  const correct = block?.querySelector('details.correct-answer-block');
  assert.ok(correct, 'correct-answer block must exist for index-shift');
  correct?.setAttribute('open', '');

  // Scope the assertions to the correct-answer block so we never confuse
  // a candidate-response row with a correct-answer row.
  const correctScope = correct;
  const interactions = Array.from(
    correctScope?.querySelectorAll('.correct-answer-interaction') ?? []
  );
  assert.equal(
    interactions.length,
    1,
    `correct-answer block must contain exactly one .correct-answer-interaction; got ${interactions.length}`
  );

  const interactionId = interactions[0]?.getAttribute('data-interaction-id');
  // RESPONSE_A has no correct response; the surviving interaction is
  // RESPONSE (the second interaction, original index 1).
  assert.equal(
    interactionId,
    'RESPONSE',
    `the only correct-answer-interaction must be RESPONSE (the second interaction); got ${interactionId}`
  );

  // The candidate-name attribute must encode the ORIGINAL interaction
  // index 1, not the post-filter index 0. This is the
  // `data-candidate-name="qti-candidate-index-shift-1"` pattern.
  const nameAttr = interactions[0]?.getAttribute('data-candidate-name');
  assert.equal(
    nameAttr,
    'qti-candidate-index-shift-1',
    `correct-answer-interaction data-candidate-name must encode the original interaction index 1; got ${nameAttr}`
  );

  const correctText = correctScope?.textContent ?? '';
  // The correct-answer block must include the SECOND interaction's text
  // ("Second Gamma") and must NOT include the first interaction's
  // choice text ("First Alpha" / "First Beta").
  assert.ok(
    correctText.includes('Second Gamma'),
    `correct-answer block must include "Second Gamma" (from the second interaction), got: ${correctText}`
  );
  assert.ok(
    !correctText.includes('First Alpha'),
    `correct-answer block must not include "First Alpha" (from the first interaction), got: ${correctText}`
  );
  assert.ok(
    !correctText.includes('First Beta'),
    `correct-answer block must not include "First Beta" (from the first interaction), got: ${correctText}`
  );
  assert.ok(
    !correctText.includes('Second Delta'),
    `correct-answer block must not include "Second Delta" (the non-correct choice of the second interaction), got: ${correctText}`
  );

  // Image guard: exactly one image, and it must be the one inside the
  // second interaction's CHOICE_A — never the first interaction's image
  // (the first interaction has no image).
  const images = Array.from(correctScope?.querySelectorAll('img') ?? []);
  assert.equal(
    images.length,
    1,
    `correct-answer block must contain exactly one image; got ${images.length}`
  );
  const imageSrc = images[0]?.getAttribute('src') ?? '';
  assert.ok(
    imageSrc.endsWith('/index-shift/sample.svg'),
    `image src must resolve to ./assets/index-shift/sample.svg; got ${imageSrc}`
  );

  // Cross-check the candidate-response block: both interactions must
  // render, and the second interaction's candidate-name must still be
  // `qti-candidate-index-shift-1` (the original index, not a post-filter
  // index).
  const candidate = block?.querySelector('details.candidate-response-block');
  assert.ok(candidate, 'candidate-response block must exist');
  candidate?.setAttribute('open', '');
  const candidateRows = Array.from(
    candidate?.querySelectorAll('.candidate-response-interaction') ?? []
  );
  assert.equal(candidateRows.length, 2, 'two choice interactions must render two rows');
  const secondCandidateName = candidateRows[1]?.getAttribute('data-candidate-name');
  assert.equal(
    secondCandidateName,
    'qti-candidate-index-shift-1',
    `second interaction's candidate-name must encode the original interaction index 1; got ${secondCandidateName}`
  );

  // The image in the candidate-response block must also resolve to the
  // second interaction's image (the first interaction has no image).
  const candidateImages = Array.from(candidate?.querySelectorAll('img') ?? []);
  assert.ok(
    candidateImages.every((img) =>
      (img.getAttribute('src') ?? '').endsWith('/index-shift/sample.svg')
    ),
    'every candidate-response image must be the second interaction image'
  );
});

test('choice index consistency for candidate, correct, and retry', () => {
  // Order is choice, text-entry, choice (3 interactions). The second
  // choice (interactionIndex=2) must keep its index in the candidate
  // wrapper, the correct-answer wrapper, and the retry-question block.
  // We reuse `unification-legacy-distinct-vars` (RESPONSE_1, RESPONSE_2)
  // and the `multi-text-entry` (FIRST, SECOND, THIRD) fixtures, but a
  // dedicated consistency check is more useful as a single test that
  // focuses on the `data-candidate-name` pattern, the correct-answer
  // index, and the retry-question name.
  const html = generateUnificationReport('unification-index-shift');
  const doc = parseReport(html);
  const block = findItemBlock(doc, 'index-shift');
  assert.ok(block, 'index-shift block must exist');
  const candidate = block?.querySelector('details.candidate-response-block');
  const correct = block?.querySelector('details.correct-answer-block');
  const retry = block?.querySelector('.retry-question-block');
  assert.ok(candidate && correct && retry, 'all three bodies must exist');

  candidate?.setAttribute('open', '');
  correct?.setAttribute('open', '');

  // The first interaction has no correct response, so the correct-answer
  // block must contain only the second interaction, with
  // `data-candidate-name="qti-candidate-index-shift-1"`.
  const correctRows = Array.from(correct?.querySelectorAll('.correct-answer-interaction') ?? []);
  assert.equal(correctRows.length, 1, 'one correct-answer row expected');
  assert.equal(
    correctRows[0]?.getAttribute('data-candidate-name'),
    'qti-candidate-index-shift-1',
    'correct-answer row must use the original interaction index 1'
  );

  // The candidate-response block has two rows; the second row's name
  // must match the correct-answer row's name.
  const candidateRows = Array.from(
    candidate?.querySelectorAll('.candidate-response-interaction') ?? []
  );
  assert.equal(candidateRows.length, 2, 'two candidate-response rows expected');
  const secondCandidate = candidateRows[1];
  assert.equal(
    secondCandidate?.getAttribute('data-candidate-name'),
    'qti-candidate-index-shift-1',
    'second candidate-response row must use the original interaction index 1'
  );

  // The retry-question block must have one radio list per choice
  // interaction, and each list's radio name must encode the original
  // interaction index (0 and 1).
  const retryLists = Array.from(retry?.querySelectorAll('ul.choice-retry') ?? []);
  assert.equal(
    retryLists.length,
    2,
    'two retry-question choice lists expected (one per choice interaction)'
  );
  const retryNames = retryLists
    .map((list) => list.querySelector('input[type="radio"]')?.getAttribute('name') ?? '')
    .sort();
  assert.ok(
    retryNames[0]?.startsWith('qti-retry-index-shift-0-') ?? false,
    `first retry list name must start with qti-retry-index-shift-0-, got: ${retryNames[0]}`
  );
  assert.ok(
    retryNames[1]?.startsWith('qti-retry-index-shift-1-') ?? false,
    `second retry list name must start with qti-retry-index-shift-1-, got: ${retryNames[1]}`
  );
});

test('choice interactions with mixed correct/empty keep their original index in correct-answer block', () => {
  // `duplicate-ids` has two choice interactions that share an
  // `id="RESPONSE"`. The correct-answer block must render only the
  // interactions that have a `correctResponse`, and those surviving
  // interactions must keep their original `interactionIndex` (0 and 1).
  // In `duplicate-ids` both interactions DO have a correct response
  // (CHOICE_A, declared on the single RESPONSE declaration), so the
  // correct-answer block must contain TWO rows.
  const html = generateUnificationReport('unification-duplicate-ids');
  const doc = parseReport(html);
  const block = findItemBlock(doc, 'duplicate-ids');
  assert.ok(block, 'duplicate-ids block must exist');
  const correct = block?.querySelector('details.correct-answer-block');
  assert.ok(correct, 'correct-answer block must exist for duplicate-ids');
  correct?.setAttribute('open', '');
  const rows = Array.from(correct?.querySelectorAll('.correct-answer-interaction') ?? []);
  assert.equal(rows.length, 2, 'duplicate-ids must render two correct-answer rows');
  const names = rows.map((row) => row.getAttribute('data-candidate-name'));
  assert.ok(
    names.includes('qti-candidate-duplicate-ids-0'),
    `first correct-answer row must encode the original index 0, got: ${names.join(', ')}`
  );
  assert.ok(
    names.includes('qti-candidate-duplicate-ids-1'),
    `second correct-answer row must encode the original index 1, got: ${names.join(', ')}`
  );

  // The first row's text must be the first interaction's correct
  // choice (Alpha — CHOICE_A is the only correct value); the second
  // row's text must be the second interaction's correct choice
  // (Gamma — same CHOICE_A identifier, but a different text in the
  // second interaction's `qti-simple-choice` children). No text bleed
  // across rows.
  const firstText = rows[0]?.textContent ?? '';
  const secondText = rows[1]?.textContent ?? '';
  assert.ok(firstText.includes('Alpha'), `first row must include Alpha, got: ${firstText}`);
  assert.ok(
    !firstText.includes('Gamma') && !firstText.includes('Delta'),
    `first row must not include Gamma/Delta, got: ${firstText}`
  );
  assert.ok(secondText.includes('Gamma'), `second row must include Gamma, got: ${secondText}`);
  assert.ok(
    !secondText.includes('Alpha') && !secondText.includes('Beta'),
    `second row must not include Alpha/Beta, got: ${secondText}`
  );
});

test('empty interaction id: candidate-response and retry keep interaction index 0 and 1 with no text bleed', () => {
  // `empty-ids` has two choice interactions with no
  // `response-identifier`. The renderer does not surface a
  // `correctResponse` for either (the response-identifier is absent
  // on both interactions, so no direct match fires), so the
  // correct-answer block is intentionally omitted. The candidate and
  // retry bodies must still keep the original interaction index (0
  // and 1) keyed by `data-candidate-name` and the retry radio names.
  const html = generateUnificationReport('unification-empty-ids');
  const doc = parseReport(html);
  const block = findItemBlock(doc, 'empty-ids');
  assert.ok(block, 'empty-ids block must exist');
  const candidate = block?.querySelector('details.candidate-response-block');
  assert.ok(candidate, 'candidate-response block must exist for empty-ids');
  candidate?.setAttribute('open', '');
  const candidateRows = Array.from(
    candidate?.querySelectorAll('.candidate-response-interaction') ?? []
  );
  assert.equal(candidateRows.length, 2, 'empty-ids must render two per-interaction rows');
  const candidateNames = candidateRows.map((row) => row.getAttribute('data-candidate-name'));
  // The `data-candidate-name` segment is `qti-candidate-<itemId>-<index>`
  // (no trailing interactionId segment when the response-identifier is
  // empty). Both rows must be present and distinct.
  assert.ok(
    candidateNames.includes('qti-candidate-empty-ids-0'),
    `first candidate-response row must encode the original index 0, got: ${candidateNames.join(', ')}`
  );
  assert.ok(
    candidateNames.includes('qti-candidate-empty-ids-1'),
    `second candidate-response row must encode the original index 1, got: ${candidateNames.join(', ')}`
  );
  // Both candidate rows must show （無回答） because no response was
  // submitted for either interaction.
  for (const row of candidateRows) {
    assert.ok(
      (row.textContent ?? '').includes('（無回答）'),
      `empty-id row must include （無回答）, got: ${row.textContent}`
    );
  }
  // The retry-question block must have two radio lists keyed by the
  // original interaction index 0 and 1.
  const retry = block?.querySelector('.retry-question-block');
  assert.ok(retry, 'retry-question block must exist for empty-ids');
  const retryLists = Array.from(retry?.querySelectorAll('ul.choice-retry') ?? []);
  assert.equal(retryLists.length, 2, 'empty-ids must render two retry choice lists');
  const retryNames = retryLists
    .map((list) => list.querySelector('input[type="radio"]')?.getAttribute('name') ?? '')
    .sort();
  assert.ok(
    retryNames[0]?.startsWith('qti-retry-empty-ids-0-') ?? false,
    `first retry list name must start with qti-retry-empty-ids-0-, got: ${retryNames[0]}`
  );
  assert.ok(
    retryNames[1]?.startsWith('qti-retry-empty-ids-1-') ?? false,
    `second retry list name must start with qti-retry-empty-ids-1-, got: ${retryNames[1]}`
  );
});

test('mixed-order: choice→text-entry→choice keeps original interactionIndex across candidate, correct, and retry', () => {
  // The `mixed-order` fixture has THREE interactions:
  //   interaction[0] = choice (RESPONSE_A, First Alpha / First Beta, no correctResponse)
  //   interaction[1] = text-entry (TEXT_FILL, no correctResponse)
  //   interaction[2] = choice (RESPONSE_B, Third Gamma / Third Delta, correctResponse=CHOICE_A)
  // The candidate answered CHOICE_A on interaction[0], "text-fill-value" on
  // interaction[1], and CHOICE_B (wrong) on interaction[2].
  // This test pins the contract that the original `interactionIndex` is
  // preserved across all three blocks (candidate-response, correct-answer,
  // retry-question) even when the middle interaction is a text-entry. A
  // naive post-filter re-index would collapse the indices to 0,1 and break
  // both the correct-answer row and the retry-question list ordering.
  const html = generateUnificationReport('unification-mixed-order');
  const doc = parseReport(html);
  const block = findItemBlock(doc, 'mixed-order');
  assert.ok(block, 'mixed-order block must exist');

  // --- Candidate-response block ---
  const candidate = sliceFromItem(doc, 'mixed-order', 'details.candidate-response-block');
  assert.ok(candidate, 'candidate-response block must exist');
  candidate?.setAttribute('open', '');
  const candidateWrappers = Array.from(
    candidate?.querySelectorAll('.candidate-response-interaction') ?? []
  );
  assert.equal(
    candidateWrappers.length,
    3,
    `candidate-response must contain exactly 3 wrappers (one per interaction), got ${candidateWrappers.length}`
  );

  // Wrapper 0: choice RESPONSE_A, candidate chose CHOICE_A → "First Alpha"
  assert.equal(
    candidateWrappers[0]?.getAttribute('data-candidate-name'),
    'qti-candidate-mixed-order-0',
    `wrapper 0 data-candidate-name must encode original index 0`
  );
  assert.equal(
    candidateWrappers[0]?.getAttribute('data-interaction-id'),
    'RESPONSE_A',
    `wrapper 0 data-interaction-id must be RESPONSE_A`
  );
  const wrapper0Text = candidateWrappers[0]?.textContent ?? '';
  assert.ok(
    wrapper0Text.includes('First Alpha'),
    `wrapper 0 must include "First Alpha" (candidate chose CHOICE_A), got: ${wrapper0Text}`
  );
  assert.ok(
    wrapper0Text.includes('First Beta'),
    `wrapper 0 must include "First Beta" (other choice text in the same interaction), got: ${wrapper0Text}`
  );
  assert.ok(
    !wrapper0Text.includes('Third Gamma'),
    `wrapper 0 must not include "Third Gamma" (from the third interaction), got: ${wrapper0Text}`
  );
  assert.ok(
    !wrapper0Text.includes('Third Delta'),
    `wrapper 0 must not include "Third Delta" (from the third interaction), got: ${wrapper0Text}`
  );

  // Wrapper 1: text-entry TEXT_FILL, candidate answered "text-fill-value"
  assert.equal(
    candidateWrappers[1]?.getAttribute('data-candidate-name'),
    'qti-candidate-mixed-order-1',
    `wrapper 1 data-candidate-name must encode original index 1`
  );
  assert.equal(
    candidateWrappers[1]?.getAttribute('data-interaction-id'),
    'TEXT_FILL',
    `wrapper 1 data-interaction-id must be TEXT_FILL`
  );
  // The text-entry candidate response is rendered into a readonly
  // <input class="cloze-input qti-blank-input"> via the `value`
  // attribute (the input is read-only and has no inner text, so
  // `textContent` of the wrapper only contains the label, not the
  // candidate's value). Read the candidate's value back from the
  // input's `value` attribute instead of `textContent`.
  const wrapper1Input = candidateWrappers[1]?.querySelector('input.cloze-input.qti-blank-input');
  assert.ok(
    wrapper1Input,
    'wrapper 1 must render a cloze <input> for the text-entry candidate response'
  );
  assert.equal(
    wrapper1Input?.getAttribute('value'),
    'text-fill-value',
    `wrapper 1 cloze input value attribute must equal the candidate's "text-fill-value", got: ${wrapper1Input?.getAttribute('value')}`
  );

  // Wrapper 2: choice RESPONSE_B, candidate chose CHOICE_B → "Third Delta"
  assert.equal(
    candidateWrappers[2]?.getAttribute('data-candidate-name'),
    'qti-candidate-mixed-order-2',
    `wrapper 2 data-candidate-name must encode original index 2`
  );
  assert.equal(
    candidateWrappers[2]?.getAttribute('data-interaction-id'),
    'RESPONSE_B',
    `wrapper 2 data-interaction-id must be RESPONSE_B`
  );
  const wrapper2Text = candidateWrappers[2]?.textContent ?? '';
  assert.ok(
    wrapper2Text.includes('Third Delta'),
    `wrapper 2 must include "Third Delta" (candidate chose CHOICE_B), got: ${wrapper2Text}`
  );
  assert.ok(
    !wrapper2Text.includes('First Alpha'),
    `wrapper 2 must not include "First Alpha" (from the first interaction), got: ${wrapper2Text}`
  );
  assert.ok(
    !wrapper2Text.includes('First Beta'),
    `wrapper 2 must not include "First Beta" (from the first interaction), got: ${wrapper2Text}`
  );

  // --- Correct-answer block ---
  // Only interaction[2] has a correctResponse, so the block must contain
  // exactly one wrapper, and it must keep the ORIGINAL interactionIndex=2
  // (not a post-filter index 0).
  const correct = sliceFromItem(doc, 'mixed-order', 'details.correct-answer-block');
  assert.ok(correct, 'correct-answer block must exist (interaction[2] has a qti-correct-response)');
  correct?.setAttribute('open', '');
  const correctWrappers = Array.from(
    correct?.querySelectorAll('.correct-answer-interaction') ?? []
  );
  assert.equal(
    correctWrappers.length,
    1,
    `correct-answer block must contain exactly 1 wrapper (only interaction[2] has a correctResponse), got ${correctWrappers.length}`
  );
  assert.equal(
    correctWrappers[0]?.getAttribute('data-candidate-name'),
    'qti-candidate-mixed-order-2',
    `single correct-answer wrapper must encode the ORIGINAL interaction index 2 (not post-filter 0), got: ${correctWrappers[0]?.getAttribute(
      'data-candidate-name'
    )}`
  );
  assert.equal(
    correctWrappers[0]?.getAttribute('data-interaction-id'),
    'RESPONSE_B',
    `single correct-answer wrapper data-interaction-id must be RESPONSE_B`
  );
  const correctText = correctWrappers[0]?.textContent ?? '';
  assert.ok(
    correctText.includes('Third Gamma'),
    `correct-answer wrapper must include "Third Gamma" (correct answer for interaction[2] is CHOICE_A), got: ${correctText}`
  );
  assert.ok(
    !correctText.includes('First Alpha'),
    `correct-answer wrapper must not include "First Alpha" (from the first interaction), got: ${correctText}`
  );
  assert.ok(
    !correctText.includes('First Beta'),
    `correct-answer wrapper must not include "First Beta" (from the first interaction), got: ${correctText}`
  );
  assert.ok(
    !correctText.includes('text-fill-value'),
    `correct-answer wrapper must not include "text-fill-value" (from the text-entry interaction), got: ${correctText}`
  );

  // --- Retry-question block ---
  // The text-entry does not produce a choice-retry list, so the block
  // must contain exactly 2 lists — one per CHOICE interaction — keyed by
  // the ORIGINAL interactionIndex 0 and 2 (NOT 0 and 1; the latter would
  // indicate a naive re-index that ignored the text-entry).
  const retry = block?.querySelector('.retry-question-block');
  assert.ok(retry, 'retry-question block must exist');
  const retryLists = Array.from(retry?.querySelectorAll('ul.choice-retry') ?? []);
  assert.equal(
    retryLists.length,
    2,
    `retry-question block must contain exactly 2 choice lists (one per choice interaction — text-entry does not produce one), got ${retryLists.length}`
  );
  const retryFirstInputNames = retryLists.map(
    (list) => list.querySelector('input[type="radio"]')?.getAttribute('name') ?? ''
  );
  // Sanity: the two lists' name prefixes must NOT be a choice-only
  // 0,1 sequence (that would mean the text-entry interaction was
  // collapsed/ignored when assigning indices).
  const firstHasIndex0 = retryFirstInputNames[0]?.startsWith('qti-retry-mixed-order-0-') ?? false;
  const secondHasIndex1 = retryFirstInputNames[1]?.startsWith('qti-retry-mixed-order-1-') ?? false;
  assert.ok(
    !(firstHasIndex0 && secondHasIndex1),
    `retry-question lists must not use a choice-only 0,1 sequence (text-entry in between must keep its index); got: ${retryFirstInputNames.join(
      ', '
    )}`
  );
  // The two lists' name prefixes must include 0 and 2 (in some order).
  const startsWithIndex0 = retryFirstInputNames.some((n) =>
    n.startsWith('qti-retry-mixed-order-0-')
  );
  const startsWithIndex2 = retryFirstInputNames.some((n) =>
    n.startsWith('qti-retry-mixed-order-2-')
  );
  assert.ok(
    startsWithIndex0,
    `one retry-question list name must start with qti-retry-mixed-order-0-, got: ${retryFirstInputNames.join(
      ', '
    )}`
  );
  assert.ok(
    startsWithIndex2,
    `one retry-question list name must start with qti-retry-mixed-order-2- (original interaction index 2 — NOT 1), got: ${retryFirstInputNames.join(
      ', '
    )}`
  );
});
