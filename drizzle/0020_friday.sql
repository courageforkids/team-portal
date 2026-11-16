CREATE TABLE "friday_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tool" text NOT NULL,
	"input" jsonb NOT NULL,
	"input_hash" text NOT NULL,
	"level" integer NOT NULL,
	"summary" text NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"impact" text DEFAULT '' NOT NULL,
	"risks" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"result" jsonb,
	"job_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "friday_briefings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"for_date" date NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "friday_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid,
	"kind" text NOT NULL,
	"tool" text,
	"ok" boolean DEFAULT true NOT NULL,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "friday_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"instructions" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"run_at" timestamp with time zone DEFAULT now() NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"steps" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"state" jsonb,
	"result" text,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "friday_memories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"source" text NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "friday_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"channel" text DEFAULT 'text' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "friday_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"owner_id" uuid,
	"paused" boolean DEFAULT false NOT NULL,
	"permissions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"nightly_hour" integer DEFAULT 1 NOT NULL,
	"briefing_hour" integer DEFAULT 6 NOT NULL,
	"quiet_start" integer DEFAULT 22 NOT NULL,
	"quiet_end" integer DEFAULT 7 NOT NULL,
	"monthly_budget_cents" integer DEFAULT 2000 NOT NULL,
	"spent_month" text,
	"spent_mills" integer DEFAULT 0 NOT NULL,
	"last_nightly_on" date,
	"last_briefing_on" date,
	"last_worker_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "friday_settings" ADD CONSTRAINT "friday_settings_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "friday_actions_status_idx" ON "friday_actions" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "friday_briefings_date_idx" ON "friday_briefings" USING btree ("for_date");--> statement-breakpoint
CREATE INDEX "friday_events_created_idx" ON "friday_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "friday_jobs_due_idx" ON "friday_jobs" USING btree ("status","run_at");--> statement-breakpoint
CREATE INDEX "friday_memories_kind_idx" ON "friday_memories" USING btree ("kind","updated_at");--> statement-breakpoint
CREATE INDEX "friday_messages_created_idx" ON "friday_messages" USING btree ("created_at");