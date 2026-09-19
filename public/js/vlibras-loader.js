import { initDOMManipulations } from './vlibras-dom.js';
import { initVLibrasWidget } from './vlibras-core.js';
import { initVLibrasQueue } from './vlibras-queue.js';
import {
  lockVLibrasToCenter,
  disableVLibrasTextCapture
} from './vlibras-bypass.js';

document.addEventListener(
  'DOMContentLoaded',
  () => {
    disableVLibrasTextCapture();

    initDOMManipulations();

    const {
      patchVLibrasGlossEnd
    } = initVLibrasWidget();

    initVLibrasQueue(
      patchVLibrasGlossEnd
    );

    lockVLibrasToCenter();
  }
);