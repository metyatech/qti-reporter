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
