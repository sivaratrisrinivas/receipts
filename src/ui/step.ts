// What a screen (a "step") is. One module per step under src/ui/steps/, each exporting
// a StepFactory, registered in src/ui/steps/index.ts.

import type { App } from '../app/app';
import type { AppState } from '../app/state';

export interface StepView {
  /** The step's root element. It gets focus (via its first heading) when the step appears. */
  el: HTMLElement;
  /**
   * Called on every state change while this step stays on screen, so it can refresh in
   * place (keeping typed text, focus and scroll). Steps without live content can omit it.
   */
  update?(state: AppState): void;
  /** Called when the step leaves the screen: clear timers, release locks. */
  dispose?(): void;
}

export type StepFactory = (app: App, state: AppState) => StepView;
