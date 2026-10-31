---
title: Receipts
emoji: 🧾
colorFrom: yellow
colorTo: red
sdk: static
app_file: index.html
pinned: false
short_description: A poem made only of real messages, each with its receipt
hf_oauth: true
hf_oauth_scopes:
  - inference-api
hf_oauth_expiration_minutes: 480
models:
  - reflection/Beam-1.0-501B-A23B
tags:
  - reflection-ai
  - build-with-beam
  - beam-1.0-501b-a23b
---

# Receipts

A poem for someone you love, made only from things the two of you actually said to each other. Every line is a real message, and under it goes who said it and when: the receipt.

Built for Build with Beam, on [Beam 1.0](https://huggingface.co/reflection/Beam-1.0-501B-A23B) (501B parameters, 23B active, 1M-token context).

## Try it

1. Open the Space and **sign in with Hugging Face**. There is no API key to paste.
2. Pick an **occasion** (birthday, anniversary, thank you, sorry, missing you, farewell) and, if you like, add a short note for Beam.
3. Beam reads the whole **Gallery**, the 1845-1846 love letters of Robert Browning and Elizabeth Barrett, which takes about a minute. You watch its progress.
4. The poem is revealed **line by line**, each with its sender and date. If every line checks out against the letters, it carries the **"every line is real"** badge.

If something goes wrong (out of credits, a dropped connection, Beam running out of room) you get a plain message and a retry.

## How Beam is used

Beam does the one thing a short-context model cannot: it reads the **entire** Conversation in a single call, start to end, and chooses the moments that tell the story of two people over time.

- **One call, whole Conversation.** The Gallery is 573 letters, cut into about 12,500 verbatim snippets and sent as a compact grouped list of several hundred thousand tokens (about 513,000 when measured in the prototype). There is no retrieval and no chunking; Beam sees everything, so it can pick callbacks, private jokes and turns that only make sense across the whole history.
- **Beam returns only snippet IDs.** Its answer is a strict JSON schema of snippet IDs plus a one-line private note for each. It never writes the poem's words. Code looks up each snippet's verbatim text, rejects any ID that does not exist, and always **sorts the lines by date**, so real lines can never be reordered into something nobody said. The "every line is real" badge appears only when every pick resolved to a real snippet.
- **Low reasoning effort, streamed.** Beam reasons before it answers. At this input size only `reasoning_effort: "low"` finishes within budget (about 70 seconds, roughly 33,000 reasoning tokens); `medium` and `high` spent the whole completion budget thinking and returned nothing. The response is streamed, which is how the progress bar works and avoids gateway timeouts on a long non-streaming call.
- **Called through the Hugging Face router** (provider: Baseten) at `router.huggingface.co`, with the Giver's own OAuth token.

The architecture and the reasoning behind these choices are in the project's decision records: the browser calls Beam directly (Reflection's own API sends no CORS headers, and a server of ours would see private chats), and Beam picks IDs while code owns the text and the order.

## Privacy

Receipts is a static site with **no backend**. A Conversation goes from your browser to the Hugging Face router to Beam, billed to and authenticated as **you**; it never touches a server we run. We store nothing and have no analytics. Your access token lives in this browser tab's session storage and is sent only to Hugging Face. The sign-in is a public OAuth client with PKCE, asking for the `inference-api` permission so Beam can run under your account, and nothing else.

## Credits

Each poem costs the Giver's own Hugging Face Inference credits: roughly **$0.17 to $0.25** for a Gallery poem (input is billed at $0.40 per million tokens and output at $1.20 per million). Free Hugging Face accounts have no included Inference credits, so add credits at [Billing](https://huggingface.co/settings/billing); PRO accounts get $2 a month, enough for around eight Gallery poems. For this hackathon, Hugging Face is offering new claimants Hub credits through [this coupon](https://huggingface.co/coupons/claim/HuggingFacexReflection-MiniHack).

## The Gallery

The Gallery texts are the letters of Robert Browning and Elizabeth Barrett Barrett from Project Gutenberg, ebooks [16182](https://www.gutenberg.org/ebooks/16182) and [73891](https://www.gutenberg.org/ebooks/73891), which are in the public domain in the United States. They are served as static files from this Space; no private chat is ever included.
