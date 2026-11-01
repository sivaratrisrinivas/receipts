// The step registry: which screen shows for each step of the flow. A ticket that adds a
// step adds its id to StepId (src/app/state.ts), its module here, and one entry below.

import type { StepId } from '../../app/state';
import type { StepFactory } from '../step';
import { composeStep } from './compose';
import { dateOrderStep } from './date-order';
import { failedStep } from './failed';
import { peopleStep } from './people';
import { poemStep } from './poem';
import { readingStep } from './reading';
import { reviewStep } from './review';
import { signInStep } from './sign-in';
import { uploadStep } from './upload';

export const steps: Record<StepId, StepFactory> = {
  'sign-in': signInStep,
  compose: composeStep,
  reading: readingStep,
  poem: poemStep,
  failed: failedStep,
  upload: uploadStep,
  people: peopleStep,
  'date-order': dateOrderStep,
  review: reviewStep,
};
