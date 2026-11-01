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

1. Open the Space and **sign in with Hugging Face**. There is no API key to paste. (Before you sign in, you can already see Poems made from the Gallery.)
2. Choose what the Poem is made from: the **Gallery** (the 1845-1846 love letters of Robert Browning and Elizabeth Barrett), or **your own WhatsApp chat**, see below.
3. Pick an **occasion** (birthday, anniversary, thank you, sorry, missing you, farewell) and, if you like, add a short note for Beam.
4. Beam reads the whole Conversation, which usually takes under a minute (a call finishes in roughly 3 to 55 seconds). You watch its progress.
5. The poem is revealed **line by line**, each with its sender and date. If every line checks out against the Conversation, it carries the **"every line is real"** badge.

If something goes wrong (out of credits, Beam unavailable, a dropped connection, Beam running out of room) you get a plain message that says which, and a retry.

## Your own chat

Choose **Use my own WhatsApp chat instead** and upload an export: the `.txt` Android makes, or the `.zip` iOS makes, exported **without media** (a file over 200 MB is refused). Both 24-hour and 12-hour clocks, and day-first or month-first dates, are understood; when the dates could be read either way, you are asked one question with a real Message from your chat as the example.

- **Group chats.** Say which person you are and who the Poem is for. **Only those two people's Messages are ever sent**; everyone else in the group is left out entirely, before anything leaves your browser.
- **Redaction.** Phone numbers and email addresses are replaced with `[phone number]` and `[email address]` in every Message, in the names of the two people and in your optional note, before anything is sent to Beam. Redaction happens before any sentence is cut from a Message, so a number or address can never end up in a Line or on the Card either.
- **What you see before it goes.** The count of Messages that will be sent, and where they go, are shown before you continue.
- **What it is made of.** The same rules as the Gallery: every Line is a real Message (or one sentence of a long one), shown with who sent it and when.

## How Beam is used

Beam does the one thing a short-context model cannot: it reads the **entire** Conversation in a single call, start to end, and chooses the moments that tell the story of two people over time.

- **One call, whole Conversation.** The Gallery is 573 letters, cut into about 12,500 verbatim snippets and sent as a compact grouped list of several hundred thousand tokens (about 513,000 when measured in the prototype). There is no retrieval and no chunking; Beam sees everything, so it can pick callbacks, private jokes and turns that only make sense across the whole history.
- **Beam returns only snippet IDs.** Its answer is a strict JSON schema of snippet IDs plus a one-line private note for each. It never writes the poem's words. Code looks up each snippet's verbatim text, rejects any ID that does not exist, and always **sorts the lines by date**, so real lines can never be reordered into something nobody said. The "every line is real" badge appears only when every pick resolved to a real snippet.
- **Low reasoning effort, streamed.** Beam reasons before it answers. At this input size only `reasoning_effort: "low"` finishes within budget (a successful call finishes in roughly 3 to 55 seconds; a truncated one runs about two minutes before failing); `medium` and `high` spent the whole completion budget thinking and returned nothing. The response is streamed, which is how the progress bar works and avoids gateway timeouts on a long non-streaming call.
- **Called through the Hugging Face router** (provider: Baseten) at `router.huggingface.co`, with the Giver's own OAuth token.

The architecture and the reasoning behind these choices are in the project's decision records: the browser calls Beam directly (Reflection's own API sends no CORS headers, and a server of ours would see private chats), and Beam picks IDs while code owns the text and the order.

## Privacy

Receipts is a static site with **no backend**. A Conversation goes from **your browser to the Hugging Face router to Beam**, billed to and authenticated as **you**; it never touches a server we run. We store nothing and have no analytics. Your access token lives in this browser tab's session storage and is sent only to Hugging Face. The sign-in is a public OAuth client with PKCE, asking for the `inference-api` permission so Beam can run under your account, and nothing else.

For your own chat that means: the file is read in your browser; only the Messages of the two chosen people, with phone numbers and email addresses removed, are sent; and nothing about the chat is kept after you close or sign out of the tab. Hugging Face and its inference provider handle the request under their own terms.

## Credits

Each poem costs the Giver's own Hugging Face Inference credits: about **$0.15, up to about $0.25 when Beam runs out of room**, for a Gallery poem (input is billed at $0.40 per million tokens and output at $1.20 per million). A chat costs about the same when it is as long as the Gallery, and less when it is shorter. A try that fails part-way (Beam running out of room, see below) is billed too, so a poem can cost more than that when it takes several tries. Free Hugging Face accounts have no included Inference credits, so add credits at [Billing](https://huggingface.co/settings/billing); PRO accounts get $2 a month, enough for roughly eight to thirteen Gallery poems. For this hackathon, Hugging Face is offering new claimants Hub credits through [this coupon](https://huggingface.co/coupons/claim/HuggingFacexReflection-MiniHack).

## Very long conversations

Beam reads the whole Conversation in one call, and a long one can fail. At the size of the Gallery, Beam sometimes spends its whole completion budget reasoning and returns nothing (**truncation**), or names too many Lines for a Poem (which is caught and retried). In the evaluation, 17 of 31 full-Gallery calls (about 55%) gave a Poem; 9 (about 29%) were truncated and 5 returned the wrong number of Lines. 17 of the 20 full-Gallery Poems tried were made within three tries, 13 of them on the first call, so you may need a few tries. (An earlier prompt finished only 16 of 37 calls, about 43%; the prompt was changed to fix that.) A Conversation too big for one call (over about 800,000 tokens) is read as **every 2nd, 3rd, ... day** across its whole span instead, and the Poem says so. Beam sometimes also stops part-way or the service in front of it returns an error; each is reported as what it is, not as a lost connection.

## The Gallery

The Gallery texts are the letters of Robert Browning and Elizabeth Barrett Barrett from Project Gutenberg, ebooks [16182](https://www.gutenberg.org/ebooks/16182) and [73891](https://www.gutenberg.org/ebooks/73891), which are in the public domain in the United States. They are served as static files from this Space; no private chat is ever included.
