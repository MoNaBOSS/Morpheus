# Morpheus — Larry Review Guide

This build is a **Windows product review candidate**. It is ready for Larry to
install, use, and judge as an early Morpheus operator experience. It is not yet
a signed public release and it does not claim the entire long-term autonomous
assistant vision is complete.

## Review build

| Field | Value |
| --- | --- |
| Installer | `Morpheus-1.0.0-win-x64.exe` |
| Runtime source | `765b5da` |
| Size | 263,684,018 bytes |
| SHA-256 | `B415A32DA74B50A07E43D166886AA191D0ACA06EB8705EFC39875335EDD15988` |
| Authenticode | `NotSigned` — production signing is not configured locally |
| Supported host | Windows 10/11 x64 |

Verify the SHA-256 before sharing the installer. Do not rename another build to
this filename or distribute a binary with a different digest under this guide.

## What Larry should see

1. Morpheus-branded setup followed by the full-window Signal activation.
2. Real readiness calibration and a final **Morpheus is ready** state.
3. A Command Center built around an objective, Mission progress, trust,
   results, and artifacts—not a chat transcript.
4. **Invoke** for immediate text or voice objectives and **Chat** as a separate,
   secondary OpenClaw surface.
5. One permission decision for a genuinely new scope, with remembered exact
   grants preventing repeated interruption.
6. Real Activity and audit history for work Morpheus actually attempted.

## Recommended 15-minute review

1. Install and launch Morpheus. Complete setup and activation rather than
   judging only the setup wizard.
2. In Command, run **Show system information**. Under Balanced this
   privacy-safe action should run without a prompt.
3. Run **Create a text file named larry-review.txt**. Review the exact workspace
   scope, choose **Allow for this session**, and repeat the same command. The
   second execution in the same scope should not ask again.
4. Run **Open Notepad** and approve its exact application scope.
5. Open **Invoke** and submit one immediate objective. Confirm it becomes the
   same inspectable Mission as a Command Center objective.
6. Open a fresh **Chat** and confirm the embedded OpenClaw conversation surface
   is available separately from execution.
7. Review Mission history, artifacts, Permission Center, and Activity.
8. If a compatible planning/transcription provider is configured, test one
   broader provider-planned objective and push-to-talk. Otherwise judge the
   deterministic execution experience without treating voice as configured.

## Provider and voice setup

- Deterministic registered capabilities work without an AI provider.
- Broad natural-language planning requires a compatible provider configured
  locally in **Models**.
- Voice transcription requires a provider with an OpenAI-compatible audio
  transcription endpoint; a chat-only reseller key is insufficient.
- Never send provider keys in email, chat, screenshots, this document, or the
  repository. Each reviewer should configure their own test credential.

## Feedback that matters

Please record concrete observations rather than only a score:

- Did Morpheus feel like an operator, or did it still feel like a chatbot?
- Was the next action obvious within ten seconds of reaching Command Center?
- Were trust prompts understandable, appropriately rare, and scoped narrowly?
- Did execution feel responsive and observable while work was happening?
- Was Invoke discoverable enough to use instead of opening Chat?
- Did Mission results and artifacts make completed work easy to find?
- Which moment felt most impressive, and which moment broke the illusion?
- What is the first real weekly task you would trust Morpheus to handle?

Include the command used, expected result, actual result, and a screenshot for
any defect. Do not include API keys or private file contents.

## Known boundaries

- The installer is unsigned. A signed external build requires authorized
  Authenticode credentials and the release CI path.
- The Morpheus update endpoint is intentionally unconfigured; this build will
  not download inherited ClawX releases.
- Voice quality, latency, spoken output, and microphone behavior require
  hands-on testing with the review machine and compatible credentials.
- The current capability registry is deliberately controlled. It excludes
  arbitrary shell/PowerShell, unrestricted executables and paths, financial
  transactions, credential access, privilege elevation, and irreversible
  operations.
- Connected-service operators, broad provider-backed replanning, unsupervised
  skill/code authorship, and non-Windows hosts remain later product work.
- Execution is sequential in this release by design.

The acceptance record and engineering status are in
[`WINDOWS-1.0-PRODUCTION-COMPANION-ACCEPTANCE.md`](WINDOWS-1.0-PRODUCTION-COMPANION-ACCEPTANCE.md)
and [`PROJECT_HANDOFF.md`](../../PROJECT_HANDOFF.md).
