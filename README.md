# receipts
A poem for someone you love, made only from things the two of you actually texted each other. Every line comes with its date, so they get the receipts.

Vocabulary is in [GLOSSARY.md](GLOSSARY.md); decisions are in [docs/adr/](docs/adr/).

## Develop

```
npm install
npm test            # Vitest: the Poem pipeline at its seam, plus the Beam adapter's edge
npm run typecheck   # strict TypeScript for src/ + tests/, and for scripts/
npm run dev         # Vite dev server (placeholder page until the UI lands)
npm run build       # static site into dist/, including the Gallery texts
```

## The Poem pipeline

`src/` is a pure TypeScript library with no Node-only APIs, so the same code runs in the Vitest/Node scripts and in the browser. `makePoem(request, beam, { onProgress })` in `src/pipeline.ts` goes: raw source text -> Conversation (`src/sources/`) -> Snippets (`src/snippets.ts`) -> grouped prompt (`src/prompt.ts`) -> the **Beam port** (`src/beam/port.ts`) -> verified, date-sorted Poem (`src/verification.ts`). Everything else imports from `src/index.ts`.

- The Beam port is the only seam to the outside world. `createHfBeam` (`src/beam/hf.ts`) is the real adapter (HF router, streaming, `reasoning_effort: "low"`, `max_completion_tokens: 60000`, strict `json_schema`); `createFakeBeam` (`src/beam/fake.ts`) is a scriptable stand-in for tests and local work.
- Truncation, malformed answers, HTTP and network failures reject with a `BeamError` carrying `reason` and `retryable`.
- Beam only ever returns Snippet IDs and Notes ([ADR-0002](docs/adr/0002-beam-picks-snippet-ids-code-owns-order-and-text.md)); the Poem's text, Receipts and order come from the Conversation.

## The Gallery texts

The Gallery is the Browning-Barrett letters, Project Gutenberg ebooks [16182](https://www.gutenberg.org/ebooks/16182) and [73891](https://www.gutenberg.org/ebooks/73891) (public domain). Both are **committed** as-is in `public/gallery/` (about 2.3 MB, under 1 MB compressed), so the static build serves them at `gallery/pg16182.txt` and `gallery/pg73891.txt` (`GALLERY_TEXT_PATHS`) and nothing has to be fetched at build time. `npm run gallery:fetch` re-downloads them if you ever need to refresh them. `public/gallery/*.txt` is marked `-text` in `.gitattributes` so git leaves their CRLF line endings alone.

## Live smoke test

`npm run smoke` makes one real Gallery Poem through Beam (about $0.17 to $0.25 of Hugging Face credits), reading the token from `~/.cache/huggingface/token`. The token only goes into the request's `Authorization` header and is never printed. `npm run smoke -- --dry` sizes the prompt without a token or any network. Real chats for manual testing go in the gitignored `.scratch/`.
