// The step registry: which screen shows for each step of the flow. A ticket that adds a
// step adds its id to StepId (src/app/state.ts), its module here, and one entry below.

import type { StepId } from '../../app/state';
import type { StepFactory } from '../step';
import { composeStep } from './compose';
import { failedStep } from './failed';
import { poemStep } from './poem';
import { readingStep } from './reading';
import { signInStep } from './sign-in';

export const steps: Record<StepId, StepFactory> = {
  'sign-in': signInStep,
  compose: composeStep,
  reading: readingStep,
  poem: poemStep,
  failed: failedStep,
};
