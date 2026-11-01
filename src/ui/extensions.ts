// Extension points: where later features plug into existing screens without editing them.
//
// A feature lives in its own module under src/ui/features/, pushes its slot functions onto
// the arrays below, and is imported once from src/ui/features/index.ts. A slot returns the
// element to show, or null to show nothing. Slots run when the screen is built; a slot that
// must stay live subscribes to `app` itself.
//
//   composeSections  Compose step, above the Occasion picker (e.g. choose or upload a Conversation).
//   composeNotices   Compose step, just above the "Make" button (e.g. a credit budget message).
//   lineActions      Each Line's action row (e.g. Replace, Remove).
//   lineDetails      Under each Line's Receipt (e.g. the Giver-only Note).
//   poemActions      Under the Poem (e.g. Save as a Card).

import type { App } from '../app/app';
import type { AppState } from '../app/state';
import type { Line, Poem } from '../domain';

export interface StepSlotContext {
  app: App;
  state: AppState;
}

export interface LineSlotContext {
  app: App;
  poem: Poem;
  line: Line;
  /** Position within the Poem, 0-based. */
  index: number;
}

export interface PoemSlotContext {
  app: App;
  poem: Poem;
}

export type StepSlot = (context: StepSlotContext) => Node | null;
export type LineSlot = (context: LineSlotContext) => Node | null;
export type PoemSlot = (context: PoemSlotContext) => Node | null;

export interface Extensions {
  composeSections: StepSlot[];
  composeNotices: StepSlot[];
  lineActions: LineSlot[];
  lineDetails: LineSlot[];
  poemActions: PoemSlot[];
}

export const extensions: Extensions = {
  composeSections: [],
  composeNotices: [],
  lineActions: [],
  lineDetails: [],
  poemActions: [],
};
