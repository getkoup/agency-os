import { relations, sql } from "drizzle-orm";
import {
  index,
  pgEnum,
  pgTableCreator,
  primaryKey,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { type AdapterAccount } from "next-auth/adapters";

export const createTable = pgTableCreator((name) => `agency_os_${name}`);

export const userRole = pgEnum("agency_os_user_role", [
  "agency_admin",
  "client_viewer",
]);
export const recordStatus = pgEnum("agency_os_record_status", [
  "active",
  "inactive",
]);
export const sourceAccountStatus = pgEnum("agency_os_source_account_status", [
  "active",
  "disconnected",
  "ignored",
]);
export const syncStatus = pgEnum("agency_os_sync_status", [
  "running",
  "succeeded",
  "failed",
]);

export const users = createTable(
  "user",
  (d) => ({
    id: d
      .varchar({ length: 255 })
      .notNull()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    name: d.varchar({ length: 255 }),
    email: d.varchar({ length: 255 }).notNull(),
    emailVerified: d.timestamp({ mode: "date", withTimezone: true }),
    image: d.varchar({ length: 255 }),
    role: userRole().default("client_viewer").notNull(),
    passwordHash: d.text(),
  }),
  (t) => [uniqueIndex("user_email_lower_idx").on(sql`lower(${t.email})`)],
);

export const accounts = createTable(
  "account",
  (d) => ({
    userId: d
      .varchar({ length: 255 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: d.varchar({ length: 255 }).$type<AdapterAccount["type"]>().notNull(),
    provider: d.varchar({ length: 255 }).notNull(),
    providerAccountId: d.varchar({ length: 255 }).notNull(),
    refresh_token: d.text(),
    access_token: d.text(),
    expires_at: d.integer(),
    token_type: d.varchar({ length: 255 }),
    scope: d.varchar({ length: 255 }),
    id_token: d.text(),
    session_state: d.varchar({ length: 255 }),
  }),
  (t) => [
    primaryKey({ columns: [t.provider, t.providerAccountId] }),
    index("account_user_id_idx").on(t.userId),
  ],
);

export const sessions = createTable(
  "session",
  (d) => ({
    sessionToken: d.varchar({ length: 255 }).notNull().primaryKey(),
    userId: d
      .varchar({ length: 255 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expires: d.timestamp({ mode: "date", withTimezone: true }).notNull(),
  }),
  (t) => [index("session_user_id_idx").on(t.userId)],
);

export const verificationTokens = createTable(
  "verification_token",
  (d) => ({
    identifier: d.varchar({ length: 255 }).notNull(),
    token: d.varchar({ length: 255 }).notNull(),
    expires: d.timestamp({ mode: "date", withTimezone: true }).notNull(),
  }),
  (t) => [primaryKey({ columns: [t.identifier, t.token] })],
);

export const clients = createTable(
  "client",
  (d) => ({
    id: d.uuid().defaultRandom().primaryKey(),
    slug: d.varchar({ length: 100 }).notNull(),
    name: d.varchar({ length: 255 }).notNull(),
    status: recordStatus().default("active").notNull(),
    createdAt: d.timestamp({ withTimezone: true }).defaultNow().notNull(),
    updatedAt: d.timestamp({ withTimezone: true }).defaultNow().notNull(),
  }),
  (t) => [uniqueIndex("client_slug_idx").on(t.slug)],
);

export const clientMemberships = createTable(
  "client_membership",
  (d) => ({
    userId: d
      .varchar({ length: 255 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    clientId: d
      .uuid()
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
  }),
  (t) => [
    primaryKey({ columns: [t.userId, t.clientId] }),
    index("membership_client_idx").on(t.clientId),
  ],
);

export const sourceAccounts = createTable(
  "source_account",
  (d) => ({
    id: d.uuid().defaultRandom().primaryKey(),
    clientId: d.uuid().references(() => clients.id, { onDelete: "set null" }),
    dataProvider: d.varchar({ length: 50 }).notNull(),
    platform: d.varchar({ length: 50 }).notNull(),
    connector: d.varchar({ length: 50 }).notNull(),
    connectorAccountId: d.varchar({ length: 255 }).notNull(),
    externalAccountId: d.varchar({ length: 255 }).notNull(),
    externalAccountName: d.varchar({ length: 255 }).notNull(),
    normalizedName: d.varchar({ length: 255 }).notNull(),
    status: sourceAccountStatus().default("active").notNull(),
    firstSeenAt: d.timestamp({ withTimezone: true }).defaultNow().notNull(),
    lastSeenAt: d.timestamp({ withTimezone: true }).defaultNow().notNull(),
    lastSyncedAt: d.timestamp({ withTimezone: true }),
  }),
  (t) => [
    uniqueIndex("source_provider_connector_external_idx").on(
      t.dataProvider,
      t.connector,
      t.externalAccountId,
    ),
    uniqueIndex("source_provider_connector_account_idx").on(
      t.dataProvider,
      t.connectorAccountId,
    ),
    index("source_client_idx").on(t.clientId),
  ],
);

export const campaigns = createTable(
  "campaign",
  (d) => ({
    id: d.uuid().defaultRandom().primaryKey(),
    sourceAccountId: d
      .uuid()
      .notNull()
      .references(() => sourceAccounts.id, { onDelete: "cascade" }),
    externalId: d.varchar({ length: 255 }).notNull(),
    name: d.varchar({ length: 500 }).notNull(),
    objective: d.varchar({ length: 255 }),
    status: d.varchar({ length: 100 }),
    createdAt: d.timestamp({ withTimezone: true }).defaultNow().notNull(),
    updatedAt: d.timestamp({ withTimezone: true }).defaultNow().notNull(),
  }),
  (t) => [
    uniqueIndex("campaign_source_external_idx").on(
      t.sourceAccountId,
      t.externalId,
    ),
    index("campaign_source_idx").on(t.sourceAccountId),
  ],
);

export const adGroups = createTable(
  "ad_group",
  (d) => ({
    id: d.uuid().defaultRandom().primaryKey(),
    campaignId: d
      .uuid()
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    externalId: d.varchar({ length: 255 }).notNull(),
    name: d.varchar({ length: 500 }).notNull(),
    status: d.varchar({ length: 100 }),
    createdAt: d.timestamp({ withTimezone: true }).defaultNow().notNull(),
    updatedAt: d.timestamp({ withTimezone: true }).defaultNow().notNull(),
  }),
  (t) => [
    uniqueIndex("ad_group_campaign_external_idx").on(
      t.campaignId,
      t.externalId,
    ),
    index("ad_group_campaign_idx").on(t.campaignId),
  ],
);

export const ads = createTable(
  "ad",
  (d) => ({
    id: d.uuid().defaultRandom().primaryKey(),
    adGroupId: d
      .uuid()
      .notNull()
      .references(() => adGroups.id, { onDelete: "cascade" }),
    externalId: d.varchar({ length: 255 }).notNull(),
    name: d.varchar({ length: 500 }).notNull(),
    status: d.varchar({ length: 100 }),
    createdAt: d.timestamp({ withTimezone: true }).defaultNow().notNull(),
    updatedAt: d.timestamp({ withTimezone: true }).defaultNow().notNull(),
  }),
  (t) => [
    uniqueIndex("ad_group_external_idx").on(t.adGroupId, t.externalId),
    index("ad_ad_group_idx").on(t.adGroupId),
  ],
);

export const leadForms = createTable(
  "lead_form",
  (d) => ({
    id: d.uuid().defaultRandom().primaryKey(),
    sourceAccountId: d
      .uuid()
      .notNull()
      .references(() => sourceAccounts.id, { onDelete: "cascade" }),
    externalId: d.varchar({ length: 255 }).notNull(),
    name: d.varchar({ length: 500 }),
    createdAt: d.timestamp({ withTimezone: true }).defaultNow().notNull(),
    updatedAt: d.timestamp({ withTimezone: true }).defaultNow().notNull(),
  }),
  (t) => [
    uniqueIndex("lead_form_source_external_idx").on(
      t.sourceAccountId,
      t.externalId,
    ),
    index("lead_form_source_idx").on(t.sourceAccountId),
  ],
);

export const leads = createTable(
  "lead",
  (d) => ({
    id: d.uuid().defaultRandom().primaryKey(),
    sourceAccountId: d
      .uuid()
      .notNull()
      .references(() => sourceAccounts.id, { onDelete: "cascade" }),
    externalId: d.varchar({ length: 255 }).notNull(),
    campaignId: d
      .uuid()
      .references(() => campaigns.id, { onDelete: "set null" }),
    adGroupId: d.uuid().references(() => adGroups.id, { onDelete: "set null" }),
    adId: d.uuid().references(() => ads.id, { onDelete: "set null" }),
    leadFormId: d
      .uuid()
      .references(() => leadForms.id, { onDelete: "set null" }),
    occurredAt: d.timestamp({ withTimezone: true }).notNull(),
    fullName: d.varchar({ length: 500 }),
    email: d.varchar({ length: 500 }),
    phoneNumber: d.varchar({ length: 100 }),
    rawPayload: d.jsonb().$type<Record<string, unknown>>().notNull(),
    createdAt: d.timestamp({ withTimezone: true }).defaultNow().notNull(),
    updatedAt: d.timestamp({ withTimezone: true }).defaultNow().notNull(),
  }),
  (t) => [
    uniqueIndex("lead_source_external_idx").on(t.sourceAccountId, t.externalId),
    index("lead_source_occurred_idx").on(t.sourceAccountId, t.occurredAt),
    index("lead_campaign_idx").on(t.campaignId),
    index("lead_ad_group_idx").on(t.adGroupId),
    index("lead_ad_idx").on(t.adId),
    index("lead_form_idx").on(t.leadFormId),
  ],
);

export const adPerformanceDaily = createTable(
  "ad_performance_daily",
  (d) => ({
    id: d.uuid().defaultRandom().primaryKey(),
    sourceAccountId: d
      .uuid()
      .notNull()
      .references(() => sourceAccounts.id, { onDelete: "cascade" }),
    campaignId: d
      .uuid()
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    adGroupId: d
      .uuid()
      .notNull()
      .references(() => adGroups.id, { onDelete: "cascade" }),
    adId: d
      .uuid()
      .notNull()
      .references(() => ads.id, { onDelete: "cascade" }),
    date: d.date().notNull(),
    currency: d.varchar({ length: 10 }),
    spend: d.numeric({ precision: 14, scale: 2 }),
    impressions: d.bigint({ mode: "number" }),
    reach: d.bigint({ mode: "number" }),
    clicks: d.bigint({ mode: "number" }),
    linkClicks: d.bigint({ mode: "number" }),
    engagements: d.bigint({ mode: "number" }),
    conversions: d.bigint({ mode: "number" }),
    leads: d.bigint({ mode: "number" }),
    messagingConversations: d.bigint({ mode: "number" }),
    messagingConnections: d.bigint({ mode: "number" }),
    cpc: d.numeric({ precision: 14, scale: 2 }),
    ctr: d.numeric({ precision: 14, scale: 2 }),
    providerMetrics: d.jsonb().$type<Record<string, unknown>>().notNull(),
    rawPayload: d.jsonb().$type<Record<string, unknown>>().notNull(),
    createdAt: d.timestamp({ withTimezone: true }).defaultNow().notNull(),
    updatedAt: d.timestamp({ withTimezone: true }).defaultNow().notNull(),
  }),
  (t) => [
    uniqueIndex("performance_ad_date_idx").on(t.adId, t.date),
    index("performance_source_date_idx").on(t.sourceAccountId, t.date),
    index("performance_campaign_idx").on(t.campaignId),
    index("performance_ad_group_idx").on(t.adGroupId),
  ],
);

export const syncRuns = createTable("sync_run", (d) => ({
  id: d.uuid().defaultRandom().primaryKey(),
  dataProvider: d.varchar({ length: 50 }).notNull(),
  status: syncStatus().default("running").notNull(),
  startedAt: d.timestamp({ withTimezone: true }).defaultNow().notNull(),
  completedAt: d.timestamp({ withTimezone: true }),
  discoveredAccountCount: d.integer().default(0).notNull(),
  performanceRowCount: d.integer().default(0).notNull(),
  leadRowCount: d.integer().default(0).notNull(),
  errorMessage: d.text(),
}));

export const usersRelations = relations(users, ({ many }) => ({
  accounts: many(accounts),
  sessions: many(sessions),
  memberships: many(clientMemberships),
}));
export const accountsRelations = relations(accounts, ({ one }) => ({
  user: one(users, { fields: [accounts.userId], references: [users.id] }),
}));
export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));
export const clientsRelations = relations(clients, ({ many }) => ({
  memberships: many(clientMemberships),
  sourceAccounts: many(sourceAccounts),
}));
export const clientMembershipsRelations = relations(
  clientMemberships,
  ({ one }) => ({
    user: one(users, {
      fields: [clientMemberships.userId],
      references: [users.id],
    }),
    client: one(clients, {
      fields: [clientMemberships.clientId],
      references: [clients.id],
    }),
  }),
);
export const sourceAccountsRelations = relations(
  sourceAccounts,
  ({ one, many }) => ({
    client: one(clients, {
      fields: [sourceAccounts.clientId],
      references: [clients.id],
    }),
    campaigns: many(campaigns),
    leadForms: many(leadForms),
    leads: many(leads),
    performance: many(adPerformanceDaily),
  }),
);
export const campaignsRelations = relations(campaigns, ({ one, many }) => ({
  sourceAccount: one(sourceAccounts, {
    fields: [campaigns.sourceAccountId],
    references: [sourceAccounts.id],
  }),
  adGroups: many(adGroups),
  leads: many(leads),
  performance: many(adPerformanceDaily),
}));
export const adGroupsRelations = relations(adGroups, ({ one, many }) => ({
  campaign: one(campaigns, {
    fields: [adGroups.campaignId],
    references: [campaigns.id],
  }),
  ads: many(ads),
  leads: many(leads),
  performance: many(adPerformanceDaily),
}));
export const adsRelations = relations(ads, ({ one, many }) => ({
  adGroup: one(adGroups, {
    fields: [ads.adGroupId],
    references: [adGroups.id],
  }),
  leads: many(leads),
  performance: many(adPerformanceDaily),
}));
export const leadFormsRelations = relations(leadForms, ({ one, many }) => ({
  sourceAccount: one(sourceAccounts, {
    fields: [leadForms.sourceAccountId],
    references: [sourceAccounts.id],
  }),
  leads: many(leads),
}));
export const leadsRelations = relations(leads, ({ one }) => ({
  sourceAccount: one(sourceAccounts, {
    fields: [leads.sourceAccountId],
    references: [sourceAccounts.id],
  }),
  campaign: one(campaigns, {
    fields: [leads.campaignId],
    references: [campaigns.id],
  }),
  adGroup: one(adGroups, {
    fields: [leads.adGroupId],
    references: [adGroups.id],
  }),
  ad: one(ads, { fields: [leads.adId], references: [ads.id] }),
  leadForm: one(leadForms, {
    fields: [leads.leadFormId],
    references: [leadForms.id],
  }),
}));
export const adPerformanceDailyRelations = relations(
  adPerformanceDaily,
  ({ one }) => ({
    sourceAccount: one(sourceAccounts, {
      fields: [adPerformanceDaily.sourceAccountId],
      references: [sourceAccounts.id],
    }),
    campaign: one(campaigns, {
      fields: [adPerformanceDaily.campaignId],
      references: [campaigns.id],
    }),
    adGroup: one(adGroups, {
      fields: [adPerformanceDaily.adGroupId],
      references: [adGroups.id],
    }),
    ad: one(ads, {
      fields: [adPerformanceDaily.adId],
      references: [ads.id],
    }),
  }),
);
