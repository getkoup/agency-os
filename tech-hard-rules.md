# Tech Hard Rules

This document defines the project-wide technical rules for the application.

These rules are intentionally **not domain-specific**. Business rules for dashboards, lead sources, clients, integrations, reporting, and workflows will be added later after the product scope is finalized.

## Current Locked Stack

Use this stack unless we explicitly decide otherwise.

```txt
Next.js latest App Router
TypeScript strict mode
Bun package manager and script runner
Tailwind CSS
shadcn/ui
Lucide React
Supabase Postgres/Auth/RLS
```

Supporting libraries should be added only when the need is real.

| Need | Preferred Tool |
| --- | --- |
| Forms | `react-hook-form` |
| Validation | `zod` |
| Tables | `@tanstack/react-table` |
| Charts | `recharts` through shadcn charts |
| Dates | `date-fns` |
| Toasts | shadcn `sonner` |
| Error monitoring | Sentry, later if needed |
| Analytics | PostHog, later if needed |
| Background jobs | Decide later when job requirements are known |

Hard rule:

> Do not add a dependency until the project has a real use case for it.

## Out of Scope for This File

Do not add these rules here yet:

- lead source rules
- integration-specific rules
- client-specific business rules
- dashboard-specific reporting rules
- workflow/pipeline rules
- source ingestion rules
- CRM/business process rules

Hard rule:

> This file defines technical rules only. Domain rules will be added later in separate documents or sections.

## Package Manager Rules

### Use Bun Only

Hard rule:

> Use Bun for installs, scripts, local development, and package management.

Allowed:

```txt
bun install
bun add <package>
bun run <script>
```

Not allowed:

```txt
npm install
yarn add
pnpm add
```

Hard rule:

> Do not mix lockfiles. The repo should have one package manager lockfile.

## TypeScript Rules

### Strict Mode Required

Hard rule:

> TypeScript strict mode stays enabled.

Do not weaken TypeScript config to avoid fixing errors.

### Avoid `any`

Hard rule:

> Do not use `any` unless there is a clear reason and the unsafe value is isolated.

Use `unknown` for untrusted external data, then validate and narrow it.

Good:

```ts
function parsePayload(payload: unknown) {
  return schema.parse(payload)
}
```

Bad:

```ts
function parsePayload(payload: any) {
  return payload
}
```

### Keep Types Near Their Feature

Hard rule:

> Types should live close to the feature that owns them.

Good:

```txt
features/accounts/types.ts
features/accounts/schemas.ts
```

Avoid giant files like:

```txt
types/global.ts
```

unless the types are truly global.

### Prefer Inferred Types From Schemas

When using validation schemas, infer related TypeScript types from the schema.

Good:

```ts
const createItemSchema = z.object({
  name: z.string().min(1),
})

type CreateItemInput = z.infer<typeof createItemSchema>
```

Hard rule:

> Avoid duplicating the same shape in both Zod and TypeScript manually.

## Next.js Rules

### Use App Router

Hard rule:

> Use the Next.js App Router. Do not add Pages Router patterns.

Use:

```txt
app/
  layout.tsx
  page.tsx
  route.ts
```

Do not use new `pages/` routes unless there is a documented reason.

### Server Components by Default

Hard rule:

> Components are Server Components by default.

Use Client Components only for:

- local UI state
- form state
- modals
- dropdown interaction
- browser APIs
- interactive charts
- drag and drop
- client-side subscriptions

Bad:

```tsx
"use client"

export default function WholePage() {
  // huge page that could mostly be server-rendered
}
```

Good:

```tsx
export default async function Page() {
  return <ServerRenderedView />
}
```

### Keep Page Files Thin

Hard rule:

> `page.tsx` files should compose features, not contain all business logic.

Good:

```tsx
export default async function SettingsPage() {
  return <SettingsView />
}
```

Avoid large `page.tsx` files with queries, forms, tables, and business logic all in one place.

### Route Handlers Stay Small

Hard rule:

> Route handlers should validate input, call service functions, and return responses. They should not contain large business logic.

Good flow:

```txt
route handler
  -> validate request
  -> check authorization
  -> call service
  -> return response
```

## Folder Structure Rules

Use a feature-first structure.

Recommended shape:

```txt
src/
  app/
    (auth)/
    (app)/
    api/
  components/
    ui/
    shared/
    layout/
  features/
    feature-name/
      components/
      actions.ts
      queries.ts
      schemas.ts
      types.ts
      utils.ts
  lib/
    supabase/
    validations/
    utils/
  server/
    actions/
    services/
    db/
  types/
```

Hard rule:

> Business code belongs in `features/`. Truly shared code belongs in `components/`, `lib/`, `server/`, or `types/`.

### `components/ui` Is Reserved for shadcn

Hard rule:

> `components/ui` is only for shadcn-generated primitives.

Custom app components go here instead:

```txt
components/shared/
components/layout/
features/<feature>/components/
```

### Avoid Random Utility Dumps

Bad:

```txt
lib/helpers.ts
lib/utils2.ts
lib/random.ts
```

Good:

```txt
lib/format/date.ts
lib/format/currency.ts
lib/auth/permissions.ts
```

Hard rule:

> Utility files must have a clear purpose and name.

## Component Rules

### Use shadcn First

Hard rule:

> Check shadcn/ui before building a custom primitive.

Use shadcn for common UI:

- Button
- Card
- Dialog
- Sheet
- Dropdown
- Select
- Table
- Tabs
- Badge
- Input
- Form
- Calendar
- Popover
- Command
- Skeleton
- Toast/Sonner
- Alert
- Tooltip

### Component Names Must Be Specific

Good:

```tsx
SettingsForm
UserMenu
PageHeader
StatusBadge
DataTable
```

Bad:

```tsx
Thing
Box
Stuff
MainComponent
NewComponent
```

Hard rule:

> A component name should explain what visible job it does.

### One Clear Responsibility Per Component

Hard rule:

> If a component name needs “and”, split it.

Bad:

```tsx
UserFormAndPermissionsTable
```

Good:

```tsx
UserForm
PermissionsTable
```

### Keep Components Readable

Rough guideline:

- Over 200 to 250 lines: check if the component should be split.
- Repeated JSX blocks: extract a component.
- Complex conditional rendering: extract named components or functions.

Hard rule:

> Do not keep large components just because they still work.

## Styling Rules

### Use Tailwind Consistently

Hard rule:

> Use Tailwind classes for styling unless a different approach is explicitly needed.

### Avoid Unreadable Class Strings

If classes become too long or conditional, use helpers.

Allowed:

```ts
cn("base-classes", isActive && "active-classes")
```

Hard rule:

> Styling should stay readable. Do not hide messy UI logic inside giant class strings.

### Prefer Design System Consistency

Hard rule:

> Use existing shadcn components, spacing, colors, radius, and typography before inventing new visual patterns.

## Data Access Rules

### Centralize Database Access

Bad:

```ts
supabase.from("items").select("*")
```

scattered across components.

Good:

```ts
getItems()
getItemById(id)
createItem(input)
updateItem(input)
```

Hard rule:

> Database reads and writes must go through named query/action/service functions.

### No Random Writes From UI Components

Hard rule:

> UI components should not directly perform database mutations.

Use server actions, route handlers, or service functions with validation and authorization.

### Avoid `select("*")`

Hard rule:

> Select only the columns needed for the current use case.

Bad:

```ts
select("*")
```

Good:

```ts
select("id,name,created_at")
```

### Pagination by Default for Lists

Hard rule:

> Any list that can grow must be paginated, limited, or filtered.

Do not load unbounded records by default.

## Supabase Rules

### Use Generated Types

Hard rule:

> Supabase table types should come from generated database types.

Do not manually recreate database table types unless there is a clear reason.

### Use Migrations

Hard rule:

> Database schema changes must be represented as migrations.

Manual Supabase dashboard edits are acceptable for exploration only. Final schema must be reproducible.

### Row Level Security Required for Sensitive Tables

Hard rule:

> Tables containing user, tenant, private, or business-sensitive data must use Row Level Security before production use.

### Timestamps on Important Tables

Hard rule:

> Important records should have `created_at` and `updated_at` unless there is a clear reason not to.

### Index Real Query Patterns

Hard rule:

> Any column used repeatedly for filtering, joining, or sorting at scale needs an index.

Do not add random indexes without a query need.

## Validation Rules

### Validate External Input

External input includes:

- form values
- route params
- query params
- request bodies
- webhook payloads
- file uploads
- third-party API responses
- environment variables

Hard rule:

> Anything outside our code is untrusted until validated.

### Server Validation Required

Hard rule:

> Client validation is for user experience. Server validation is mandatory.

### Validate Environment Variables

Hard rule:

> Required environment variables must be validated before use.

Do not allow missing environment variables to fail later with unclear errors.

## Security Rules

### Secrets Stay Server-Side

Hard rule:

> API keys, service role keys, tokens, and secrets must never be used in Client Components.

Only variables prefixed with `NEXT_PUBLIC_` may be exposed to the browser.

### Authorization Is Server-Side

Hard rule:

> UI hiding is not authorization. Every protected server operation must check access.

### Fail Closed

Hard rule:

> If authorization or validation is unclear, deny the operation.

### Safe User-Facing Errors

Hard rule:

> User-facing errors must not expose secrets, tokens, stack traces, or sensitive provider responses.

## Error Handling Rules

### Do Not Swallow Errors

Bad:

```ts
try {
  await doWork()
} catch {}
```

Good:

```ts
try {
  await doWork()
} catch (error) {
  throw new Error("Failed to complete operation", { cause: error })
}
```

Hard rule:

> Never silently catch errors.

### Errors Need Context

Bad:

```ts
throw new Error("Failed")
```

Good:

```ts
throw new Error(`Failed to update item ${id}`)
```

Hard rule:

> Error messages must explain what operation failed.

### Handle Errors at the Right Level

Hard rule:

> Low-level code should preserve cause/context. UI-level code should show safe, useful messages.

## State Management Rules

### Avoid Global State by Default

Hard rule:

> Do not add a global state library until local state, URL state, server state, or React context is clearly insufficient.

Preferred order:

1. Server data from Server Components.
2. URL state for filters, tabs, search, and pagination.
3. Local component state for local interaction.
4. React context for narrow shared UI state.
5. Global state library only after a real need exists.

### Put State in the URL When It Affects Navigation

Hard rule:

> Filters, search, selected tabs, pagination, and shareable view state should usually live in the URL.

## API Rules

### Validate Requests

Hard rule:

> Every route handler must validate input before using it.

### Return Consistent Responses

Hard rule:

> API responses should have a predictable shape for success and failure.

Example:

```ts
return Response.json({ data })
```

or:

```ts
return Response.json({ error: "Invalid request" }, { status: 400 })
```

### Use Correct HTTP Status Codes

Hard rule:

> Do not return `200 OK` for failed operations.

Use common status codes correctly:

```txt
400 invalid request
401 unauthenticated
403 unauthorized
404 not found
409 conflict
422 validation error
500 server error
```

## Naming Rules

### File Names

Use kebab-case.

Good:

```txt
user-menu.tsx
settings-form.tsx
data-table.tsx
```

Hard rule:

> File names use kebab-case.

### Components

Use PascalCase.

Good:

```tsx
UserMenu
SettingsForm
DataTable
```

### Functions

Use clear verb-first names.

Good:

```ts
getUser
createItem
updateSettings
validateRequest
formatCurrency
```

Hard rule:

> Function names should say what they do.

### Booleans

Use clear boolean prefixes.

Good:

```ts
isLoading
hasAccess
canEdit
shouldRefresh
```

### Avoid Vague Names

Bad:

```ts
data
item
thing
stuff
handleClick2
newFunc
```

Good:

```ts
users
settings
selectedDate
handleSaveSettings
```

Hard rule:

> Avoid vague names unless the scope is tiny and obvious.

## Testing Rules

### Test Important Behavior

Hard rule:

> Test logic that can lose data, leak data, corrupt data, duplicate data, misprice data, misreport data, or break authorization.

Good test targets:

- validation schemas
- permission helpers
- data normalization
- calculations
- state transitions
- service functions
- error branches

### Avoid Low-Value Tests

Bad:

```ts
expect(button).toBeInTheDocument()
```

when it proves no meaningful behavior.

Hard rule:

> Tests should protect behavior, not implementation details.

### Regression Tests for Bugs

Hard rule:

> If a bug can happen again, add a regression test when practical.

## Performance Rules

### Prefer Server Work When Possible

Hard rule:

> Fetch and prepare data on the server unless the UI specifically needs client-side behavior.

### Avoid Unbounded Work

Hard rule:

> Do not fetch, render, map, or transform unbounded datasets by default.

Use limits, pagination, streaming, filtering, or background processing.

### Avoid Avoidable Re-Renders

Hard rule:

> Do not move state higher than necessary.

Keep state close to where it is used.

### Avoid Premature Optimization

Hard rule:

> Optimize real bottlenecks, not imagined ones.

Still avoid obviously wasteful code.

## Accessibility Rules

Hard rule:

> Interactive UI must be keyboard-accessible and screen-reader understandable.

Use semantic HTML and shadcn primitives where possible.

Minimum expectations:

- buttons are buttons
- links are links
- inputs have labels
- dialogs manage focus
- destructive actions are clear
- color is not the only signal

## Documentation and Comments Rules

### Comments Explain Why

Bad:

```ts
// Increment count
count++
```

Good:

```ts
// The provider may retry requests, so this operation must be idempotent.
```

Hard rule:

> Comments should explain business rules, edge cases, constraints, or non-obvious decisions.

### No Dead Comments

Hard rule:

> Delete commented-out code instead of keeping it.

Use version control for history.

## Maintainability Rules

### No Premature Abstractions

Hard rule:

> Do not create generic abstractions until at least two real use cases exist.

Bad early abstraction:

```ts
UniversalEntityManagerFactory
```

Good first implementation:

```ts
createUser
updateUser
```

Abstract later only when repeated patterns are real.

### Remove Dead Code

Hard rule:

> Remove unused components, helpers, types, routes, and exports.

### Follow Existing Patterns

Hard rule:

> Before adding a new pattern, check existing code and follow it unless there is a clear reason to change.

### Prefer Boring Code

Hard rule:

> Use clear, predictable code over clever code.

If code needs a long explanation to be understood, simplify it.

## Final Rule Summary

1. Use Next.js App Router, TypeScript strict mode, Bun, Tailwind, shadcn/ui, Lucide, and Supabase.
2. Use Bun only. Do not mix package managers.
3. Use Server Components by default.
4. Use Client Components only when interaction requires them.
5. Keep `page.tsx` files thin.
6. Keep route handlers small.
7. Use feature-first folder structure.
8. Keep `components/ui` only for shadcn primitives.
9. Use shadcn before building custom UI primitives.
10. Keep types close to their feature.
11. Validate external input with server-side validation.
12. Use `unknown` before validation, not `any`.
13. Use generated Supabase types.
14. Use database migrations.
15. Use RLS for sensitive data before production.
16. Centralize database access through named functions.
17. Do not mutate the database directly from random UI components.
18. Avoid `select("*")` in production queries.
19. Paginate or limit growing lists.
20. Keep secrets server-side.
21. Check authorization on the server.
22. Never silently catch errors.
23. Use clear names for files, components, functions, and booleans.
24. Put shareable UI state in the URL when appropriate.
25. Avoid global state until there is a real need.
26. Test important behavior, not implementation details.
27. Use semantic, accessible UI.
28. Delete dead code and commented-out code.
29. Avoid premature abstractions.
30. Prefer boring, maintainable code.

## Later Documents To Add

Create separate rules later for:

- product/domain rules
- data model rules
- client/tenant rules, if needed
- integration/source rules, once sources are known
- reporting/dashboard rules, once reporting is defined
- workflow/status rules, once business process is clear
- deployment rules
- monitoring/observability rules
