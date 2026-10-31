---
license: cc-by-4.0
language:
  - en
pretty_name: Receipts eval - does reading the whole Conversation help?
size_categories:
  - n<1K
task_categories:
  - text-generation
tags:
  - reflection-ai
  - build-with-beam
  - beam-1.0-501b-a23b
  - long-context
  - eval
configs:
  - config_name: poems
    data_files: poems.jsonl
  - config_name: metrics
    data_files: metrics.csv
---

# Receipts eval: does reading the whole Conversation help?

[Receipts](https://github.com/sivaratrisrinivas/receipts) turns the real history between two people into a poem made only of things they actually said to each other, each line carrying proof of who said it and when. [Beam](https://huggingface.co/reflection/Beam-1.0-501B-A23B) reads the whole Conversation in one call (about 500k tokens for the Gallery) and chooses Snippet IDs; code looks up the verbatim text, verifies it and sorts it by date. Beam never writes any Poem text.

This dataset is the eval behind the claim that **reading everything matters**. It compares three groups of 20 Poems over the same Conversation, the Gallery (Robert Browning and Elizabeth Barrett's 1845-1846 letters):

1. **Beam on the full Conversation**: the real product path.
2. **Beam on the last 10%**: the same pipeline and prompt, but Beam is shown only the last tenth of the Messages, as if it could not read more.
3. **Random Snippets**: 8 to 14 Snippets drawn uniformly at random, with no Beam call. A floor to compare against.

All metrics are computed in code from the traces. No model judges anything and no human rated any Poem.

## Results

| Group | Poems completed | Verification rate | Timeline coverage | Sender balance | Note callbacks per Poem |
|---|---:|---:|---:|---:|---:|
| Beam on the full Conversation | 1 of 1 | 100% | 40% | 0.92 | 0.0 |
| Beam on the last 10% | 1 of 1 | 100% | 10% | 0.67 | 9.0 |
| Random Snippets | 1 of 1 | 100% | 60% | 1.00 | 0.0 |

- Poems: 3 attempted, 3 completed, 0 failed after all retries.
- Beam calls: 2, of which 0 failed (each Poem is retried at most twice).
- Estimated spend: $0.16 (reported tokens x the router's prices of $0.40/M input and $1.20/M output).
- Beam on the full Conversation: about 352k prompt tokens and 4k completion tokens (3k of them reasoning) per Poem, 17 s per call.
- Beam on the last 10%: about 39k prompt tokens and 3k completion tokens (2k of them reasoning) per Poem, 6 s per call.

The same table over only the Poems that completed (a failed Poem scores 0 above, so it cannot be hidden):

| Group | Poems | Verification rate | Timeline coverage | Sender balance | Note callbacks per Poem |
|---|---:|---:|---:|---:|---:|
| Beam on the full Conversation | 1 | 100% | 40% | 0.92 | 0.0 |
| Beam on the last 10% | 1 | 100% | 10% | 0.67 | 9.0 |
| Random Snippets | 1 | 100% | 60% | 1.00 | 0.0 |

### Reading the results

See the table.

## Metrics

Each Poem is scored by `eval/lib/metrics.ts` in the code repository; a group's number is the mean over the 20 Poems attempted, and a Poem that never arrived scores 0 (and is unverified).

- **Verification rate**: the share of Poems carrying the "every line is real" badge, meaning every Snippet ID Beam named resolved to a real Snippet of the Conversation. Random Poems are real by construction, so their 100% only shows the baseline is sound.
- **Timeline coverage**: the full Conversation's date span (10 January 1845 to 19 September 1846) is cut into 10 equal buckets; coverage is the share of buckets holding at least one Line. It is always measured against the *full* Conversation, so the last-10% group cannot reach past the final bucket or two. Ten buckets rather than the prompt's four quarters, so a few random Lines do not score near 100% by luck.
- **Sender balance**: 1 means the Lines split evenly between Robert and Elizabeth, 0 means one Sender has every Line (twice the smaller Sender's share).
- **Note callbacks per Poem**: how many callbacks to other moments the Poem's private Notes cite, as Snippet IDs. Only callbacks that point at real Snippets count (a Note that cites an unknown Snippet is dropped by verification). Random Poems have no Notes, so they score 0 by definition.

## Method

- **Conversation.** The Gallery: 573 letters, read from the two Project Gutenberg volumes with `src/sources/gallery.ts` into 12,513 Snippets (a Message of 40 words or fewer is one Snippet; longer ones are split into sentences; Snippets under 3 or over 40 words are dropped).
- **Beam.** `reflection/Beam-1.0-501B-A23B` through the Hugging Face router (provider Baseten), streaming, strict JSON-schema output (Snippet IDs, a one-line Note, callbacks), `reasoning_effort: "low"`, `max_completion_tokens: 60000`. Every Beam Poem, in both Beam groups, is made by the same `makePoem` function the Space uses. The prompt tells Beam to read everything, spread its picks across the timeline (at least one Line from each quarter of what it is shown), include both Senders and avoid private matters.
- **Last 10%.** The last 10% of Messages (rounded up: 58 of 573, 24 August to 19 September 1846) in Conversation order. Beam gets the same instructions, with the timeline quarters computed over the part it is shown.
- **Random.** Seeded (`random-0` to `random-19`), so a rerun draws the same Poems. They go through the same verification and ordering as Beam's picks.
- **Poems.** 20 per group. The six Occasions (birthday, anniversary, thank you, sorry, missing you, farewell) cycle in the same order in every group, so Poem *i* has the same Occasion in all three. The Giver is Robert and the Recipient Elizabeth for every Poem.
- **Failures.** A retryable Beam error (truncation, a malformed answer, a gateway or network error) is retried at most twice per Poem. A Poem that still fails is kept as a failed trace and counted against its group; nothing is dropped or replaced. An error that cannot be retried (bad token, no credits) stops the run.
- **Spend.** Counted from the usage Beam reports, at the router's prices of $0.40 per million input and $1.20 per million output tokens. The run aborts rather than start a call that could take the estimate past a hard cap of $8.
- **Reproduce.** `npm ci && npm run eval` in the code repository, with a Hugging Face token that has inference access (about $6 of credits). Finished traces are skipped, so an interrupted run resumes where it stopped.

## Finding: only `low` reasoning effort completes on 500k-token inputs

Beam always reasons, and its reasoning tokens are drawn from the same `max_completion_tokens` budget as the answer. On the Gallery, a prompt of about 513,000 tokens, the prototype for this project measured (1 November 2026, same Conversation, same router):

| `reasoning_effort` | completion budget | result |
|---|---:|---|
| `low` | 60,000 | finished in about 70 s: 513k tokens in, 34k out (33k reasoning), about $0.25, 14 valid picks, no unknown IDs |
| `medium` | 120,000 | spent the entire budget reasoning for 308 s, `finish_reason: length`, empty content |
| `high` | 32,000 | truncated the same way, no content |
| `medium` (not streaming) | - | the gateway returned an HTML error page instead of a response |

So only `low` completes on inputs of this size, and **long calls must stream**. That is why every Beam Poem in this dataset uses `reasoning_effort: "low"` with `stream: true`, and why the product does not offer higher efforts. Other builders report the same mechanics on smaller inputs: reasoning tokens consume the completion budget and a tight budget yields empty content with `finish_reason: "length"` (see [iarsalanshah/beam-effort-atlas](https://huggingface.co/datasets/iarsalanshah/beam-effort-atlas)), and `low` stays close to higher efforts on quality while using about half the tokens ([PengoSword123/beamdial-v0.1](https://huggingface.co/datasets/PengoSword123/beamdial-v0.1)). The `medium` and `high` rows come from the prototype and were not rerun for this eval, which spent its budget on the 60 Poems.

## Files

- `poems.jsonl` (config `poems`): one row per Poem: group (`condition`: `full`, `last10`, `random`), Occasion, status, whether it verified, its per-Poem metrics, Beam calls, tokens, cost, time, and its `lines` (Snippet ID, sender, date, verbatim text, Beam's Note and callbacks).
- `metrics.csv` (config `metrics`) and `metrics.json`: the table above, one row per group, with the completed-only means.
- `traces/<condition>-<NN>.json`: the raw trace of each Poem: every Beam attempt with its token usage, finish reason, cost and any error, Beam's final JSON answer, and the resulting Poem. Prompts are not stored (each Beam prompt is about 2 MB of the public-domain letters; the code regenerates them exactly). In the `last10` group, Snippet IDs such as `s0` are relative to the part of the Conversation Beam was shown, so use `message_ordinal` and `date` to place a Line in the full Conversation.
- No token, header or credential is stored anywhere in this dataset.

## Limits

One Conversation, 20 Poems per group, and Beam samples: another run will not give identical numbers. The metrics measure structure (real Lines, spread across time, both voices, callbacks), not whether a Poem is moving; there are no human preference ratings. The last-10% group is a deliberately blunt way to show what a model that reads less would see, not a model of any real product. The Gallery is letters, not chats.

## Credits

The letters are [The Letters of Robert Browning and Elizabeth Barrett Barrett, 1845-1846](https://www.gutenberg.org/ebooks/16182) (Project Gutenberg ebook 16182) and [its second volume](https://www.gutenberg.org/ebooks/73891) (ebook 73891). Both are in the public domain in the United States; Snippets in this dataset are verbatim excerpts with Gutenberg's boilerplate, editorial notes and indexes removed. The license in the front-matter covers what this project added (the selections, Notes, traces, metrics and this card), not the letters. Poems are chosen by [Beam](https://huggingface.co/reflection/Beam-1.0-501B-A23B) by Reflection AI (Apache 2.0), made for the Build with Beam hackathon.
