/* ============================================================
   Control identity — the single rule for naming a real DOM
   control, shared by:
     - runSemanticExplorer (server/agents.mjs), which discovers
       every control on the page, and
     - the coverage instrumentation (server/engine.mjs), which
       records which controls an agent actually touched.
   Both sides must resolve the SAME element to the SAME identity
   so touches can be joined against discovered controls even when
   the element has no id (e.g. the render-mode tab buttons).
   ============================================================ */

/* Runs INSIDE the browser via page.evaluate — must stay fully
   self-contained (no closures over outer-scope references). */
export function identifyControl(el) {
  if (!el) return null;
  const tag = el.tagName.toLowerCase();
  const role = el.getAttribute('role')
    || (tag === 'textarea' ? 'textbox'
    : (tag === 'input' && el.type === 'checkbox') ? 'checkbox'
    : tag === 'a' ? 'link' : 'button');
  const id = el.id || null;
  const label = (el.getAttribute('aria-label') || el.textContent || el.labels?.[0]?.textContent || '').trim().slice(0, 60);
  return { role, id, label, tag };
}

/* Node-side: a stable join key for a control identity. id wins when
   present (unambiguous); otherwise role+label+tag, matching what
   identifyControl() would produce for the same element again. */
export function controlKey(c) {
  if (!c) return null;
  return c.id ? `id:${c.id}` : `${c.role}|${c.label}|${c.tag}`;
}
