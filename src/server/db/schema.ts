import { relations } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

/* ------------------------------------------------------------------ */
/* Shared JSON payload types                                          */
/* ------------------------------------------------------------------ */

/** Satu temuan hasil analisis HTML oleh mesin pemindai. */
export interface ScanFinding {
  signatureId: string | null;
  signatureName: string;
  category: string;
  severity: string;
  pattern: string;
  matchedText: string;
  lineNumber: number;
  context: string;
  reason: string;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Timestamp with timezone, default now(), non-null. */
const tstz = (name: string) =>
  timestamp(name, { withTimezone: true, mode: 'date' }).notNull().defaultNow();

/** UUID primary key with gen_random_uuid() default (pgcrypto/pg13+ builtin). */
const idUuid = (name: string = 'id') =>
  uuid(name)
    .primaryKey()
    .default(sql`gen_random_uuid()`);

/* ------------------------------------------------------------------ */
/* Enums                                                              */
/* ------------------------------------------------------------------ */

export const userRole = pgEnum('user_role', [
  'SUPER_ADMIN',
  'SECOPS_ENGINEER',
  'SUPPORT_AGENT',
  'CLIENT_OWNER',
]);
export type UserRole = (typeof userRole.enumValues)[number];

export const platformType = pgEnum('platform_type', [
  'OJS_3',
  'WORDPRESS',
  'LARAVEL',
  'NODE_SSR',
  'STATIC_WEB',
  'CUSTOM_PHP',
]);
export type PlatformType = (typeof platformType.enumValues)[number];

export const assetHealth = pgEnum('asset_health', [
  'HEALTHY',
  'WARNING',
  'COMPROMISED',
  'DOWN',
  'MAINTENANCE',
]);
export type AssetHealth = (typeof assetHealth.enumValues)[number];

export const incidentSeverity = pgEnum('incident_severity', [
  'CRITICAL',
  'HIGH',
  'MEDIUM',
  'LOW',
]);
export type IncidentSeverity = (typeof incidentSeverity.enumValues)[number];

export const incidentStatus = pgEnum('incident_status', [
  'OPEN',
  'INVESTIGATING',
  'CONTAINED',
  'RESOLVED',
  'CLOSED',
]);
export type IncidentStatus = (typeof incidentStatus.enumValues)[number];

export const threatCategory = pgEnum('threat_category', [
  'SQL_INJECTION',
  'SLOT_DEFACEMENT',
  'MALWARE_BACKDOOR',
  'SSL_EXPIRED',
  'SERVER_DOWN',
  'BRUTE_FORCE',
  'CONFIGURATION_ERROR',
]);
export type ThreatCategory = (typeof threatCategory.enumValues)[number];

export const credentialCategory = pgEnum('credential_category', [
  'CPANEL_HOSTING',
  'SSH_ROOT',
  'DATABASE',
  'CMS_ADMIN',
  'OJS_INDEXING',
]);
export type CredentialCategory = (typeof credentialCategory.enumValues)[number];

export const scanTrigger = pgEnum('scan_trigger', ['SCHEDULED', 'MANUAL']);
export type ScanTrigger = (typeof scanTrigger.enumValues)[number];

export const scanMode = pgEnum('scan_mode', ['LIVE', 'SIMULATED']);
export type ScanMode = (typeof scanMode.enumValues)[number];

export const notificationKind = pgEnum('notification_kind', [
  'SLA_WARNING',
  'SLA_BREACH',
  'ASSET_COMPROMISED',
  'ASSET_DOWN',
  'SSL_EXPIRING',
  'INCIDENT_ASSIGNED',
  'INCIDENT_COMMENT',
  'VAULT_ACCESS',
  'SYSTEM',
]);
export type NotificationKind = (typeof notificationKind.enumValues)[number];

export const decisionOutcome = pgEnum('decision_outcome', [
  'ACCEPTED',
  'DISMISSED',
  'PENDING',
]);
export type DecisionOutcome = (typeof decisionOutcome.enumValues)[number];

/* ------------------------------------------------------------------ */
/* 0. sessions                                                        */
/* ------------------------------------------------------------------ */

/**
 * Server-side session records.
 *
 * Sessions live in the database rather than process memory so they survive a
 * restart, survive HMR during development, and work when more than one server
 * instance handles traffic. The cookie only carries the random session id.
 */
export const sessions = pgTable(
  'sessions',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    createdAt: tstz('created_at'),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
    userAgent: text('user_agent'),
    ipAddress: varchar('ip_address', { length: 64 }),
  },
  (t) => [
    index('sessions_user_idx').on(t.userId),
    index('sessions_expires_idx').on(t.expiresAt),
  ],
);

/* ------------------------------------------------------------------ */
/* 1. profiles                                                        */
/* ------------------------------------------------------------------ */

export const profiles = pgTable(
  'profiles',
  {
    id: idUuid(),
    email: varchar('email', { length: 255 }).notNull(),
    fullName: text('full_name').notNull(),
    role: userRole('role').notNull().default('SUPPORT_AGENT'),
    organizationName: text('organization_name'),
    passwordHash: text('password_hash'),
    isActive: boolean('is_active').notNull().default(true),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true, mode: 'date' }),
    createdAt: tstz('created_at'),
    updatedAt: tstz('updated_at'),
  },
  (t) => [
    uniqueIndex('profiles_email_key').on(t.email),
    index('profiles_role_idx').on(t.role),
  ],
);

/* ------------------------------------------------------------------ */
/* 2. web_assets                                                      */
/* ------------------------------------------------------------------ */

export const webAssets = pgTable(
  'web_assets',
  {
    id: idUuid(),
    clientId: uuid('client_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    domainUrl: text('domain_url').notNull(),
    slug: varchar('slug', { length: 120 }).notNull(),
    platform: platformType('platform').notNull().default('CUSTOM_PHP'),
    platformVersion: text('platform_version'),
    serverIp: varchar('server_ip', { length: 64 }),
    hostingProvider: text('hosting_provider'),
    healthStatus: assetHealth('health_status').notNull().default('HEALTHY'),
    sslExpiryDate: timestamp('ssl_expiry_date', { withTimezone: true, mode: 'date' }),
    sslDaysRemaining: integer('ssl_days_remaining'),
    baselineDomHash: text('baseline_dom_hash'),
    lastScanAt: timestamp('last_scan_at', { withTimezone: true, mode: 'date' }),
    uptimePct30d: numeric('uptime_pct_30d', { precision: 5, scale: 2 }).notNull().default('100.00'),
    version: integer('version').notNull().default(1),
    createdAt: tstz('created_at'),
    updatedAt: tstz('updated_at'),
  },
  (t) => [
    uniqueIndex('web_assets_slug_key').on(t.slug),
    index('web_assets_client_idx').on(t.clientId),
    index('web_assets_health_idx').on(t.healthStatus),
    index('web_assets_platform_idx').on(t.platform),
  ],
);

/* ------------------------------------------------------------------ */
/* 3. scan_logs                                                       */
/* ------------------------------------------------------------------ */

export const scanLogs = pgTable(
  'scan_logs',
  {
    id: idUuid(),
    assetId: uuid('asset_id')
      .notNull()
      .references(() => webAssets.id, { onDelete: 'cascade' }),
    scannedAt: tstz('scanned_at'),
    triggeredBy: scanTrigger('triggered_by').notNull().default('MANUAL'),
    scanMode: scanMode('scan_mode').notNull().default('SIMULATED'),
    httpStatus: integer('http_status'),
    responseTimeMs: integer('response_time_ms'),
    sslValid: boolean('ssl_valid'),
    domHashMatched: boolean('dom_hash_matched'),
    threatsDetected: integer('threats_detected').notNull().default(0),
    findingsJson: jsonb('findings_json').$type<ScanFinding[]>().notNull().default(sql`'[]'::jsonb`),
    summary: text('summary'),
    createdBy: uuid('created_by').references(() => profiles.id, {
      onDelete: 'set null',
    }),
  },
  (t) => [index('scan_logs_asset_idx').on(t.assetId), index('scan_logs_time_idx').on(t.scannedAt)],
);

/* ------------------------------------------------------------------ */
/* 4. malware_signatures                                              */
/* ------------------------------------------------------------------ */

export const malwareSignatures = pgTable(
  'malware_signatures',
  {
    id: idUuid(),
    name: text('name').notNull(),
    pattern: text('pattern').notNull(),
    category: threatCategory('category').notNull(),
    severity: incidentSeverity('severity').notNull().default('HIGH'),
    description: text('description'),
    isActive: boolean('is_active').notNull().default(true),
    createdBy: uuid('created_by').references(() => profiles.id, {
      onDelete: 'set null',
    }),
    createdAt: tstz('created_at'),
    updatedAt: tstz('updated_at'),
  },
  (t) => [
    index('malware_signatures_active_idx').on(t.isActive),
    index('malware_signatures_category_idx').on(t.category),
  ],
);

/* ------------------------------------------------------------------ */
/* 5. incidents                                                       */
/* ------------------------------------------------------------------ */

export const incidents = pgTable(
  'incidents',
  {
    id: idUuid(),
    ticketNumber: varchar('ticket_number', { length: 20 }).notNull(),
    assetId: uuid('asset_id')
      .notNull()
      .references(() => webAssets.id, { onDelete: 'cascade' }),
    reportedBy: uuid('reported_by')
      .notNull()
      .references(() => profiles.id, { onDelete: 'restrict' }),
    assignedTo: uuid('assigned_to').references(() => profiles.id, {
      onDelete: 'set null',
    }),
    title: text('title').notNull(),
    description: text('description').notNull(),
    severity: incidentSeverity('severity').notNull().default('MEDIUM'),
    category: threatCategory('category').notNull(),
    status: incidentStatus('status').notNull().default('OPEN'),
    slaResponseDueAt: timestamp('sla_response_due_at', { withTimezone: true, mode: 'date' }),
    firstRespondedAt: timestamp('first_responded_at', {
      withTimezone: true,
      mode: 'date',
    }),
    slaResolutionDueAt: timestamp('sla_resolution_due_at', {
      withTimezone: true,
      mode: 'date',
    }),
    resolvedAt: timestamp('resolved_at', { withTimezone: true, mode: 'date' }),
    slaBreached: boolean('sla_breached').notNull().default(false),
    rootCauseSummary: text('root_cause_summary'),
    remediationSteps: text('remediation_steps'),
    version: integer('version').notNull().default(1),
    createdAt: tstz('created_at'),
    updatedAt: tstz('updated_at'),
  },
  (t) => [
    uniqueIndex('incidents_ticket_number_key').on(t.ticketNumber),
    index('incidents_asset_idx').on(t.assetId),
    index('incidents_status_idx').on(t.status),
    index('incidents_severity_idx').on(t.severity),
    index('incidents_assigned_idx').on(t.assignedTo),
    index('incidents_reported_idx').on(t.reportedBy),
  ],
);

/* ------------------------------------------------------------------ */
/* 6. incident_comments                                               */
/* ------------------------------------------------------------------ */

export const incidentComments = pgTable(
  'incident_comments',
  {
    id: idUuid(),
    incidentId: uuid('incident_id')
      .notNull()
      .references(() => incidents.id, { onDelete: 'cascade' }),
    authorId: uuid('author_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'restrict' }),
    body: text('body').notNull(),
    isInternal: boolean('is_internal').notNull().default(false),
    attachmentUrl: text('attachment_url'),
    createdAt: tstz('created_at'),
  },
  (t) => [index('incident_comments_incident_idx').on(t.incidentId)],
);

/* ------------------------------------------------------------------ */
/* 7. credential_vaults                                               */
/* ------------------------------------------------------------------ */

export const credentialVaults = pgTable(
  'credential_vaults',
  {
    id: idUuid(),
    assetId: uuid('asset_id')
      .notNull()
      .references(() => webAssets.id, { onDelete: 'cascade' }),
    label: text('label').notNull(),
    category: credentialCategory('category').notNull(),
    username: text('username').notNull(),
    loginUrl: text('login_url'),
    encryptedSecret: text('encrypted_secret').notNull(),
    iv: text('iv').notNull(),
    authTag: text('auth_tag').notNull(),
    notes: text('notes'),
    lastRotatedAt: timestamp('last_rotated_at', { withTimezone: true, mode: 'date' }),
    lastAccessedAt: timestamp('last_accessed_at', {
      withTimezone: true,
      mode: 'date',
    }),
    lastAccessedBy: uuid('last_accessed_by').references(() => profiles.id, {
      onDelete: 'set null',
    }),
    createdAt: tstz('created_at'),
  },
  (t) => [
    index('credential_vaults_asset_idx').on(t.assetId),
    index('credential_vaults_category_idx').on(t.category),
  ],
);

/* ------------------------------------------------------------------ */
/* 8. runbooks & incident_runbook_tasks                               */
/* ------------------------------------------------------------------ */

export const runbooks = pgTable('runbooks', {
  id: idUuid(),
  title: text('title').notNull(),
  slug: varchar('slug', { length: 140 }).notNull(),
  category: threatCategory('category').notNull(),
  summary: text('summary'),
  estimatedMinutes: integer('estimated_minutes'),
  isActive: boolean('is_active').notNull().default(true),
  createdBy: uuid('created_by').references(() => profiles.id, {
    onDelete: 'set null',
  }),
  createdAt: tstz('created_at'),
  updatedAt: tstz('updated_at'),
});

export const runbookSteps = pgTable(
  'runbook_steps',
  {
    id: idUuid(),
    runbookId: uuid('runbook_id')
      .notNull()
      .references(() => runbooks.id, { onDelete: 'cascade' }),
    stepOrder: integer('step_order').notNull(),
    title: text('title').notNull(),
    detail: text('detail'),
    requiresEvidence: boolean('requires_evidence').notNull().default(false),
  },
  (t) => [index('runbook_steps_runbook_idx').on(t.runbookId)],
);

export const incidentRunbookTasks = pgTable(
  'incident_runbook_tasks',
  {
    id: idUuid(),
    incidentId: uuid('incident_id')
      .notNull()
      .references(() => incidents.id, { onDelete: 'cascade' }),
    runbookStepId: uuid('runbook_step_id')
      .notNull()
      .references(() => runbookSteps.id, { onDelete: 'cascade' }),
    isDone: boolean('is_done').notNull().default(false),
    doneAt: timestamp('done_at', { withTimezone: true, mode: 'date' }),
    doneBy: uuid('done_by').references(() => profiles.id, { onDelete: 'set null' }),
    notes: text('notes'),
    updatedAt: tstz('updated_at'),
  },
  (t) => [
    uniqueIndex('incident_runbook_tasks_unique').on(t.incidentId, t.runbookStepId),
    index('incident_runbook_tasks_incident_idx').on(t.incidentId),
  ],
);

/* ------------------------------------------------------------------ */
/* 9. decision_rules & decision_logs                                  */
/* ------------------------------------------------------------------ */

export const decisionRules = pgTable(
  'decision_rules',
  {
    id: idUuid(),
    code: varchar('code', { length: 60 }).notNull(),
    label: text('label').notNull(),
    description: text('description'),
    sslWarnDays: integer('ssl_warn_days').notNull().default(14),
    repeatInfectionThreshold: integer('repeat_infection_threshold').notNull().default(2),
    repeatInfectionWindowDays: integer('repeat_infection_window_days').notNull().default(30),
    credentialRotationDays: integer('credential_rotation_days').notNull().default(90),
    slaWarnRatioPct: integer('sla_warn_ratio_pct').notNull().default(25),
    maxActiveTicketsPerEngineer: integer('max_active_tickets_per_engineer').notNull().default(5),
    isActive: boolean('is_active').notNull().default(true),
    updatedBy: uuid('updated_by').references(() => profiles.id, {
      onDelete: 'set null',
    }),
    createdAt: tstz('created_at'),
    updatedAt: tstz('updated_at'),
  },
  (t) => [uniqueIndex('decision_rules_code_key').on(t.code)],
);

export const decisionLogs = pgTable(
  'decision_logs',
  {
    id: idUuid(),
    ruleId: uuid('rule_id').references(() => decisionRules.id, {
      onDelete: 'set null',
    }),
    ruleCode: varchar('rule_code', { length: 60 }).notNull(),
    recommendationTitle: text('recommendation_title').notNull(),
    recommendationBody: text('recommendation_body'),
    triggerFactsJson: jsonb('trigger_facts_json').$type<Record<string, unknown>>(),
    riskImpact: text('risk_impact'),
    outcome: decisionOutcome('outcome').notNull().default('PENDING'),
    decidedBy: uuid('decided_by').references(() => profiles.id, {
      onDelete: 'set null',
    }),
    decidedAt: timestamp('decided_at', { withTimezone: true, mode: 'date' }),
    decisionNote: text('decision_note'),
    createdAt: tstz('created_at'),
  },
  (t) => [
    index('decision_logs_outcome_idx').on(t.outcome),
    index('decision_logs_rule_idx').on(t.ruleCode),
  ],
);

/* ------------------------------------------------------------------ */
/* 10. Operational tables                                             */
/* ------------------------------------------------------------------ */

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: idUuid(),
    actorId: uuid('actor_id').references(() => profiles.id, { onDelete: 'set null' }),
    actorRole: userRole('actor_role'),
    actorLabel: text('actor_label'),
    action: varchar('action', { length: 80 }).notNull(),
    entityType: varchar('entity_type', { length: 60 }).notNull(),
    entityId: varchar('entity_id', { length: 64 }),
    summary: text('summary').notNull(),
    changesJson: jsonb('changes_json').$type<Record<string, unknown>>(),
    requestId: varchar('request_id', { length: 64 }),
    createdAt: tstz('created_at'),
  },
  (t) => [
    index('audit_logs_actor_idx').on(t.actorId),
    index('audit_logs_action_idx').on(t.action),
    index('audit_logs_entity_idx').on(t.entityType, t.entityId),
    index('audit_logs_time_idx').on(t.createdAt),
  ],
);

export const notifications = pgTable(
  'notifications',
  {
    id: idUuid(),
    recipientId: uuid('recipient_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    kind: notificationKind('kind').notNull().default('SYSTEM'),
    title: text('title').notNull(),
    body: text('body'),
    entityType: varchar('entity_type', { length: 60 }),
    entityId: varchar('entity_id', { length: 64 }),
    isRead: boolean('is_read').notNull().default(false),
    createdAt: tstz('created_at'),
  },
  (t) => [
    index('notifications_recipient_idx').on(t.recipientId, t.isRead),
    index('notifications_time_idx').on(t.createdAt),
  ],
);

export const appSettings = pgTable(
  'app_settings',
  {
    id: idUuid(),
    key: varchar('key', { length: 80 }).notNull(),
    valueJson: jsonb('value_json').$type<unknown>(),
    description: text('description'),
    updatedBy: uuid('updated_by').references(() => profiles.id, {
      onDelete: 'set null',
    }),
    createdAt: tstz('created_at'),
    updatedAt: tstz('updated_at'),
  },
  (t) => [uniqueIndex('app_settings_key_key').on(t.key)],
);

export const documentSequences = pgTable(
  'document_sequences',
  {
    id: idUuid(),
    docType: varchar('doc_type', { length: 40 }).notNull(),
    period: varchar('period', { length: 20 }).notNull(),
    lastValue: integer('last_value').notNull().default(0),
    updatedAt: tstz('updated_at'),
  },
  (t) => [uniqueIndex('document_sequences_key').on(t.docType, t.period)],
);

export const idempotencyKeys = pgTable(
  'idempotency_keys',
  {
    id: idUuid(),
    scope: varchar('scope', { length: 60 }).notNull(),
    requestId: varchar('request_id', { length: 64 }).notNull(),
    responseJson: jsonb('response_json').$type<unknown>(),
    createdAt: tstz('created_at'),
  },
  (t) => [
    uniqueIndex('idempotency_keys_scope_request').on(t.scope, t.requestId),
    index('idempotency_keys_time_idx').on(t.createdAt),
  ],
);

/* ------------------------------------------------------------------ */
/* Relations                                                          */
/* ------------------------------------------------------------------ */

export const profilesRelations = relations(profiles, ({ many }) => ({
  assets: many(webAssets),
  reportedIncidents: many(incidents, { relationName: 'incident_reporter' }),
  assignedIncidents: many(incidents, { relationName: 'incident_assignee' }),
  comments: many(incidentComments),
  notifications: many(notifications),
}));

export const webAssetsRelations = relations(webAssets, ({ one, many }) => ({
  client: one(profiles, { fields: [webAssets.clientId], references: [profiles.id] }),
  scans: many(scanLogs),
  incidents: many(incidents),
  credentials: many(credentialVaults),
}));

export const scanLogsRelations = relations(scanLogs, ({ one }) => ({
  asset: one(webAssets, { fields: [scanLogs.assetId], references: [webAssets.id] }),
  creator: one(profiles, { fields: [scanLogs.createdBy], references: [profiles.id] }),
}));

export const incidentsRelations = relations(incidents, ({ one, many }) => ({
  asset: one(webAssets, { fields: [incidents.assetId], references: [webAssets.id] }),
  reporter: one(profiles, {
    fields: [incidents.reportedBy],
    references: [profiles.id],
    relationName: 'incident_reporter',
  }),
  assignee: one(profiles, {
    fields: [incidents.assignedTo],
    references: [profiles.id],
    relationName: 'incident_assignee',
  }),
  comments: many(incidentComments),
  runbookTasks: many(incidentRunbookTasks),
}));

export const incidentCommentsRelations = relations(incidentComments, ({ one }) => ({
  incident: one(incidents, {
    fields: [incidentComments.incidentId],
    references: [incidents.id],
  }),
  author: one(profiles, {
    fields: [incidentComments.authorId],
    references: [profiles.id],
  }),
}));

export const credentialVaultsRelations = relations(credentialVaults, ({ one }) => ({
  asset: one(webAssets, {
    fields: [credentialVaults.assetId],
    references: [webAssets.id],
  }),
  lastAccessor: one(profiles, {
    fields: [credentialVaults.lastAccessedBy],
    references: [profiles.id],
  }),
}));

export const runbooksRelations = relations(runbooks, ({ many }) => ({
  steps: many(runbookSteps),
}));

export const runbookStepsRelations = relations(runbookSteps, ({ one, many }) => ({
  runbook: one(runbooks, { fields: [runbookSteps.runbookId], references: [runbooks.id] }),
  tasks: many(incidentRunbookTasks),
}));

export const incidentRunbookTasksRelations = relations(incidentRunbookTasks, ({ one }) => ({
  incident: one(incidents, {
    fields: [incidentRunbookTasks.incidentId],
    references: [incidents.id],
  }),
  step: one(runbookSteps, {
    fields: [incidentRunbookTasks.runbookStepId],
    references: [runbookSteps.id],
  }),
  doer: one(profiles, {
    fields: [incidentRunbookTasks.doneBy],
    references: [profiles.id],
  }),
}));
