-- Sentinel Ops — 0000_init_sentinel.sql
-- Idempotent baseline migration. Safe to run repeatedly on a fresh or
-- partially-migrated database.
--
-- Applied by scripts/db-migrate.mjs (works on PGlite and real PostgreSQL).

-- Guard: only run once. The drizzle journal is not consulted here; instead a
-- marker row in app_settings records that this migration has been applied.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'profiles') THEN
    RAISE NOTICE '0000_init_sentinel: already applied, skipping';
    RETURN;
  END IF;
END
$$;

-- Types --------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
    CREATE TYPE "public"."user_role" AS ENUM('SUPER_ADMIN', 'SECOPS_ENGINEER', 'SUPPORT_AGENT', 'CLIENT_OWNER');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'platform_type') THEN
    CREATE TYPE "public"."platform_type" AS ENUM('OJS_3', 'WORDPRESS', 'LARAVEL', 'NODE_SSR', 'STATIC_WEB', 'CUSTOM_PHP');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'asset_health') THEN
    CREATE TYPE "public"."asset_health" AS ENUM('HEALTHY', 'WARNING', 'COMPROMISED', 'DOWN', 'MAINTENANCE');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'incident_severity') THEN
    CREATE TYPE "public"."incident_severity" AS ENUM('CRITICAL', 'HIGH', 'MEDIUM', 'LOW');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'incident_status') THEN
    CREATE TYPE "public"."incident_status" AS ENUM('OPEN', 'INVESTIGATING', 'CONTAINED', 'RESOLVED', 'CLOSED');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'threat_category') THEN
    CREATE TYPE "public"."threat_category" AS ENUM('SQL_INJECTION', 'SLOT_DEFACEMENT', 'MALWARE_BACKDOOR', 'SSL_EXPIRED', 'SERVER_DOWN', 'BRUTE_FORCE', 'CONFIGURATION_ERROR');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'credential_category') THEN
    CREATE TYPE "public"."credential_category" AS ENUM('CPANEL_HOSTING', 'SSH_ROOT', 'DATABASE', 'CMS_ADMIN', 'OJS_INDEXING');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'scan_trigger') THEN
    CREATE TYPE "public"."scan_trigger" AS ENUM('SCHEDULED', 'MANUAL');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'scan_mode') THEN
    CREATE TYPE "public"."scan_mode" AS ENUM('LIVE', 'SIMULATED');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'notification_kind') THEN
    CREATE TYPE "public"."notification_kind" AS ENUM('SLA_WARNING', 'SLA_BREACH', 'ASSET_COMPROMISED', 'ASSET_DOWN', 'SSL_EXPIRING', 'INCIDENT_ASSIGNED', 'INCIDENT_COMMENT', 'VAULT_ACCESS', 'SYSTEM');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'decision_outcome') THEN
    CREATE TYPE "public"."decision_outcome" AS ENUM('ACCEPTED', 'DISMISSED', 'PENDING');
  END IF;
END
$$;

-- Tables -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "sessions" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"user_agent" text,
	"ip_address" varchar(64)
);

CREATE TABLE IF NOT EXISTS "profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255) NOT NULL,
	"full_name" text NOT NULL,
	"role" "user_role" DEFAULT 'SUPPORT_AGENT' NOT NULL,
	"organization_name" text,
	"password_hash" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "web_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"name" text NOT NULL,
	"domain_url" text NOT NULL,
	"slug" varchar(120) NOT NULL,
	"platform" "platform_type" DEFAULT 'CUSTOM_PHP' NOT NULL,
	"platform_version" text,
	"server_ip" varchar(64),
	"hosting_provider" text,
	"health_status" "asset_health" DEFAULT 'HEALTHY' NOT NULL,
	"ssl_expiry_date" timestamp with time zone,
	"ssl_days_remaining" integer,
	"baseline_dom_hash" text,
	"last_scan_at" timestamp with time zone,
	"uptime_pct_30d" numeric(5, 2) DEFAULT '100.00' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "scan_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"asset_id" uuid NOT NULL,
	"scanned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"triggered_by" "scan_trigger" DEFAULT 'MANUAL' NOT NULL,
	"scan_mode" "scan_mode" DEFAULT 'SIMULATED' NOT NULL,
	"http_status" integer,
	"response_time_ms" integer,
	"ssl_valid" boolean,
	"dom_hash_matched" boolean,
	"threats_detected" integer DEFAULT 0 NOT NULL,
	"findings_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"summary" text,
	"created_by" uuid
);

CREATE TABLE IF NOT EXISTS "malware_signatures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"pattern" text NOT NULL,
	"category" "threat_category" NOT NULL,
	"severity" "incident_severity" DEFAULT 'HIGH' NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "incidents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_number" varchar(20) NOT NULL,
	"asset_id" uuid NOT NULL,
	"reported_by" uuid NOT NULL,
	"assigned_to" uuid,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"severity" "incident_severity" DEFAULT 'MEDIUM' NOT NULL,
	"category" "threat_category" NOT NULL,
	"status" "incident_status" DEFAULT 'OPEN' NOT NULL,
	"sla_response_due_at" timestamp with time zone,
	"first_responded_at" timestamp with time zone,
	"sla_resolution_due_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"sla_breached" boolean DEFAULT false NOT NULL,
	"root_cause_summary" text,
	"remediation_steps" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "incident_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"incident_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"body" text NOT NULL,
	"is_internal" boolean DEFAULT false NOT NULL,
	"attachment_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "credential_vaults" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"asset_id" uuid NOT NULL,
	"label" text NOT NULL,
	"category" "credential_category" NOT NULL,
	"username" text NOT NULL,
	"login_url" text,
	"encrypted_secret" text NOT NULL,
	"iv" text NOT NULL,
	"auth_tag" text NOT NULL,
	"notes" text,
	"last_rotated_at" timestamp with time zone,
	"last_accessed_at" timestamp with time zone,
	"last_accessed_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "runbooks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"slug" varchar(140) NOT NULL,
	"category" "threat_category" NOT NULL,
	"summary" text,
	"estimated_minutes" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "runbook_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"runbook_id" uuid NOT NULL,
	"step_order" integer NOT NULL,
	"title" text NOT NULL,
	"detail" text,
	"requires_evidence" boolean DEFAULT false NOT NULL
);

CREATE TABLE IF NOT EXISTS "incident_runbook_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"incident_id" uuid NOT NULL,
	"runbook_step_id" uuid NOT NULL,
	"is_done" boolean DEFAULT false NOT NULL,
	"done_at" timestamp with time zone,
	"done_by" uuid,
	"notes" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "decision_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(60) NOT NULL,
	"label" text NOT NULL,
	"description" text,
	"ssl_warn_days" integer DEFAULT 14 NOT NULL,
	"repeat_infection_threshold" integer DEFAULT 2 NOT NULL,
	"repeat_infection_window_days" integer DEFAULT 30 NOT NULL,
	"credential_rotation_days" integer DEFAULT 90 NOT NULL,
	"sla_warn_ratio_pct" integer DEFAULT 25 NOT NULL,
	"max_active_tickets_per_engineer" integer DEFAULT 5 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "decision_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rule_id" uuid,
	"rule_code" varchar(60) NOT NULL,
	"recommendation_title" text NOT NULL,
	"recommendation_body" text,
	"trigger_facts_json" jsonb,
	"risk_impact" text,
	"outcome" "decision_outcome" DEFAULT 'PENDING' NOT NULL,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"decision_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid,
	"actor_role" "user_role",
	"actor_label" text,
	"action" varchar(80) NOT NULL,
	"entity_type" varchar(60) NOT NULL,
	"entity_id" varchar(64),
	"summary" text NOT NULL,
	"changes_json" jsonb,
	"request_id" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipient_id" uuid NOT NULL,
	"kind" "notification_kind" DEFAULT 'SYSTEM' NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"entity_type" varchar(60),
	"entity_id" varchar(64),
	"is_read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "app_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" varchar(80) NOT NULL,
	"value_json" jsonb,
	"description" text,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "document_sequences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"doc_type" varchar(40) NOT NULL,
	"period" varchar(20) NOT NULL,
	"last_value" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "idempotency_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" varchar(60) NOT NULL,
	"request_id" varchar(64) NOT NULL,
	"response_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- Foreign keys (idempotent via pg_constraint guards) -----------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sessions_user_id_profiles_id_fk') THEN
    ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'web_assets_client_id_profiles_id_fk') THEN
    ALTER TABLE "web_assets" ADD CONSTRAINT "web_assets_client_id_profiles_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'scan_logs_asset_id_web_assets_id_fk') THEN
    ALTER TABLE "scan_logs" ADD CONSTRAINT "scan_logs_asset_id_web_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."web_assets"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'scan_logs_created_by_profiles_id_fk') THEN
    ALTER TABLE "scan_logs" ADD CONSTRAINT "scan_logs_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'malware_signatures_created_by_profiles_id_fk') THEN
    ALTER TABLE "malware_signatures" ADD CONSTRAINT "malware_signatures_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'incidents_asset_id_web_assets_id_fk') THEN
    ALTER TABLE "incidents" ADD CONSTRAINT "incidents_asset_id_web_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."web_assets"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'incidents_reported_by_profiles_id_fk') THEN
    ALTER TABLE "incidents" ADD CONSTRAINT "incidents_reported_by_profiles_id_fk" FOREIGN KEY ("reported_by") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'incidents_assigned_to_profiles_id_fk') THEN
    ALTER TABLE "incidents" ADD CONSTRAINT "incidents_assigned_to_profiles_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'incident_comments_incident_id_incidents_id_fk') THEN
    ALTER TABLE "incident_comments" ADD CONSTRAINT "incident_comments_incident_id_incidents_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."incidents"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'incident_comments_author_id_profiles_id_fk') THEN
    ALTER TABLE "incident_comments" ADD CONSTRAINT "incident_comments_author_id_profiles_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'credential_vaults_asset_id_web_assets_id_fk') THEN
    ALTER TABLE "credential_vaults" ADD CONSTRAINT "credential_vaults_asset_id_web_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."web_assets"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'credential_vaults_last_accessed_by_profiles_id_fk') THEN
    ALTER TABLE "credential_vaults" ADD CONSTRAINT "credential_vaults_last_accessed_by_profiles_id_fk" FOREIGN KEY ("last_accessed_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'runbooks_created_by_profiles_id_fk') THEN
    ALTER TABLE "runbooks" ADD CONSTRAINT "runbooks_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'runbook_steps_runbook_id_runbooks_id_fk') THEN
    ALTER TABLE "runbook_steps" ADD CONSTRAINT "runbook_steps_runbook_id_runbooks_id_fk" FOREIGN KEY ("runbook_id") REFERENCES "public"."runbooks"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'incident_runbook_tasks_incident_id_incidents_id_fk') THEN
    ALTER TABLE "incident_runbook_tasks" ADD CONSTRAINT "incident_runbook_tasks_incident_id_incidents_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."incidents"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'incident_runbook_tasks_runbook_step_id_runbook_steps_id_fk') THEN
    ALTER TABLE "incident_runbook_tasks" ADD CONSTRAINT "incident_runbook_tasks_runbook_step_id_runbook_steps_id_fk" FOREIGN KEY ("runbook_step_id") REFERENCES "public"."runbook_steps"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'incident_runbook_tasks_done_by_profiles_id_fk') THEN
    ALTER TABLE "incident_runbook_tasks" ADD CONSTRAINT "incident_runbook_tasks_done_by_profiles_id_fk" FOREIGN KEY ("done_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'decision_rules_updated_by_profiles_id_fk') THEN
    ALTER TABLE "decision_rules" ADD CONSTRAINT "decision_rules_updated_by_profiles_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'decision_logs_rule_id_decision_rules_id_fk') THEN
    ALTER TABLE "decision_logs" ADD CONSTRAINT "decision_logs_rule_id_decision_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."decision_rules"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'decision_logs_decided_by_profiles_id_fk') THEN
    ALTER TABLE "decision_logs" ADD CONSTRAINT "decision_logs_decided_by_profiles_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'audit_logs_actor_id_profiles_id_fk') THEN
    ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_profiles_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notifications_recipient_id_profiles_id_fk') THEN
    ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_id_profiles_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'app_settings_updated_by_profiles_id_fk') THEN
    ALTER TABLE "app_settings" ADD CONSTRAINT "app_settings_updated_by_profiles_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END
$$;

-- Indexes ------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS "profiles_email_key" ON "profiles" USING btree ("email");
CREATE INDEX IF NOT EXISTS "profiles_role_idx" ON "profiles" USING btree ("role");
CREATE UNIQUE INDEX IF NOT EXISTS "web_assets_slug_key" ON "web_assets" USING btree ("slug");
CREATE INDEX IF NOT EXISTS "web_assets_client_idx" ON "web_assets" USING btree ("client_id");
CREATE INDEX IF NOT EXISTS "web_assets_health_idx" ON "web_assets" USING btree ("health_status");
CREATE INDEX IF NOT EXISTS "web_assets_platform_idx" ON "web_assets" USING btree ("platform");
CREATE INDEX IF NOT EXISTS "scan_logs_asset_idx" ON "scan_logs" USING btree ("asset_id");
CREATE INDEX IF NOT EXISTS "scan_logs_time_idx" ON "scan_logs" USING btree ("scanned_at");
CREATE INDEX IF NOT EXISTS "malware_signatures_active_idx" ON "malware_signatures" USING btree ("is_active");
CREATE INDEX IF NOT EXISTS "malware_signatures_category_idx" ON "malware_signatures" USING btree ("category");
CREATE UNIQUE INDEX IF NOT EXISTS "incidents_ticket_number_key" ON "incidents" USING btree ("ticket_number");
CREATE INDEX IF NOT EXISTS "incidents_asset_idx" ON "incidents" USING btree ("asset_id");
CREATE INDEX IF NOT EXISTS "incidents_status_idx" ON "incidents" USING btree ("status");
CREATE INDEX IF NOT EXISTS "incidents_severity_idx" ON "incidents" USING btree ("severity");
CREATE INDEX IF NOT EXISTS "incidents_assigned_idx" ON "incidents" USING btree ("assigned_to");
CREATE INDEX IF NOT EXISTS "incidents_reported_idx" ON "incidents" USING btree ("reported_by");
CREATE INDEX IF NOT EXISTS "incident_comments_incident_idx" ON "incident_comments" USING btree ("incident_id");
CREATE UNIQUE INDEX IF NOT EXISTS "incident_runbook_tasks_unique" ON "incident_runbook_tasks" USING btree ("incident_id","runbook_step_id");
CREATE INDEX IF NOT EXISTS "incident_runbook_tasks_incident_idx" ON "incident_runbook_tasks" USING btree ("incident_id");
CREATE INDEX IF NOT EXISTS "credential_vaults_asset_idx" ON "credential_vaults" USING btree ("asset_id");
CREATE INDEX IF NOT EXISTS "credential_vaults_category_idx" ON "credential_vaults" USING btree ("category");
CREATE UNIQUE INDEX IF NOT EXISTS "decision_rules_code_key" ON "decision_rules" USING btree ("code");
CREATE INDEX IF NOT EXISTS "decision_logs_outcome_idx" ON "decision_logs" USING btree ("outcome");
CREATE INDEX IF NOT EXISTS "decision_logs_rule_idx" ON "decision_logs" USING btree ("rule_code");
CREATE INDEX IF NOT EXISTS "audit_logs_actor_idx" ON "audit_logs" USING btree ("actor_id");
CREATE INDEX IF NOT EXISTS "audit_logs_action_idx" ON "audit_logs" USING btree ("action");
CREATE INDEX IF NOT EXISTS "audit_logs_entity_idx" ON "audit_logs" USING btree ("entity_type","entity_id");
CREATE INDEX IF NOT EXISTS "audit_logs_time_idx" ON "audit_logs" USING btree ("created_at");
CREATE INDEX IF NOT EXISTS "notifications_recipient_idx" ON "notifications" USING btree ("recipient_id","is_read");
CREATE INDEX IF NOT EXISTS "notifications_time_idx" ON "notifications" USING btree ("created_at");
CREATE INDEX IF NOT EXISTS "sessions_user_idx" ON "sessions" USING btree ("user_id");
CREATE INDEX IF NOT EXISTS "sessions_expires_idx" ON "sessions" USING btree ("expires_at");
CREATE UNIQUE INDEX IF NOT EXISTS "app_settings_key_key" ON "app_settings" USING btree ("key");
CREATE UNIQUE INDEX IF NOT EXISTS "document_sequences_key" ON "document_sequences" USING btree ("doc_type","period");
CREATE UNIQUE INDEX IF NOT EXISTS "idempotency_keys_scope_request" ON "idempotency_keys" USING btree ("scope","request_id");
CREATE INDEX IF NOT EXISTS "idempotency_keys_time_idx" ON "idempotency_keys" USING btree ("created_at");
CREATE INDEX IF NOT EXISTS "runbook_steps_runbook_idx" ON "runbook_steps" USING btree ("runbook_id");
