// The features plugged into the screens through src/ui/extensions.ts. Each feature is
// one module that registers its slots when imported; list it here, one line each:
//
//   import './upload';          // #4: choose or upload a Conversation (composeSections)
//   import './budget-messages'; // #5: how much of a long Conversation Beam read (poemActions)
//   import './notes-and-edit';  // #6: Notes, context, Replace, Remove, Regenerate (lineDetails, lineActions, poemActions)
//   import './card-export';     // #7: Save as a Card (poemActions)
//
import './budget-messages';
import './card-export';
import './notes-and-edit';
export {};
