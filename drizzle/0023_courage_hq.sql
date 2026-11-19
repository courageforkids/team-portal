CREATE TYPE "public"."hq_kind" AS ENUM('task', 'grant', 'gift', 'contact');--> statement-breakpoint
CREATE TABLE "hq_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"kind" "hq_kind" NOT NULL,
	"title" text NOT NULL,
	"subtitle" text DEFAULT '' NOT NULL,
	"category" text DEFAULT '' NOT NULL,
	"date" date,
	"amount_cents" integer,
	"next_step" text DEFAULT '' NOT NULL,
	"person" text DEFAULT '' NOT NULL,
	"link" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"extra" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"done_at" timestamp with time zone,
	"external_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "hq_items" ADD CONSTRAINT "hq_items_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "hq_items_owner_kind_idx" ON "hq_items" USING btree ("owner_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "hq_items_owner_external_idx" ON "hq_items" USING btree ("owner_id","external_id");