# Windsor Data Model Reference

## Purpose

This document records the current understanding of the Windsor lead and advertising-performance datasets. Update it as product and data-model decisions are made.

Status: **Implemented for phase one**

Last reviewed: **2026-07-12**

## Security

- The Windsor API key is a server-only secret.
- Never commit the API key or place it in a `NEXT_PUBLIC_*` variable.
- Never request Windsor data directly from a browser or Client Component.
- Rotate any key that has been exposed in a URL, chat, browser history, or logs.

## Current Sources

Both sources use the Windsor `/all` endpoint with `date_preset=last_7d` and an account filter. The API key is intentionally omitted here.

### Important import requests

These are the two canonical phase-one imports. `WINDSOR_API_KEY` is read from
the server environment; never paste a real key into source code, documentation,
browser code, or a committed `.env` file.

Advertising performance:

```txt
https://connectors.windsor.ai/all?api_key=${WINDSOR_API_KEY}&date_preset=last_7d&fields=date,account_id,account_name,campaign_id,campaign,adset_id,adset_name,ad_id,ad_name,spend,actions_onsite_conversion_messaging_conversation_started_7d,actions_onsite_conversion_total_messaging_connection,actions_post_engagement,link_clicks,actions_lead,actions_leadgen_grouped,cost_per_action_type_lead,cpc,ctr&select_accounts=facebook__2298991543451560,facebook__3936585339919458,facebook__947049041046274
```

Leads:

```txt
https://connectors.windsor.ai/all?api_key=${WINDSOR_API_KEY}&date_preset=last_7d&fields=id,created_time,account_id,account_name,campaign_id,campaign,adset_id,adset_name,ad_id,ad_name,form_id,email,full_name,phone,phone_number&select_accounts=facebook_leads__1084237868095826,facebook_leads__1749361305140569,facebook_leads__454302567777196
```

The stable ID fields shown here are required by the importer even when a
display-only Windsor URL omits them.

### Lead source

Selected connectors:

```txt
facebook_leads__1084237868095826
facebook_leads__1749361305140569
facebook_leads__454302567777196
```

Requested fields:

```txt
id
created_time
account_id
account_name
campaign_id
campaign
adset_id
adset_name
ad_id
ad_name
form_id
email
full_name
phone
phone_number
```

### Advertising-performance source

Selected connectors:

```txt
facebook__2298991543451560
facebook__3936585339919458
facebook__947049041046274
```

Requested fields:

```txt
date
account_name
ad_name
adset_name
campaign
spend
actions_onsite_conversion_messaging_conversation_started_7d
actions_onsite_conversion_total_messaging_connection
actions_post_engagement
link_clicks
actions_lead
actions_leadgen_grouped
cost_per_action_type_lead
cpc
ctr
```

## Observed Dataset Shape

The following observations came from successful GET requests on 2026-07-12. The requested `last_7d` period covered 2026-07-04 through 2026-07-10 in both filtered responses.

### Leads

| Measurement | Observed value |
| --- | ---: |
| Rows | 555 |
| Accounts | 3 |
| Campaigns | 11 |
| Ad-set names | 38 |
| Unique `adset_id` values | 45 |
| Ads | 33 |
| Forms | 11 |

The natural lead grain is one row per captured lead.

```txt
Lead
├── created_time
├── account_name
├── campaign
├── adset_name
├── adset_id
├── ad_name
├── form_id
├── full_name
├── email
└── phone_number
```

Observed completeness:

- All 555 rows have `created_time`.
- All 555 rows have `phone_number`.
- 382 rows have `email`; 173 do not.
- 220 rows have `full_name`; 335 do not.
- `phone` is empty in every row; `phone_number` is the populated phone field.
- There are 551 unique normalized phone numbers.
- Approximately three rows are duplicates when deduplicated by normalized phone number.


Lead identity preflight, repeated on 2026-07-12 across the three selected
Facebook Leads connectors for the UTC-backed `last_7d` response:

- `id` was non-null in 555/555 rows and unique in 555/555 rows.
- `account_id` was non-null in 555/555 rows.
- Every returned `account_id` equaled the numeric suffix of its selected
  `facebook_leads__…` connector.
- `campaign_id` was non-null in 555/555 rows.
- `ad_id` was null in 555/555 rows; all reviewed ads resolved uniquely beneath
  their `adset_id` by `ad_name`.
- `created_time` included an explicit `+0000` UTC offset.

The implementation therefore uses Windsor `id` as the required source-scoped
lead identity and treats a missing ID or connector/account mismatch as a batch
failure. It never invents an identity from contact information.
### Advertising performance

| Measurement | Observed value |
| --- | ---: |
| Rows | 399 |
| Accounts | 3 |
| Campaigns | 18 |
| Ad sets | 64 |
| Ads | 56 |
| Spend | $10,280.46 |
| Platform lead actions | 575 |
| Messaging conversations started | 424 |

The apparent natural grain is:

```txt
one row per date + account + campaign + ad set + ad
```

No duplicate rows were found at that grain in the reviewed response.

## Entity Relationship

```txt
Ad account
└── Campaign
    └── Ad set
        └── Ad
            ├── Daily advertising-performance rows
            └── Individual lead rows
```

Observed overlap:

- All 11 lead-side campaigns exist in the performance dataset.
- All 38 lead-side ad-set names exist in the performance dataset.
- All 33 lead-side ad names exist in the performance dataset.
- All 555 lead rows match a performance hierarchy after account-name normalization.

## Known Join Problems

### Account names are inconsistent

| Leads endpoint | Performance endpoint |
| --- | --- |
| `Tint Lab` | `Tintlab` |
| `719AutoCustoms` | `719 Auto Customs` |
| `Diamond Auto Restoration` | `Diamond Auto Restoration ` |

Exact account-name joins therefore fail. Trimming whitespace and normalizing case and punctuation makes the current values match, but normalized names are not safe permanent identifiers.

### Ad-set names are not unique

The lead response contains 38 ad-set names but 45 unique `adset_id` values. Multiple source ad sets can therefore share a display name.

Do not use `adset_name` as a database identity or permanent join key.

### Performance data provides stable entity IDs

The performance request was retested with:

```txt
account_id
campaign_id
adset_id
ad_id
```

Windsor returned every field for every row. The response contained 3 accounts, 18 campaigns, 77 ad sets, 96 ads, and 452 daily performance rows. No duplicate rows existed at:

```txt
date + account_id + campaign_id + adset_id + ad_id
```

All 45 lead-side `adset_id` values appeared in performance data, and all 555 lead rows matched through `adset_id`. No parent relationship conflicts were found from campaign to account, ad set to campaign, or ad to ad set.

Stable source IDs should therefore be used for entity identity and joins. Names are display attributes only.

## Agreed Provider-Neutral Schema

This is the implemented phase-one schema. Windsor.ai is the current data provider. The underlying advertising platform may be Facebook, Google Ads, or another Windsor-supported platform.

```txt
users
- id
- name
- email
- role (`agency_admin` or `client_viewer`)
- password_hash nullable; seeded credentials use bcrypt cost 12

clients
- id
- name
- status
- created_at
- updated_at

client_memberships
- user_id
- client_id

source_accounts
- id
- client_id nullable
- data_provider
- platform
- connector
- connector_account_id
- external_account_id
- external_account_name
- normalized_name
- status
- first_seen_at
- last_seen_at
- last_synced_at

campaigns
- id
- source_account_id
- external_id
- name
- objective
- status

ad_groups
- id
- campaign_id
- external_id
- name
- status

ads
- id
- ad_group_id
- external_id
- name
- status

lead_forms
- id
- source_account_id
- external_id
- name

leads
- id
- source_account_id
- external_id required
- campaign_id nullable
- ad_group_id nullable
- ad_id nullable
- lead_form_id nullable
- occurred_at
- full_name nullable
- email nullable
- phone_number nullable
- raw_payload
- created_at
- updated_at

ad_performance_daily
- id
- source_account_id
- campaign_id
- ad_group_id
- ad_id
- date
- currency
- spend
- impressions
- reach
- clicks
- link_clicks
- engagements
- conversions
- leads
- messaging_conversations
- provider_metrics
- raw_payload
- created_at
- updated_at
```

Provider terminology maps into the neutral hierarchy:

```txt
Facebook ad set → ad_groups
Google ad group → ad_groups
```

Expected cardinality:

```txt
users          many ── many clients through client_memberships
clients        1 ── many source_accounts
source_accounts 1 ── many campaigns
campaigns      1 ── many ad_groups
ad_groups      1 ── many ads
ads            1 ── many leads
ads            1 ── many ad_performance_daily rows
lead_forms     1 ── many leads
```

Source identities must be scoped and unique:

```txt
source_accounts: unique(data_provider, connector, external_account_id)
campaigns:       unique(source_account_id, external_id)
ad_groups:       unique(campaign_id, external_id)
ads:             unique(ad_group_id, external_id)
performance:     unique(ad_id, date)
```

Names are display attributes, never permanent identifiers. Common cross-platform metrics use normalized columns. Windsor- or platform-specific metrics belong in `provider_metrics`; the original record belongs in `raw_payload`.

## Account Discovery and Client Assignment

Users are people authenticated through the application. Clients are managed businesses. Source accounts are advertising or lead accounts discovered through Windsor. A source account never creates an application user.

Synchronization flow:

```txt
Discover Windsor connector accounts
→ upsert source_accounts by stable external identity
→ suggest an existing client using normalized names
→ assign automatically only when a stored mapping exists
→ otherwise leave client_id null for owner review
→ synchronize campaigns, ad groups, ads, performance, and leads
```

Fixed `select_accounts` URLs do not discover newly connected accounts. Account discovery should use Windsor connector options or an equivalent account-listing request, after which data requests are built from active source accounts.

If a source account disappears from Windsor, mark it inactive or disconnected. Do not delete its client, leads, or historical performance.

### Approved account-assignment workflow

```txt
Windsor discovers a source account
→ Agency OS stores it as unassigned when no fixed mapping exists
→ owner sees it under Unassigned accounts
→ owner selects an existing client or creates a client
→ owner assigns the source account to that client
→ owner creates or selects one or more client users
→ owner grants those users membership in the client
→ client users receive access to every source account owned by that client
```

Permissions are client-based rather than directly attached to each advertising
account:

```txt
user → client_memberships → client → source_accounts
```

For example, membership in Tint Lab grants access to its Facebook Ads,
Facebook Leads, and future Google Ads source accounts. A newly connected
source account becomes available to those users when the owner assigns it to
Tint Lab; the owner does not need to recreate per-user account permissions.

Changing `source_accounts.client_id` changes access immediately. Historical
performance and leads remain owned through their source account and move with
that assignment. Removing a client membership immediately removes that user's
access without deleting source data.

### Planned navigation by role

```txt
Owner  → Dashboard, Clients, Advertising Accounts, Unassigned Accounts,
         Users & Access, Synchronization
Admin  → Dashboard, Clients, Advertising Accounts, Synchronization
Client → Dashboard, Advertising Accounts, Leads
```

The owner interface exposes assignment actions. Admin and client responses
must not include those actions or user-assignment information.

## Access and Analytics Rules

### Current implementation

Phase one currently has two database roles:

```txt
agency_admin  → all assigned and unassigned source data
client_viewer → only data belonging to clients in their memberships
```

`source_accounts.client_id = null` means unassigned, not hidden.
Agency-wide analytics include this data under **Unassigned accounts**.
Unassigned data never contributes to a specific client's analytics and is
never visible to client users.

### Approved proper-dashboard role model

The next dashboard iteration will replace the two-role model with three roles:

```txt
owner
admin
client
```

This is an approved design but is not implemented yet.

| Capability | Owner | Admin | Client |
| --- | :---: | :---: | :---: |
| View all assigned advertising data | Yes | Yes | No |
| View unassigned account data | Yes | Yes | No |
| View data for membership clients | Yes | Yes | Yes |
| View user and client-membership assignments | Yes | No | No |
| Create or invite users | Yes | No | No |
| Change roles or disable users | Yes | No | No |
| Assign source accounts to clients | Yes | No | No |
| Assign users to clients | Yes | No | No |
| Change permissions | Yes | No | No |

#### Owner

The owner has complete agency access. The owner can see every assigned and
unassigned source account, all performance and lead data, all users, and all
client memberships. Only an owner can create users, change roles, disable
users, assign source accounts to clients, and add or remove client
memberships.

#### Admin

An admin has agency-wide read access to assigned and unassigned advertising
data. An admin cannot see user-management or membership-assignment information
and cannot create users, change roles, assign accounts, assign memberships, or
modify permissions. Account assignment controls must not be returned by the
server or rendered in the admin interface.

#### Client

A client user can access only clients listed in their
`client_memberships`. The client can see only source accounts, performance,
and leads belonging to those clients. A client can never access unassigned
accounts, other clients, agency-wide totals, user management, or permission
controls. Server-side scope checks enforce this even when a user manually
changes a URL or tRPC input.

### Authorization path

Every protected data request follows this path:

```txt
authenticated session
→ load current user and current role from PostgreSQL
→ resolve authorized client memberships
→ restrict through source_accounts.client_id
→ query performance or leads
→ return only authorized rows and filter options
```

The database role is authoritative. JWT role values are session/display hints
and must not authorize requests.

## Initial Data Rules

These rules are implemented for phase one:

1. Treat a lead response row as an individual captured lead.
2. Use `phone_number`; treat `phone` as unavailable for the reviewed source.
3. Normalize phone numbers before deduplication or matching.
4. Normalize emails to lowercase before deduplication or matching.
5. Do not require `email` or `full_name`; both can be absent.
6. Do not identify entities by display names.
7. Store source IDs whenever Windsor provides them.
8. Keep daily performance separate from individual leads.
9. Do not compare messaging campaigns and lead-form campaigns using one conversion metric.
10. Preserve the raw source timestamps and record synchronization time separately.

## Open Questions

- What are the exact Windsor field mappings for Google Ads connectors?
- What timezone should account-level reporting use beyond storing lead instants
  and interpreting phase-one dashboard date boundaries in UTC?
- Are late-arriving leads or performance corrections expected beyond the
  rolling seven-day resynchronization?
- Which conversion metric defines success for each campaign type?
- Which scheduler should invoke the server-only synchronization command?
- How long should personally identifiable lead data be retained?

## Decision Log

### 2026-07-12

- Confirmed that the filtered lead and performance datasets share the same campaign, ad-set, and ad hierarchy.
- Confirmed that account names require normalization but should not become permanent join keys.
- Confirmed that ad-set names are not unique.
- Proposed a normalized relational model separating source entities, individual leads, and daily performance.
- Confirmed that Windsor returns `account_id`, `campaign_id`, `adset_id`, and `ad_id` in performance data.
- Confirmed that all 555 reviewed leads match performance data through `adset_id`.
- Adopted stable source IDs instead of normalized names as the intended relationship keys.
- Adopted a provider-neutral hierarchy so Windsor Facebook, Google Ads, and future platforms share the same core schema.
- Separated authenticated users, managed clients, and Windsor-discovered source accounts.
- Decided that synchronization automatically upserts new source accounts but does not automatically create users.
- Decided that uncertain client mappings remain unassigned with `client_id = null` until an agency admin assigns or merges them.
- Decided that agency admins can analyze unassigned data, while client users can access only their assigned clients.
- Implemented the provider-neutral schema, seeded credentials, `agency_admin` and `client_viewer` authorization, and source-account-derived client isolation.
- Implemented server-only all-account Windsor discovery and idempotent `last_7d` synchronization; only the six known source accounts auto-assign to the three mapped clients.
- Implemented the phase-one dashboard with UTC date, client, platform, and campaign filters; spend, platform leads, captured leads, messaging conversations, and link-click KPIs; and paginated performance and lead tables.
- Approved the next dashboard authorization model with `owner`, `admin`, and
  `client` roles; this supersedes the two-role model as the target design but
  is not implemented yet.
- Approved owner-only user management, client membership management, and
  source-account-to-client assignment.
- Approved agency-wide read-only advertising access for admins without user,
  membership, role, permission, or assignment controls.
- Approved client access through `user → client_memberships → client →
  source_accounts`, not direct per-user advertising-account permissions.
