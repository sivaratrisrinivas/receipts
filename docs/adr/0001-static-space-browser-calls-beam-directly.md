# Static Space; the browser calls Beam directly under the Giver's own HF account

Receipts ships as a static Hugging Face Space with no backend. The Giver signs in with HF OAuth (`inference-api` scope) and the browser sends the Conversation straight to Beam through the HF router (served by Baseten), billed to the Giver's own credits. We chose this so a private chat never touches a server we run, which is the privacy promise the product depends on; it also avoids the PRO requirement for Gradio/Docker Spaces.

## Considered Options

- **Reflection's own API from the browser**: rejected; it sends no CORS headers, so browsers block it.
- **Gradio/Docker Space holding our key**: rejected; needs PRO, and every chat would pass through our backend.
- **Pre-generated Gallery only**: rejected as the sole mode (judges couldn't make new Poems), kept as the signed-out fallback.

## Consequences

Every Poem costs the Giver real credits (about $0.20, up to $0.25, per Gallery Poem at ~590k input tokens), and we can't host share links, because there is nowhere to store a Card.
