// Public API of the Poem pipeline. Everything here runs in Node and in the browser.

export { NotEnoughError, makePoem, tryMakePoem } from './pipeline';
export type { MakePoemOptions, NotEnough, PoemOutcome, PoemRequest, PoemResult } from './pipeline';

export { readConversation } from './sources';
export type { RawSource } from './sources';
export { GALLERY_TEXT_PATHS } from './sources/gallery';
export { snippetsOf } from './snippets';
export { FULL_SIZE_LINES, INPUT_TOKEN_BUDGET, MIN_USABLE_SNIPPETS, estimateTokens, lineRangeFor, selectSnippets } from './selection';
export type { LineRange, ReadFraction, Selection } from './selection';

export { BeamError } from './beam/port';
export type {
  BeamCompletion,
  BeamErrorReason,
  BeamPort,
  BeamProgress,
  BeamRequest,
  BeamUsage,
  ResponseFormat,
} from './beam/port';
export { BEAM_MODEL, HF_ROUTER_URL, createHfBeam } from './beam/hf';
export type { HfBeamOptions } from './beam/hf';
export { createFakeBeam } from './beam/fake';
export type { FakeBeam, FakeBeamOptions, FakePick, FakeReply } from './beam/fake';

export { OCCASIONS } from './domain';
export type {
  Conversation,
  IsoDate,
  Line,
  Message,
  Occasion,
  Poem,
  Receipt,
  Sender,
  Snippet,
} from './domain';
