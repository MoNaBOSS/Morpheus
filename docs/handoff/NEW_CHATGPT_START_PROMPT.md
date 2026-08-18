# Prompt for a Fresh ChatGPT/Codex Account

Copy the text below into a new ChatGPT/Codex task opened against the Morpheus
repository. Do not paste API keys or the old conversation transcript.

---

You are taking ownership of the Morpheus Windows product as my primary product,
UX and engineering partner.

Before changing any code, read completely:

- `AGENTS.md`
- `CLAUDE.md`
- `PROJECT_HANDOFF.md`
- `docs/handoff/MORPHEUS_NEXT_SESSION_HANDOFF.md`
- all directly referenced canonical product, architecture, security, design and
  release documents
- the recent commit history and the actual implementation of activation,
  Command Center, Quick Command, voice, tray behavior, Objective Core, planning,
  permissions, capabilities, Missions and OpenClaw Chat

Then verify the live Git branch, HEAD, remote state and working tree. Treat
repository evidence and direct packaged observation as authoritative. Do not
trust a prior statement merely because it says "complete" or "production."

The central product requirement is a persistent, voice-first autonomous AI
operator: a next-generation companion that understands an objective, creates a
complete typed plan, asks once only when trust genuinely changes, executes and
observes real work, reports results naturally, remains available from the tray,
and preserves inspectable history. Chat is secondary. OpenClaw is an internal
runtime, not the visible product identity or execution authority.

For this first interaction, do not implement. Inspect the repository and current
packaged experience, then give me:

1. a concise truth table of what is implemented, what is technically present
   but experientially inadequate, and what is genuinely missing;
2. three concrete UI/UX directions at 1280x800: Living Intelligence, Command OS,
   and Invisible Companion;
3. for each direction, describe first launch, home state, voice invocation,
   listening/thinking/acting/speaking states, trust prompts, results, tray mode,
   visual language and failure states;
4. your recommended synthesis and why;
5. the smallest end-to-end vertical slice that would prove the Jarvis-style
   experience in a packaged build;
6. exact existing systems to reuse and exact areas that need implementation or
   redesign;
7. acceptance tests that judge actual first-user experience, not only contracts
   and backend checks.

Use a sophisticated Matrix-influenced visual language: layered near-black
surfaces, restrained signal fields, green only for live/verified state, premium
motion and a distinctive living Morpheus core. Avoid neon hacker styling,
generic SaaS cards and chat bubbles as the dominant product frame.

Be honest about scope. Never call infrastructure, stubs, routes, tests or an
installer "the finished product" unless the packaged first-user journey has
been observed and accepted. Challenge architectural changes that would weaken
the Main-owned security/execution boundary, but do not use security as an excuse
to make routine trusted work irritating.

Wait for my selection of the UX direction before broad UI implementation.

---

After the UX direction is selected, continue in the same fresh task so it keeps
the clean product context.
