// Public API of the Poem pipeline. Everything here runs in Node and in the browser.

export { makePoem } from './pipeline';
export type { MakePoemOptions, PoemOutcome, PoemRequest } from './pipeline';

export { readConversation } from './sources';
export type { RawSource } from './sources';
export { GALLERY_TEXT_PATHS } from './sources/gallery';
export { snippetsOf } from './snippets';

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
