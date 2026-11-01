// Browser entry point. Everything lives in src/app (flow, no DOM) and src/ui (screens).

import './ui/styles.css';
import { mountApp } from './ui/mount';

const root = document.querySelector<HTMLElement>('#app');
if (root) {
  mountApp(root).catch((error: unknown) => {
    console.error(error);
    root.textContent = 'Receipts could not start. Reload the page to try again.';
  });
}
