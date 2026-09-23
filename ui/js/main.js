/* QNS cockpit bootstrap */

import { set } from './store.js';
import { api, refreshCore, connectStream } from './api.js';
import { mountAll, initRailResize, resetLayout } from './layout.js';
import './panels.js';
import { initChrome } from './panels.js';
import { initMap } from './map2d.js';
import { initChat } from './chat.js';

async function boot() {
  initChrome();

  // catalog first — panels need it to render meaningfully
  try { set({ catalog: await api.catalog() }); }
  catch (e) { console.error('catalog failed', e); }

  mountAll();
  initRailResize();

  // the living map is the fixed central anchor
  initMap(document.getElementById('qns-map3d'));

  document.getElementById('btn-fit-map').addEventListener('click', () =>
    window.dispatchEvent(new Event('qns-fit-map')));
  document.getElementById('btn-reset-layout').addEventListener('click', () => {
    resetLayout();
    window.dispatchEvent(new Event('qns-default-view'));
  });

  initChat();

  await refreshCore();
  connectStream();

  // steady re-poll as a safety net under the SSE stream
  setInterval(() => refreshCore().catch(() => {}), 15000);
}

boot();
