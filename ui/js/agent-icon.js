/* The AI agent glyph shared by map badges, the header button and the
   chat pop-up: an agent "head" with a spark antenna. Drawn in
   currentColor so each host sets its own color. */

export function agentIconSvg(cls = 'agent-icon') {
  return `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d="M12 1.6l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z" fill="currentColor"/>
    <path d="M12 7.2v1.6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
    <rect x="4.2" y="8.8" width="15.6" height="11.4" rx="4.2" fill="none" stroke="currentColor" stroke-width="1.7"/>
    <circle cx="9.3" cy="14.3" r="1.55" fill="currentColor"/>
    <circle cx="14.7" cy="14.3" r="1.55" fill="currentColor"/>
    <path d="M2.4 13v2.6M21.6 13v2.6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
  </svg>`;
}
