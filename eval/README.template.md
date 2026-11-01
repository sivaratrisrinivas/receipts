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

[Receipts](https://github.com/sivaratrisrinivas/receipts) turns the real history between two people into a poem made only of things they actually said to each other, each line carrying proof of who said it and when. [Beam](https://huggingface.co/reflection/Beam-1.0-501B-A23B) reads the whole Conversation in one call (about 350k tokens for the Gallery) and chooses Snippet IDs; code looks up the verbatim text, verifies it and sorts it by date. Beam never writes any Poem text.

This dataset is the eval behind the claim that **reading everything matters**. It compares three groups of Poems over the same Conversation, the Gallery (Robert Browning and Elizabeth Barrett's 1845-1846 letters). Each group was planned at 20 Poems; **the full-Conversation group has 18 of its 20**, because the $5 spend cap stopped the run (see Results). This is the second run of the eval: the first one used an older prompt and is compared with this one below.

1. **Beam on the full Conversation**: the real product path.
2. **Beam on the last 10%**: the same pipeline and prompt, but Beam is shown only the last tenth of the Messages, as if it could not read more.
3. **Random Snippets**: 8 to 14 Snippets drawn uniformly at random, with no Beam call. A floor to compare against.

All metrics are computed in code from the traces. No model judges anything and no human rated any Poem.

## Results

{{RESULTS_TABLE}}

{{RUN_SUMMARY}}

**This dataset does not hold 60 Poems.** The run was given a hard spend cap of $5. After 18 full-Conversation Poems the next call could have taken the estimate past it, so the runner stopped there; the full-Conversation Poems `full-18` and `full-19` were never started. The table counts the 18 attempted (two of which failed and score 0), not 20.

The same table over only the Poems that completed (a failed Poem scores 0 above, so it cannot be hidden):

{{COMPLETED_ONLY_TABLE}}

### Reading the results

These readings are from the run published here: 18 to 20 Poems per group, one Beam sample each, so treat differences of a few points as noise.

- **Reading less costs coverage, by construction.** Beam on the last 10% sees under a month of a twenty-month correspondence, so every one of its Poems sits in the final timeline bucket (10% coverage).
- **Reading everything still does not clearly beat chance at spreading Lines across time.** The 16 full-Conversation Poems that completed cover 62% of the timeline buckets, against 56% for random Snippets. The per-Poem spread is large (a standard deviation of about 15 points for the full group and 12 for random), so a 6-point gap at 16 and 20 Poems is about one standard error: it cannot be told apart from chance. With the 2 failed Poems counted as 0, the full group's coverage is 55%, below random's 56%. Part of even the 6 points is length: Beam's Poems average 13.6 Lines against 11.1 for random Poems (drawn at 8 to 14), and more Lines cover more buckets on their own. The prompt asks Beam for a Line from each quarter, and the new quarter markers did not change the outcome beyond noise (58% in the first run, 62% here, completed Poems only).
- **Beam balances the two voices; chance does not.** Elizabeth's letters yield more Snippets (68% of the Gallery's 12,513), so random Poems lean to her (balance 0.46). Completed full-Conversation Poems balance at 0.78 (0.69 with the failed Poems counted as 0), last-10% Poems at 0.69.
- **Verification held.** No Beam answer that completed named a Snippet that does not exist: every completed Poem carries the badge. The full group's 89% is the 2 Poems that never arrived.
- **Reading more did not produce more callbacks, and this run produced fewer than the first.** Completed full-Conversation Poems cite 2.0 callbacks on average and last-10% Poems 3.1; random Poems have none by definition. The full group's average is carried by two Poems (12 and 7 callbacks): 8 of its 16 completed Poems cite none, against 3 of 20 in the last-10% group. Both Beam groups fell from the first run (full 4.4, last 10% 5.1, which used the older prompt). The same prompt change applies to both groups, and it asks Beam to reason in short lines of candidate IDs only; this eval did not test whether that is why. The count says nothing about how far back a callback reaches or whether it is apt.
- **The price of reading everything is reliability and money, less than before.** Even at `low`, 7 of the 26 full-Conversation calls ran through the 60,000-token completion budget and ended truncated (the Poems that completed used 0.7k to 54k completion tokens, 8k on average), 3 more returned too many Lines, and 2 of 18 full Poems failed after three tries. Counting retries and failures, a full-Conversation Poem cost about $0.25 on the recorded prices (about $0.28 per Poem that completed), against about $0.02 for a last-10% Poem. The completed-only numbers for the full group describe the Poems that finished, which may be the easier ones.

In short: the full read is what lets Beam draw from the whole timeline, and it picks a balanced, verified set of Lines. By this eval's structural metrics it still does not spread Lines more evenly than random Snippets do, it cites fewer callbacks than a Beam that reads 10%, and it fails often enough at this budget that retry handling is part of the product, though about half as often as with the first prompt.

## First run vs. second run

The eval was run twice on the same Gallery, groups and metrics. The first run was made at commit `3f68ae6` of the code repository, with the prompt as it was then; the second run is this dataset. The first run's traces are not in this dataset (they are in the code repository's git history).

**What the first run found.** With the quarters given as date ranges in the instructions and with "read start to end, keep a shortlist as you read" in the prompt, Beam often spent its whole 60,000-token completion budget "reading". Its reasoning turned into an in-order index of the Snippets (`s3173 R "..."`, `s3174 R "..."`, and so on) that was only about 40% of the way through the Conversation when the budget ran out. The quarters themselves were not the problem (they came up about ten times in 150,000 characters of reasoning). Of its 37 full-Conversation calls, 16 finished (43%): 20 were truncated and 1 lost the connection. (The project's own Space text had cited this as "17 of 37", which is 37 minus the 20 truncations and left out the dropped connection.) 16 of 20 full Poems completed, and the run was estimated at $7.79.

**What changed before the second run.**

- *The prompt.* The quarters are marked in the Conversation itself by lines the code inserts (`=== QUARTER n of 4: first date to last date ===`), so Beam can see which quarter a Snippet is in without comparing dates. "Start to end" and "keep a shortlist as you read" are gone, and Beam is given a reasoning format that is cheap to finish: one short line per quarter naming 2 to 4 candidate IDs. The ask is repeated after the Conversation, where Beam reads it last.
- *A Poem-length rule.* A Poem must be the size the Conversation can carry (8 to 14 Lines for the Gallery, never outside 6 to 14). Verified Lines outside that range are a retryable `wrong-size` error, counted as a failed call like any other, and a Poem that never comes back the right size fails. In the first run a 16-Line Poem (`last10-09`) got through.

The pipeline is shared, so this eval picked both changes up with no change to its own code.

| | First run (older prompt, no length rule) | Second run (this dataset) |
|---|---:|---:|
| Full group: Poems attempted / completed | 20 / 16 | 18 / 16 |
| Full group: calls that finished | 16 of 37 (43%) | 16 of 26 (62%) |
| Full group: calls truncated | 20 of 37 (54%) | 7 of 26 (27%) |
| Full group: calls with the wrong number of Lines | not checked | 3 of 26 (19, 20 and 25 Lines) |
| Full group: other failed calls | 1 dropped connection | none |
| Full group: calls per Poem attempted | 1.9 | 1.4 |
| Last-10% group: calls that finished | 20 of 20 | 20 of 21 |
| Spend (estimated, failed calls included) | $7.79 (about $7.26 best estimate) | $4.89 (about $4.71 best estimate) |

| Metric | Full, first run | Full, second run | Last 10%, first run | Last 10%, second run | Random (both runs) |
|---|---:|---:|---:|---:|---:|
| Verification rate | 80% | 89% | 100% | 100% | 100% |
| Timeline coverage | 47% | 55% | 10% | 10% | 56% |
| Sender balance | 0.65 | 0.69 | 0.62 | 0.69 | 0.46 |
| Note callbacks per Poem | 3.5 | 1.8 | 5.1 | 3.1 | 0.0 |
| Same, completed Poems only: coverage | 58% | 62% | 10% | 10% | 56% |
| Same, completed Poems only: callbacks | 4.4 | 2.0 | 5.1 | 3.1 | 0.0 |

The random group is the same in both runs (same seeds, same Poems, 8 to 14 Lines each, all passing the size rule), so its identical numbers are expected and it shows the baseline did not move. The full group's first-run column counts 20 Poems and its second-run column 18.

**Over-returning Lines.** Beam sometimes names more Snippets than it was asked for. Under the new rule that is caught and retried: 4 of the 47 Beam calls in this run returned too many Lines (3 in the full group with 19, 20 and 25 Lines, 1 in the last-10% group with 16), none too few. Three of those Poems then came back the right size on the next call; the fourth (`full-08`) had already been truncated twice and failed on a 25-Line answer. The project's own test calls on the new prompt before this run (not part of this dataset) saw about 1 call in 3 over-return 16 to 18 Lines. 4 of 47 calls here is a lower rate, and with so few over-returns neither figure is precise.

## Metrics

Each Poem is scored by `eval/lib/metrics.ts` in the code repository; a group's number is the mean over the Poems attempted (20 for the last-10% and random groups, 18 for the full group), and a Poem that never arrived scores 0 (and is unverified).

- **Verification rate**: the share of Poems carrying the "every line is real" badge, meaning every Snippet ID Beam named resolved to a real Snippet of the Conversation. Random Poems are real by construction, so their 100% only shows the baseline is sound.
- **Timeline coverage**: the full Conversation's date span (10 January 1845 to 19 September 1846) is cut into 10 equal buckets; coverage is the share of buckets holding at least one Line. It is always measured against the *full* Conversation, so the last-10% group cannot reach past the final bucket or two. Ten buckets rather than the prompt's four quarters, so a few random Lines do not score near 100% by luck.
- **Sender balance**: 1 means the Lines split evenly between Robert and Elizabeth, 0 means one Sender has every Line (twice the smaller Sender's share).
- **Note callbacks per Poem**: how many callbacks to other moments the Poem's private Notes cite, as Snippet IDs. Only callbacks that point at real Snippets count (a Note that cites an unknown Snippet is dropped by verification). Random Poems have no Notes, so they score 0 by definition.

## Method

- **Conversation.** The Gallery: 573 letters, read from the two Project Gutenberg volumes with `src/sources/gallery.ts` into 12,513 Snippets (a Message of 40 words or fewer is one Snippet; longer ones are split into sentences; Snippets under 3 or over 40 words are dropped).
- **Beam.** `reflection/Beam-1.0-501B-A23B` through the Hugging Face router (provider Baseten), streaming, strict JSON-schema output (Snippet IDs, a one-line Note, callbacks), `reasoning_effort: "low"`, `max_completion_tokens: 60000`. Every Beam Poem, in both Beam groups, is made by the same `makePoem` function the Space uses. The prompt tells Beam to read everything, spread its picks across the timeline (at least one Line from each quarter of what it is shown, with the quarters marked in the Conversation by lines the code inserts), include both Senders and avoid private matters, and to reason in one short line of candidate IDs per quarter; the ask is repeated after the Conversation.
- **Last 10%.** The last 10% of Messages (rounded up: 58 of 573, 24 August to 19 September 1846) in Conversation order. Beam gets the same instructions, with the timeline quarters computed over the part it is shown.
- **Random.** Seeded (`random-0` to `random-19`), so a rerun draws the same Poems. They go through the same verification and ordering as Beam's picks.
- **Poems.** 20 planned per group; 20 for the last-10% and random groups, 18 for the full group (the spend cap stopped the run). The six Occasions (birthday, anniversary, thank you, sorry, missing you, farewell) cycle in the same order in every group, so Poem *i* has the same Occasion in all three. The Giver is Robert and the Recipient Elizabeth for every Poem.
- **Failures.** A retryable Beam error (truncation, a malformed answer, a gateway or network error) is retried at most twice per Poem. The pipeline also refuses a Poem whose verified Lines are fewer or more than the Conversation allows (8 to 14 for the Gallery, 6 to 8 for a small chat; a Poem is never outside 6 to 14); that is a retryable `wrong-size` error too, so such a Poem is retried, and one that never comes back the right size counts as a failed Poem in its group, scoring 0 like any other. Every failed call is counted in the call tallies above, whatever its kind (truncation, wrong size, dropped connection). The random group goes through the same check, and every random Poem passed it. A Poem that still fails is kept as a failed trace and counted against its group; nothing is dropped or replaced. An error that cannot be retried (bad token, no credits) stops the run.
- **Spend.** Counted from the usage Beam reports, at the router's prices of $0.40 per million input and $1.20 per million output tokens; every reported token is priced in full, so a provider-side cache, if any, would make the real bill lower. The run aborts rather than start a call that could take the estimate past a hard cap, which for this run was **$5** (`--cap 5`). A call whose token counts never came back (a truncated call: the adapter raises before the final usage chunk) is priced from the prompt size with the whole 60,000-token completion budget spent, so the recorded total is an upper bound; the results section gives a tighter one. The run was made in two sittings: the random and last-10% groups first (they cost $0.38 together), then the full-Conversation group, which stopped itself at $4.89 estimated, before `full-18`, because the next call could cost up to $0.24 and pass $5.
- **Reproduce.** `npm ci && npm run eval` in the code repository, with a Hugging Face token that has inference access. `npm run eval -- --groups random,last10 --cap 5` and then `npm run eval -- --groups full --cap 5` make this dataset's run. All 60 Poems cost about $5.4 at this run's rates ($0.25 a full Poem, $0.02 a last-10% Poem), so a $5 cap stops just short, as it did here; use a higher `--cap` to finish. Finished traces are skipped, so an interrupted run resumes where it stopped.

## Finding: only `low` reasoning effort completes on 500k-token inputs

Beam always reasons, and its reasoning tokens are drawn from the same `max_completion_tokens` budget as the answer. On the Gallery, a prompt of about 513,000 tokens, the prototype for this project measured (1 November 2026, same Conversation, same router):

| `reasoning_effort` | completion budget | result |
|---|---:|---|
| `low` | 60,000 | finished in about 70 s: 513k tokens in, 34k out (33k reasoning), about $0.25, 14 valid picks, no unknown IDs |
| `medium` | 120,000 | spent the entire budget reasoning for 308 s, `finish_reason: length`, empty content |
| `high` | 32,000 | truncated the same way, no content |
| `medium` (not streaming) | - | the gateway returned an HTML error page instead of a response |

The pipeline has since dropped fragments and end matter from the Snippets, so today's Gallery prompt is smaller (12,513 Snippets, about 352k tokens); the table was measured on the larger prototype prompt and was not rerun at 352k. So only `low` completes on inputs of this size, and **long calls must stream**. That is why every Beam Poem in this dataset uses `reasoning_effort: "low"` with `stream: true`, and why the product does not offer higher efforts. Other builders report the same mechanics on smaller inputs: reasoning tokens consume the completion budget and a tight budget yields empty content with `finish_reason: "length"` (see [iarsalanshah/beam-effort-atlas](https://huggingface.co/datasets/iarsalanshah/beam-effort-atlas)), and `low` stays close to higher efforts on quality while using about half the tokens ([PengoSword123/beamdial-v0.1](https://huggingface.co/datasets/PengoSword123/beamdial-v0.1)). The `medium` and `high` rows come from the prototype and were not rerun for this eval, which spent its budget on the Poems.

`low` is not a guarantee, though. On the current 352k-token prompt with a 60,000-token budget, the first run saw 20 of its 37 full-Conversation calls end with `finish_reason: length` after reasoning through the whole budget; the prompt change described above cut that to 7 of 26 in this run. The calls that completed used between 0.7k and 54k completion tokens. Truncation clustered on particular Poems rather than striking at random: all 3 full Poems that were truncated once were truncated again on the first retry, and only 1 of those 3 completed on a later try (the others failed after three tries). A retry can work, but it is not reliable, so a larger completion budget is the first thing to try; the eval kept the product's setting.

## Files

- `poems.jsonl` (config `poems`): one row per Poem: group (`condition`: `full`, `last10`, `random`), Occasion, status, whether it verified, its per-Poem metrics, Beam calls, tokens, cost, time, and its `lines` (Snippet ID, sender, date, verbatim text, Beam's Note and callbacks).
- `metrics.csv` (config `metrics`) and `metrics.json`: the table above, one row per group, with the completed-only means.
- `traces/<condition>-<NN>.json`: the raw trace of each Poem: every Beam attempt with its token usage, finish reason, cost and any error, Beam's final JSON answer, and the resulting Poem. Prompts are not stored (each Beam prompt is about 2 MB of the public-domain letters; the code regenerates them exactly). In the `last10` group, Snippet IDs such as `s0` are relative to the part of the Conversation Beam was shown, so use `message_ordinal` and `date` to place a Line in the full Conversation.
- No token, header or credential is stored anywhere in this dataset.

## Limits

One Conversation, 18 to 20 Poems per group, and Beam samples: another run will not give identical numbers. The two runs differ in the prompt and the Poem-length rule together, so this eval cannot say which of the two changed an outcome, and the full group of this run is two Poems short of 20. The metrics measure structure (real Lines, spread across time, both voices, callbacks), not whether a Poem is moving; there are no human preference ratings. The last-10% group is a deliberately blunt way to show what a model that reads less would see, not a model of any real product. No metric checks that a Note fits its Line or that what it says is in the Conversation. A spot check of three Poems from this run found Notes that add context the Line itself does not contain (a brother's loss, a private grief), which may come from other letters Beam read but was not verified; the first run and the prototype saw Notes describing something other than their Line. The Gallery is letters, not chats.

## Credits

The letters are [The Letters of Robert Browning and Elizabeth Barrett Barrett, 1845-1846](https://www.gutenberg.org/ebooks/16182) (Project Gutenberg ebook 16182) and [its second volume](https://www.gutenberg.org/ebooks/73891) (ebook 73891). Both are in the public domain in the United States; Snippets in this dataset are verbatim excerpts with Gutenberg's boilerplate, editorial notes and indexes removed. The license in the front-matter covers what this project added (the selections, Notes, traces, metrics and this card), not the letters. Poems are chosen by [Beam](https://huggingface.co/reflection/Beam-1.0-501B-A23B) by Reflection AI (Apache 2.0), made for the Build with Beam hackathon.
