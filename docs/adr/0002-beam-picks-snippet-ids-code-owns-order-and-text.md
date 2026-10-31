# Beam picks Snippet IDs; code owns the text and the order

Beam returns only Snippet IDs (plus a private Note for each). Code looks up the verbatim text, rejects any unknown ID, and always sorts Lines by date; the Giver may remove or replace a Line but never edit its text or reorder it. Asking for IDs means Beam can't slip in words of its own, and fixing the order to the timeline stops real Lines from being rearranged into something nobody said, such as an old "yes" placed after a recent question.

## Considered Options

- **Beam returns text, code fuzzy-matches it back**: rejected; it allows near-miss paraphrases and makes the "every line is real" badge a judgement call.
- **Beam chooses the order**: rejected; better narrative arcs, but it is exactly the reordering that makes fake confessions possible.
