# Security policy

## Supported versions

Only the latest `main` is actively maintained. If you run a fork or an old
deployment, please verify the issue against current `main` first.

## Reporting a vulnerability

Please **do not open a public issue** for security problems. Instead, use
**GitHub Security Advisories** (Security tab → Report a vulnerability) on this
repository so the report stays private until a fix ships.

Include, when possible:

- Affected version or commit, browser and environment.
- Steps to reproduce and impact (what can an attacker do?).
- Whether IndexedDB data, backups or Supabase copies are involved.

You will get an initial response as fast as the maintainer can manage;
critical data-loss or data-exposure issues are prioritized.

## Scope notes

Neuronow is local-first: notes live in the browser's IndexedDB and optional
Markdown folders/Supabase copies chosen by the user. Reports about the demo
deployment breaking its own sandbox are welcome; reports that require the
victim to paste secrets into notes are not in scope (never put secrets in
notes, configs or the Git history).
