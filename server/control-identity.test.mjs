/* ============================================================
   Unit tests for the shared control-identity rule used by both
   runSemanticExplorer (discovery) and the coverage instrumentation
   (touch recording) — they must resolve the same element to the
   same identity, or coverage edges can never join to discovered
   controls. Plain mock objects stand in for DOM elements; no
   browser/Playwright needed.
   ============================================================ */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { identifyControl, controlKey } from './control-identity.mjs';

function mockEl({ tag, attrs = {}, type, id = '', textContent = '', labels }) {
  return {
    tagName: tag,
    id,
    type,
    textContent,
    labels,
    getAttribute: (name) => (name in attrs ? attrs[name] : null),
  };
}

test('identifyControl: null element -> null', () => {
  assert.equal(identifyControl(null), null);
});

test('identifyControl: a button with an id uses the id, role defaults to "button"', () => {
  const el = mockEl({ tag: 'BUTTON', id: 'compareBtn', textContent: 'Compare' });
  assert.deepEqual(identifyControl(el), { role: 'button', id: 'compareBtn', label: 'Compare', tag: 'button' });
});

test('identifyControl: an explicit role attribute wins over the tag default (e.g. a tab button)', () => {
  const el = mockEl({ tag: 'BUTTON', attrs: { role: 'tab' }, textContent: 'Side‑by‑side' });
  const id = identifyControl(el);
  assert.equal(id.role, 'tab');
  assert.equal(id.id, null);
});

test('identifyControl: textarea -> role "textbox"', () => {
  const el = mockEl({ tag: 'TEXTAREA', id: 'inputA' });
  assert.equal(identifyControl(el).role, 'textbox');
});

test('identifyControl: checkbox input -> role "checkbox"', () => {
  const el = mockEl({ tag: 'INPUT', type: 'checkbox', id: 'optLower' });
  assert.equal(identifyControl(el).role, 'checkbox');
});

test('identifyControl: link -> role "link"', () => {
  const el = mockEl({ tag: 'A', id: 'docsLink' });
  assert.equal(identifyControl(el).role, 'link');
});

test('identifyControl: no id falls back to aria-label, then textContent, then a labelled input\'s <label>', () => {
  const byAriaLabel = mockEl({ tag: 'BUTTON', attrs: { 'aria-label': 'Toggle theme' } });
  assert.equal(identifyControl(byAriaLabel).label, 'Toggle theme');

  const byTextContent = mockEl({ tag: 'BUTTON', textContent: '  Reset  ' });
  assert.equal(identifyControl(byTextContent).label, 'Reset');

  const byInputLabel = mockEl({ tag: 'INPUT', type: 'checkbox', labels: [{ textContent: 'Ignore case' }] });
  assert.equal(identifyControl(byInputLabel).label, 'Ignore case');
});

test('identifyControl: label is truncated to 60 characters', () => {
  const el = mockEl({ tag: 'BUTTON', textContent: 'x'.repeat(120) });
  assert.equal(identifyControl(el).label.length, 60);
});

test('controlKey: id-bearing controls key on their id', () => {
  assert.equal(controlKey({ id: 'compareBtn', role: 'button', label: 'Compare', tag: 'button' }), 'id:compareBtn');
});

test('controlKey: id-less controls key on role|label|tag, matching a fresh identifyControl() call for the same element', () => {
  const el = mockEl({ tag: 'BUTTON', attrs: { role: 'tab' }, textContent: 'Inline' });
  const discovered = identifyControl(el);
  const touchedAgain = identifyControl(el);
  assert.equal(controlKey(discovered), controlKey(touchedAgain));
  assert.equal(controlKey(discovered), 'tab|Inline|button');
});

test('controlKey: null -> null', () => {
  assert.equal(controlKey(null), null);
});
