# Gallery Poems ship as picks and are verified again at load

The Gallery Poems a judge sees before signing in are made once, by Beam, and committed as data. What is committed is only each Poem's picks (Snippet IDs, Notes and callbacks) per Occasion, never Line text. When the page loads, the picks run through the same verification as a live Poem (`verifyAnswer`) against the Gallery's own letters, so every signed-out Line is looked up from the source and carries its real Receipt. This follows ADR-0002: Beam names IDs and code owns the text.

The picks are only meaningful against the exact Snippets they were chosen from, since a Snippet ID is a position in the cut-up Gallery. The data file therefore records a fingerprint of the Gallery's Snippets, and the Poems are not rebuilt if it no longer matches (for example after a change to how letters are cut into Snippets): they have to be made again.

## Considered Options

- **Commit the Poems' text and Receipts**: rejected; the signed-out page would then show text no code had checked, and the "every line is real" badge on it would be a claim rather than a result.
- **Make a Poem live for every visitor before sign-in**: rejected; it costs credits the visitor has not agreed to spend, and needs a sign-in the page is trying to invite.
