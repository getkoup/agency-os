# Windsor Data Model Reference

## Purpose

This document records the current understanding of the Windsor lead and advertising-performance datasets. Update it as product and data-model decisions are made.

Status: **Discussion draft**

Last reviewed: **2026-07-12**

## Security

- The Windsor API key is a server-only secret.
- Never commit the API key or place it in a `NEXT_PUBLIC_*` variable.
- Never request Windsor data directly from a browser or Client Component.
- Rotate any key that has been exposed in a URL, chat, browser history, or logs.

## Current Sources

Both sources use the Windsor `/all` endpoint with `date_preset=last_7d` and an account filter. The API key is intentionally omitted here.

### Lead source

Selected connectors:

```txt
facebook_leads__1084237868095826
facebook_leads__1749361305140569
facebook_leads__454302567777196
```

Requested fields:

```txt
created_time
account_name
ad_name
campaign
adset_name
adset_id
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

This is the agreed design direction, not an implemented database schema. Windsor.ai is the current data provider. The underlying advertising platform may be Facebook, Google Ads, or another Windsor-supported platform.

```txt
users
- id
- name
- email

clients
- id
- name
- status
- created_at
- updated_at

client_memberships
- user_id
- client_id
- role

source_accounts
- id
- client_id nullable
- data_provider
- platform
- connector
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
- client_id nullable
- source_account_id
- external_id nullable
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
→ otherwise leave client_id null for agency-admin review
→ synchronize campaigns, ad groups, ads, performance, and leads
```

Fixed `select_accounts` URLs do not discover newly connected accounts. Account discovery should use Windsor connector options or an equivalent account-listing request, after which data requests are built from active source accounts.

If a source account disappears from Windsor, mark it inactive or disconnected. Do not delete its client, leads, or historical performance.

## Access and Analytics Rules

```txt
Agency admin → all assigned and unassigned source data
Client user  → only data belonging to clients in their memberships
```

`source_accounts.client_id = null` means unassigned, not hidden. Agency-wide analytics include this data under an explicit **Unassigned accounts** group. Unassigned data must not contribute to a specific client's analytics and must never be visible to client users.

## Initial Data Rules

These rules are provisional and must be confirmed during product discussion:

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

- Can the lead endpoint return a stable source lead ID?
- Which selected lead connector corresponds to which selected advertising connector?
- What timezone does Windsor use for `created_time`, `date`, and `last_7d`?
- Are late-arriving leads or performance corrections expected?
- Should duplicate contacts across separate campaigns remain separate lead events?
- Which conversion metric defines success for each campaign type?
- How frequently should each source synchronize?
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
- No application schema or ingestion code has been implemented yet.
