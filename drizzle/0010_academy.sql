CREATE TABLE "cape_bonuses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"cape" text,
	"points" integer NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cape_seasons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "paper_planes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"from_id" uuid,
	"to_id" uuid NOT NULL,
	"style" text DEFAULT 'thanks' NOT NULL,
	"message" text NOT NULL,
	"seen_at" timestamp with time zone,
	"reported_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "cape" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "sorted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "birthday" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "birthday_posted_year" integer;--> statement-breakpoint
ALTER TABLE "cape_bonuses" ADD CONSTRAINT "cape_bonuses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cape_bonuses" ADD CONSTRAINT "cape_bonuses_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paper_planes" ADD CONSTRAINT "paper_planes_from_id_users_id_fk" FOREIGN KEY ("from_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paper_planes" ADD CONSTRAINT "paper_planes_to_id_users_id_fk" FOREIGN KEY ("to_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "paper_planes_to_idx" ON "paper_planes" USING btree ("to_id","created_at");--> statement-breakpoint
CREATE INDEX "paper_planes_from_idx" ON "paper_planes" USING btree ("from_id","created_at");