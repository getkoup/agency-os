# Sales & Commission Tracking Plan

## Recommendation

Build this as a new sidebar destination, separate from the existing Sales Tracking and Revenue pages:

- **Sales Tracking** continues measuring client booking goals.
- **Revenue** continues estimating revenue from won GHL opportunity tags.
- **Sales & Commissions** handles salesperson attribution, appointment offers, show/no-show revenue, and commissions.

## Current system findings

The existing application already provides much of the required foundation:

- Appointments, statuses, dates, contacts, and client timezones are stored.
- Contact names can be displayed as the lead/customer name.
- Appointment statuses include `showed`, `noshow`, `confirmed`, `cancelled`, and others.
- Existing date controls support:
  - Last 3 days
  - Last 7 days
  - Last 14 days
  - Last 30 days
  - This month
  - Previous month
  - Custom ranges
- Campaign Tracker provides the collapsible client-box layout required for this feature.

However, the current GHL parser strips the fields needed for commission tracking.

A read-only production inspection found:

- 7,945 stored appointments across 32 GHL locations.
- GHL events provide `description`, `notes`, `assignedUserId`, and `createdBy` fields.
- The application currently discards those fields before persistence.
- `assignedUserId` was present on all 55 appointments sampled.
- `createdBy.userId` was present on 33 of 55 sampled appointments; widget-created appointments often do not have a human creator.
- Description or notes were present on 39 of 55 sampled appointments.

Missing descriptions and salesperson attribution must therefore remain visible as exceptions instead of being silently excluded.

## 1. Business model

### Salesperson

A GHL user credited with booking an appointment. Salespersons are scoped to a client because the same person may work in multiple client locations.

Use the external GHL user ID as identity rather than the salesperson's name. Names can change or collide.

### Service Category

The category used to calculate commission, such as:

- Tint
- Ceramic
- Detailing
- PPF
- Vinyl
- Any additional user-created category

### Offer

A client-specific package detected from the appointment description.

| Offer | Category | Match text | Attributed revenue |
| --- | --- | --- | ---: |
| Ceramic $299 | Ceramic | `299`, `NC299` | $299 |
| Ceramic $499 | Ceramic | `499` | $499 |
| Tint Special | Tint | `tint special` | $250 |

Separating **Offer** from **Service Category** is important. A client may have several Ceramic offers with different prices while the salesperson receives the same Ceramic commission.

### Commission Rate

A fixed amount for a particular Client + Salesperson + Service Category combination.

| Salesperson | Tint | Ceramic | Detailing | PPF |
| --- | ---: | ---: | ---: | ---: |
| Salesperson A | $10 | $20 | $15 | $30 |
| Salesperson B | $8 | $15 | $12 | $25 |

### Appointment Evaluation

The stored result of evaluating an appointment:

- Credited salesperson
- Matched offer
- Service category
- Attributed revenue
- Potential missed revenue
- Earned commission
- Classification state
- Rules used for the calculation

This provides an auditable financial ledger.

## 2. Appointment calculation rules

### Recommended status treatment

| Appointment status | Count booking? | Attributed revenue | Missed revenue | Commission | Presentation |
| --- | ---: | ---: | ---: | ---: | --- |
| `showed` | Yes | Offer value | $0 | Category rate | Green/normal |
| `noshow` | Yes | $0 | Offer value | $0 | Red |
| Future `new`/`confirmed` | Yes | $0 | $0 | $0 | Pending |
| Past `new`/`confirmed` | Yes | $0 | Optional | $0 | Needs status review |
| `cancelled` | Optional | $0 | Usually $0 | $0 | Grey |
| `invalid` | No | $0 | $0 | $0 | Grey |
| Deleted | No | $0 | $0 | $0 | Hidden |

Only definite `noshow` appointments should be marked red by default. A future confirmed appointment should not look like lost revenue.

### Example calculation

Appointment:

- Client: Tint Lab
- Salesperson: A
- Description: `NC299 Ceramic Package`
- Status: `showed`

Result:

- Offer: Ceramic $299
- Category: Ceramic
- Attributed revenue: $299
- Commission: $20

If the same appointment becomes `noshow`:

- Attributed revenue: $0
- Potential missed revenue: $299
- Commission: $0
- Row shown in red

If Salesperson A has three showed Tint jobs at $10 and two showed Ceramic jobs at $20:

> Commission = 3 × $10 + 2 × $20 = **$70**

## 3. Description classification rules

Each client receives independent offer rules.

### Matching behavior

1. Normalize case, punctuation, and spacing.
2. Perform safe literal matching rather than arbitrary regular expressions.
3. Allow multiple matching terms per offer.
4. Support contains matching so `299` can match `NC299`.
5. Evaluate higher-priority offers first.
6. Return exactly one winning result.

Possible outcomes:

- **Matched:** One winning offer.
- **Uncategorized:** Nothing matched.
- **Ambiguous:** Multiple offers matched at the same priority.
- **Missing description:** No usable classification text was received.

Uncategorized and ambiguous appointments remain visible in a **Needs Review** view with zero calculated commission until corrected.

Classification text should use the following order:

1. Appointment description
2. Appointment notes
3. Appointment title as a fallback

The configured offer value, not an arbitrary number extracted from text, determines attributed revenue. This prevents phone numbers or unrelated numbers from being treated as prices.

## 4. Determining the salesperson

Store both GHL identity fields:

- `createdBy.userId`
- `assignedUserId`
- `createdBy.source`

These fields have different meanings:

- `createdBy.userId` generally identifies the staff member who created the appointment.
- `assignedUserId` identifies the assigned user and may not be the person who booked it.
- Widget bookings may have no human `createdBy.userId`.

Recommended default attribution policy:

1. Credit `createdBy.userId` when present.
2. Otherwise place the appointment under `Booking Widget / Unassigned`.
3. Allow each client to configure `assignedUserId` as the fallback if that reflects its workflow.
4. Allow an authorized manual salesperson override with a required reason.

Before implementation, compare several real appointments against GHL manually to confirm which field represents “Booked by” for each client workflow.

## 5. Database additions

### Extend stored appointments

Add nullable fields to the existing appointment table:

- Description
- Notes
- Assigned GHL user ID
- Created-by GHL user ID
- Created-by source
- Enrichment version/time

### Salespersons

Store:

- Client
- GHL user ID
- Display name
- Active/inactive state
- First and last observed timestamps
- Attribution source

Create or update a salesperson automatically when observed during synchronization.

### Service categories

Store:

- Client
- Name
- Display order
- Active/inactive state
- Created and updated timestamps

Category names should be unique per client, case-insensitively.

### Offers

Store:

- Client
- Service category
- Offer name
- Match keywords or phrases
- Match mode
- Priority
- Attributed revenue
- Effective date
- Active/inactive state

### Salesperson commission rates

Store:

- Salesperson
- Service category
- Fixed commission amount
- Effective-from date
- Optional effective-to date

Effective dates prevent a new commission rate from silently rewriting previous months.

### Appointment evaluations

Store one row per appointment containing:

- Salesperson
- Offer and category
- Classification state
- Revenue snapshot
- Missed-revenue snapshot
- Commission snapshot
- Whether attribution was automatic or manually overridden
- Evaluation timestamp
- Rule references
- Override reason and operator when applicable

This projection makes reporting fast and keeps financial results auditable.

### Optional commission periods

If “commission received” means actual payment tracking, add commission periods later with:

- Draft status
- Approved status
- Paid status
- Payment date and reference
- Adjustment amount and reason
- Locked calculation results

Until payment tracking exists, the dashboard should label the value **Earned Commission**, not Paid Commission.

Likewise, offer-derived revenue should be labelled **Attributed Revenue**, not collected revenue.

## 6. Synchronization changes

1. Extend the GHL validation schema to retain the additional event fields.
2. Persist description, notes, creator ID, assignee ID, and creator source.
3. Fetch the GHL user roster once per client/location to resolve IDs to names.
4. Upsert observed salespersons without deleting historical staff.
5. Evaluate only appointments that are new or changed.
6. Re-evaluate when an appointment status changes, such as confirmed to showed or noshow.
7. Keep all processing bounded, checkpointed, and resumable.

Existing appointments require a controlled backfill because all existing records currently lack these stripped fields.

Recommended backfill process:

- Run client-by-client.
- Use existing calendar windows and checkpoints.
- Pilot one client first.
- Reconcile the results manually.
- Continue through the remaining clients.
- Avoid one unbounded all-client job because the worker has already shown memory pressure during large runs.

The sampled event-list endpoint already includes the required fields, so most appointments should not require an additional appointment-detail request.

## 7. Dashboard experience

### New sidebar destination

Add a new destination named **Sales & Commissions**.

Recommended access:

- Owner: View and configure
- Admin: View and configure
- Manager: View only
- Client users: Hidden initially; membership-scoped access can be added later

### Filters

Provide filters for:

- Date preset or custom dates
- Client
- Salesperson
- Appointment status
- Category
- Classification state
- Lead/customer name search

Use the appointment start date in each client's timezone by default. Also display the booking-created date in the appointment ledger.

### Top-level metrics

Show:

- Total appointments booked
- Showed appointments
- No-shows
- Show rate
- Attributed revenue
- Potential missed revenue
- Earned commission
- Appointments needing review

### Client sections

Use collapsible client boxes like Campaign Tracker.

Each client header shows:

- Total bookings
- Showed and no-show totals
- Show rate
- Attributed revenue
- Potential missed revenue
- Earned commission
- Number of salespersons

### Salesperson summary

Inside each client section:

| Salesperson | Booked | Showed | No-show | Show rate | Revenue | Missed | Commission |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |

Expanding a salesperson shows:

- Category counts
- Category revenue
- Category commission
- Appointment ledger

### Appointment ledger

Recommended columns:

- Appointment date
- Booking-created date
- Lead/customer
- Salesperson
- Status
- Description
- Matched offer
- Category
- Attributed revenue
- Potential missed revenue
- Commission
- Classification warning

No-show appointments should have a red row or background. All growing ledgers must be paginated.

## 8. Configuration experience

Provide a protected **Setup** area inside the new feature.

### Categories and offers

For a selected client, authorized users can:

- Add, edit, deactivate, or reorder categories
- Add offers under categories
- Enter matching words or phrases
- Set rule priority
- Set attributed revenue
- Preview classification against recent appointment descriptions
- See ambiguous-pattern warnings before saving

### Commission matrix

Use a matrix for fast editing:

- Rows: Salespersons
- Columns: Service categories
- Cells: Fixed commission amounts

| Salesperson | Tint | Ceramic | Detailing |
| --- | ---: | ---: | ---: |
| A | $10 | $20 | $15 |
| B | $8 | $15 | $12 |

Changes should request an effective date rather than rewriting historical calculations.

### Needs Review

Display appointments with:

- Unassigned salesperson
- Missing description
- Uncategorized offer
- Ambiguous offer
- Missing commission rate
- Past appointments still marked confirmed or new

Authorized users can apply manual overrides with an audit reason.

## 9. Code organization

Keep the implementation inside a focused feature module:

```text
src/app/dashboard/sales-commissions/
src/features/sales-commissions/
  calculations.ts
  server/queries.ts
  server/actions.ts
  sales-commission-filters.tsx
  client-section.tsx
  salesperson-summary.tsx
  appointment-ledger.tsx
  commission-matrix.tsx
src/server/api/routers/sales-commissions.ts
```

The central deep module should expose a small interface resembling:

```ts
evaluateSalesAppointment(appointment, policy): AppointmentEvaluation
```

It should own:

- Text normalization
- Offer matching
- Ambiguity detection
- Salesperson attribution
- Status treatment
- Money calculations
- Commission resolution

Pages and database queries should not duplicate these rules.

## 10. Test plan

### Calculation tests

- `299` matches `NC299`.
- Matching is case-insensitive.
- Client A's `299` rule does not affect Client B.
- A higher-priority offer wins.
- Equal-priority conflicting offers become ambiguous.
- Missing descriptions remain visible.
- A showed appointment earns attributed revenue and commission.
- A no-show earns zero commission and records potential missed revenue.
- A missing commission rate does not erase attributed revenue.
- Three $10 Tint commissions plus two $20 Ceramic commissions equal $70.

### Synchronization tests

- Description and user fields survive Zod parsing.
- Creator and assignee IDs persist.
- Salespersons are upserted by external ID.
- A changed display name does not create a duplicate salesperson.
- Widget-created appointments remain unassigned.
- Appointment status changes recalculate the evaluation.
- Restarting from a checkpoint does not duplicate credits.

### Query and access tests

- Client-local date boundaries are correct.
- Client, salesperson, status, and category filters work.
- Ledgers are paginated and bounded.
- Owner and admin roles can mutate configuration.
- Manager is read-only.
- Client role is denied until scoped access is deliberately enabled.

### Migration and acceptance tests

- Existing appointments remain valid after nullable columns are added.
- Existing Sales Tracking and Revenue pages remain unchanged.
- Validate one real client manually before exposing the sidebar destination.

## 11. Safe rollout order

1. Confirm salesperson attribution and status/date policies.
2. Add additive database tables and nullable appointment fields.
3. Extend GHL parsing and salesperson synchronization.
4. Build and test the classification and calculation module.
5. Build categories, offers, and commission setup.
6. Run a controlled backfill for one pilot client.
7. Reconcile results against GHL and manual calculations.
8. Build the reporting page while keeping it unlinked.
9. Backfill remaining clients in bounded batches.
10. Expose the new sidebar destination.
11. Add commission payout periods only if actual paid/unpaid tracking is required.

The additive design keeps existing dashboards and synchronization behavior isolated and provides a straightforward rollback path.

## Decisions to confirm before implementation

Recommended defaults:

1. **Credited salesperson:** Use `createdBy.userId`; do not automatically fall back unless configured per client.
2. **Reporting date:** Use the appointment start date in client-local time.
3. **No-show treatment:** Only `noshow` is red/missed; cancelled and future confirmed appointments are not.
4. **Commission type:** Fixed USD amount per service category.
5. **Revenue:** Use configured offer value instead of arbitrary number parsing.
6. **History:** Use effective-dated rules with auditable calculation snapshots.
7. **Page access:** Owner, admin, and manager can view; only owner and admin can configure.
