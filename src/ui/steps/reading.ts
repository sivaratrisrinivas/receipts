// Step: Beam is reading. Shows progress for the roughly one-minute call, and keeps the
// screen awake so a phone does not drop the connection.

import { progressView } from '../../app/progress';
import { h } from '../dom';
import type { StepFactory } from '../step';
import { keepAwake } from '../wake-lock';

export const readingStep: StepFactory = (_app, state) => {
  let current = state;

  const heading = h('h2', { tabindex: '-1' }, 'Making your Poem');
  const label = h('p', { class: 'progress-label', role: 'status' });
  const fill = h('div', { class: 'bar-fill' });
  const bar = h('div', { class: 'bar', role: 'progressbar', 'aria-label': 'Beam reading progress', 'aria-valuemin': '0', 'aria-valuemax': '100' }, fill);
  const detail = h('p', { class: 'aside' });
  const elapsed = h('p', { class: 'elapsed' });
  const el = h('section', { class: 'step step-reading' }, heading, label, bar, detail, elapsed);

  function render(): void {
    if (!current.attempt) return;
    const view = progressView(current.attempt.progress, Date.now());
    const percent = Math.round(view.fraction * 100);
    label.textContent = view.label;
    detail.textContent = view.detail;
    elapsed.textContent = `${view.elapsedSeconds}s`;
    fill.style.width = `${percent}%`;
    bar.setAttribute('aria-valuenow', String(percent));
    el.dataset.phase = view.phase;
  }

  render();
  const ticker = window.setInterval(render, 1000);
  const releaseWakeLock = keepAwake();

  return {
    el,
    update(next) {
      current = next;
      render();
    },
    dispose() {
      window.clearInterval(ticker);
      releaseWakeLock();
    },
  };
};
