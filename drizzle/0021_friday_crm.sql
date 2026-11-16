CREATE TABLE "friday_partners" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"kind" text DEFAULT 'brand' NOT NULL,
	"status" text DEFAULT 'prospect' NOT NULL,
	"contact" text DEFAULT '' NOT NULL,
	"last_contact_on" date,
	"next_step" text DEFAULT '' NOT NULL,
	"next_step_on" date,
	"promised" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"source" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "friday_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"content" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "friday_settings" ADD COLUMN "totp_secret" text;--> statement-breakpoint
ALTER TABLE "friday_settings" ADD COLUMN "totp_pending" text;--> statement-breakpoint
ALTER TABLE "friday_settings" ADD COLUMN "org_seeded" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "friday_partners_name_idx" ON "friday_partners" USING btree ("name");--> statement-breakpoint
CREATE INDEX "friday_reports_kind_idx" ON "friday_reports" USING btree ("kind","created_at");