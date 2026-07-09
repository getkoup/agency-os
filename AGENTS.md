# AGENTS.md

## Scope

- Agent rules for this repo.
- Full tech detail: `tech-hard-rules.md`.
- Keep this file short. Move long rules to `tech-hard-rules.md`.
- No product, source, client, workflow, or dashboard rules here yet.

## Stack

- Use Next.js App Router, TypeScript strict mode, Bun, Tailwind, shadcn/ui, and Supabase.
- Use Bun only. No npm, yarn, pnpm, or mixed lockfiles.
- Add dependency only when real need exists.

## Code Style

- Boring code wins. Clear names. Small files. One job per function/component.
- Server Components default. Use `"use client"` only for interaction or browser APIs.
- Feature code lives in `features/<name>`.
- Shared UI lives in `components/`; shadcn primitives only in `components/ui`.
- Use shadcn before custom UI primitives.
- No `any`; use `unknown`, then validate and narrow.
- Infer types from Zod and Supabase when possible.
- Validate external input on server.
- Centralize DB access in named query/action/service functions.
- No direct DB mutations from random UI components.
- No `select("*")` unless justified.
- Growing lists need limits, filters, or pagination.
- Secrets stay server-only. `NEXT_PUBLIC_*` only for browser-safe env.
- Auth checks happen server-side. UI hiding is not auth.
- Never swallow errors. Add context and preserve cause.
- No premature abstraction. Need two real use cases first.
- Delete dead code, unused exports, and commented-out code.
- Comments explain why, not what.

## Workflow

- Read nearby code before editing. Follow existing patterns.
- Prefer editing existing files over creating new ones.
- Keep changes minimal, complete, and reversible.
- Run focused checks for changed area.
- Fix failing types/tests. Never disable them to pass.
- Text files end with newline.
