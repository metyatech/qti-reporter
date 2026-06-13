import test from 'node:test';
import assert from 'node:assert/strict';

import type { InteractionInfo } from '../qti/assessmentItem.js';
import type { ParsedItemResponse } from '../qti/assessmentResult.js';
import { resolveSubmittedValues, responseDedupeKey } from '../report/interactionResponses.js';

function makeInteraction(overrides: Partial<InteractionInfo>): InteractionInfo {
  return {
    id: '',
    type: 'choice',
    declarationIdentifier: null,
    declarationValueIndex: null,
    cardinality: 'single',
    baseType: 'identifier',
    correctResponse: [],
    choices: [],
    maxChoices: null,
    ...overrides,
  };
}

test('legacy ordered: id match wins and returns the full values array', () => {
  const responses: ParsedItemResponse[] = [
    { responseIdentifier: 'RESPONSE_1', values: ['alpha', 'beta'] },
    { responseIdentifier: 'OTHER', values: ['gamma'] },
  ];
  const interaction = makeInteraction({
    id: 'OTHER',
    declarationIdentifier: 'RESPONSE_1',
    declarationValueIndex: 0,
  });
  const result = resolveSubmittedValues(responses, interaction);
  assert.deepEqual(result, ['gamma']);
});

test('legacy ordered: declaration match returns exactly one value at the index', () => {
  const responses: ParsedItemResponse[] = [
    { responseIdentifier: 'RESPONSE', values: ['alpha', 'beta', 'gamma'] },
  ];
  const interaction = makeInteraction({
    id: 'RESPONSE_2',
    declarationIdentifier: 'RESPONSE',
    declarationValueIndex: 1,
  });
  const result = resolveSubmittedValues(responses, interaction);
  assert.deepEqual(result, ['beta']);
});

test('legacy ordered: out-of-range index returns []', () => {
  const responses: ParsedItemResponse[] = [{ responseIdentifier: 'RESPONSE', values: ['alpha'] }];
  const interaction = makeInteraction({
    id: 'RESPONSE_99',
    declarationIdentifier: 'RESPONSE',
    declarationValueIndex: 5,
  });
  const result = resolveSubmittedValues(responses, interaction);
  assert.deepEqual(result, []);
});

test('direct match: declaration match returns the full values array', () => {
  const responses: ParsedItemResponse[] = [
    { responseIdentifier: 'RESPONSE', values: ['alpha', 'beta'] },
  ];
  const interaction = makeInteraction({
    id: 'OTHER',
    declarationIdentifier: 'RESPONSE',
    declarationValueIndex: null,
  });
  const result = resolveSubmittedValues(responses, interaction);
  assert.deepEqual(result, ['alpha', 'beta']);
});

test('direct match: id match is used when declaration is absent', () => {
  const responses: ParsedItemResponse[] = [{ responseIdentifier: 'RESPONSE', values: ['alpha'] }];
  const interaction = makeInteraction({
    id: 'RESPONSE',
    declarationIdentifier: null,
    declarationValueIndex: null,
  });
  const result = resolveSubmittedValues(responses, interaction);
  assert.deepEqual(result, ['alpha']);
});

test('direct match: declaration match wins over id match when both exist', () => {
  const responses: ParsedItemResponse[] = [
    { responseIdentifier: 'OTHER', values: ['id-value'] },
    { responseIdentifier: 'DECLARED', values: ['declaration-value-a', 'declaration-value-b'] },
  ];
  const interaction = makeInteraction({
    id: 'OTHER',
    declarationIdentifier: 'DECLARED',
    declarationValueIndex: null,
  });
  const result = resolveSubmittedValues(responses, interaction);
  assert.deepEqual(result, ['declaration-value-a', 'declaration-value-b']);
});

test('resolveSubmittedValues does not mutate the input values array', () => {
  const values = ['alpha', 'beta'];
  const responses: ParsedItemResponse[] = [{ responseIdentifier: 'RESPONSE', values }];
  const interaction = makeInteraction({
    id: 'RESPONSE',
    declarationIdentifier: null,
    declarationValueIndex: null,
  });
  const result = resolveSubmittedValues(responses, interaction);
  assert.deepEqual(result, ['alpha', 'beta']);
  assert.deepEqual(values, ['alpha', 'beta'], 'input values array must be unchanged');
  // Mutate the returned array — the input must remain untouched.
  result.push('gamma');
  assert.deepEqual(values, ['alpha', 'beta']);
  assert.deepEqual(responses[0]?.values, ['alpha', 'beta']);
});

test('responseDedupeKey: legacy ordered uses declaration|index|id form', () => {
  const interaction = makeInteraction({
    id: 'RESPONSE_1',
    declarationIdentifier: 'RESPONSE',
    declarationValueIndex: 0,
  });
  assert.equal(responseDedupeKey(interaction), 'RESPONSE|0|RESPONSE_1');
});

test('responseDedupeKey: direct match uses declarationIdentifier', () => {
  const interaction = makeInteraction({
    id: 'OTHER',
    declarationIdentifier: 'RESPONSE',
    declarationValueIndex: null,
  });
  assert.equal(responseDedupeKey(interaction), 'RESPONSE');
});

test('responseDedupeKey: unmatched interaction falls back to id', () => {
  const interaction = makeInteraction({
    id: 'loose-id',
    declarationIdentifier: null,
    declarationValueIndex: null,
  });
  assert.equal(responseDedupeKey(interaction), 'loose-id');
});

test('responseDedupeKey: unmatched interaction with no id returns empty string', () => {
  const interaction = makeInteraction({
    id: '',
    declarationIdentifier: null,
    declarationValueIndex: null,
  });
  assert.equal(responseDedupeKey(interaction), '');
});

test('interaction id collides with choice identifier: binding uses the responseVariable identifier, not the choice identifier', () => {
  // When the interaction `id` is the same string as a choice identifier
  // (e.g. interaction id `CHOICE_A` and a `<qti-simple-choice
  // identifier="CHOICE_A">` inside the same interaction), the binding
  // layer must still resolve by the responseVariable identifier. The
  // resolver sees `interaction.id === "CHOICE_A"`; a
  // `responseVariable identifier="CHOICE_A"` is not the same as a
  // choice identifier, so the resolver returns its `values`. The
  // `interactionIndex` (not the choice identifier or its position) is
  // the reporter's scope key for siblings.
  const responses: ParsedItemResponse[] = [
    { responseIdentifier: 'CHOICE_A', values: ['alpha', 'beta'] },
  ];
  const interaction = makeInteraction({
    id: 'CHOICE_A',
    declarationIdentifier: null,
    declarationValueIndex: null,
  });
  // Direct-match: declaration is null, so the id fallback wins.
  const result = resolveSubmittedValues(responses, interaction);
  assert.deepEqual(
    result,
    ['alpha', 'beta'],
    'resolver must use the responseVariable identifier `CHOICE_A` (not the choice identifier)'
  );
});

test('interaction id collides with choice identifier: direct match uses the id for the responseVariable lookup', () => {
  // Symmetric case: the responseVariable identifier happens to be the
  // same string as the interaction's own `id` and one of its choice
  // identifiers. The binding layer still works because it only ever
  // consults `responseVariable.responseIdentifier`, never the choice
  // identifier.
  const responses: ParsedItemResponse[] = [{ responseIdentifier: 'CHOICE_A', values: ['gamma'] }];
  const interaction = makeInteraction({
    id: 'CHOICE_A',
    declarationIdentifier: 'DECLARED',
    declarationValueIndex: null,
  });
  // declaration `DECLARED` is absent, so the id fallback must return
  // the responseVariable for `CHOICE_A`.
  const result = resolveSubmittedValues(responses, interaction);
  assert.deepEqual(
    result,
    ['gamma'],
    'resolver must return the responseVariable whose identifier matches interaction.id (not the choice identifier)'
  );
});
