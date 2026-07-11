# AGENTS.md

## Scope

- Agent rules for this repo.
- Full tech detail: `tech-hard-rules.md`.
- Keep this file short. Move long rules to `tech-hard-rules.md`.
- No product, source, client, workflow, or dashboard rules here yet.

## Stack

- Use the T3 Stack with Tailwind, shadcn/ui, Lucide, and Postgres.
- Use Bun only. No npm, yarn, pnpm, or mixed lockfiles.
- Add a dependency only when a real need exists.

## Code Style

- Boring code wins. Clear names. Small files. One job per function or component.
- Server Components default. Use `"use client"` only for interaction or browser APIs.
- Feature code lives in `features/<name>`.
- Shared UI lives in `components/`; shadcn primitives live only in `components/ui`.
- Check shadcn/ui before building a custom component. Use the shadcn component when one exists.
- Use tRPC for the application's typed API boundary.
- No `any`; use `unknown`, then validate and narrow.
- Infer types from Zod, tRPC, and Drizzle when possible.
- Validate external input on the server.
- Centralize database access in named query, action, or service functions.
- No direct database mutations from UI components.
- Select only required database columns.
- Growing lists need limits, filters, or pagination.
- Secrets stay server-only. `NEXT_PUBLIC_*` only for browser-safe environment values.
- Auth checks happen server-side. UI hiding is not authorization.
- Never swallow errors. Add context and preserve cause.
- No premature abstraction. Need two real use cases first.
- Delete dead code, unused exports, and commented-out code.
- Comments explain why, not what.

## Workflow

- Read nearby code before editing. Follow existing patterns.
- Prefer editing existing files over creating new ones.
- Keep changes minimal, complete, and reversible.
- Run focused checks for the changed area.
- Fix failing types and tests. Never disable them to pass.
- Text files end with newline.
