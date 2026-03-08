import { initDOMManipulations } from './vlibras-dom.js';
import { initVLibrasWidget } from './vlibras-core.js';
import { initVLibrasQueue } from './vlibras-queue.js';

document.addEventListener('DOMContentLoaded', () => {
  initDOMManipulations();
  const { patchVLibrasGlossEnd } = initVLibrasWidget();
  initVLibrasQueue(patchVLibrasGlossEnd);
});