CREATE TABLE "academy_challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"details" text DEFAULT '' NOT NULL,
	"points" integer DEFAULT 10 NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"winner_cape" text,
	"decided_at" timestamp with time zone,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "academy_claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"details" text DEFAULT '' NOT NULL,
	"points" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"reviewed_by_id" uuid,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cape_board_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cape" text NOT NULL,
	"body" text NOT NULL,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cape_bonuses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"cape" text,
	"points" integer NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"source" text DEFAULT 'admin' NOT NULL,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cape_motto_votes" (
	"cape" text NOT NULL,
	"user_id" uuid NOT NULL,
	"motto_id" uuid NOT NULL,
	CONSTRAINT "cape_motto_votes_cape_user_id_pk" PRIMARY KEY("cape","user_id")
);
--> statement-breakpoint
CREATE TABLE "cape_mottos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cape" text NOT NULL,
	"text" text NOT NULL,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cape_seasons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"theme" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "paper_planes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"from_id" uuid,
	"to_id" uuid NOT NULL,
	"style" text DEFAULT 'thanks' NOT NULL,
	"sticker" text,
	"message" text NOT NULL,
	"public" boolean DEFAULT false NOT NULL,
	"seen_at" timestamp with time zone,
	"reported_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plane_hearts" (
	"plane_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plane_hearts_plane_id_user_id_pk" PRIMARY KEY("plane_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "trivia_daily" (
	"day" date PRIMARY KEY NOT NULL,
	"question_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trivia_daily_answers" (
	"day" date NOT NULL,
	"user_id" uuid NOT NULL,
	"choice" integer NOT NULL,
	"correct" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trivia_daily_answers_day_user_id_pk" PRIMARY KEY("day","user_id")
);
--> statement-breakpoint
CREATE TABLE "trivia_duels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"challenger_id" uuid NOT NULL,
	"opponent_id" uuid NOT NULL,
	"category" text,
	"question_ids" jsonb NOT NULL,
	"challenger_answers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"opponent_answers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"challenger_served_at" timestamp with time zone,
	"opponent_served_at" timestamp with time zone,
	"status" text DEFAULT 'waiting' NOT NULL,
	"winner_id" uuid,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trivia_night_answers" (
	"night_id" uuid NOT NULL,
	"q_index" integer NOT NULL,
	"user_id" uuid NOT NULL,
	"cape" text,
	"choice" integer NOT NULL,
	"correct" boolean NOT NULL,
	"ms" integer NOT NULL,
	CONSTRAINT "trivia_night_answers_night_id_q_index_user_id_pk" PRIMARY KEY("night_id","q_index","user_id")
);
--> statement-breakpoint
CREATE TABLE "trivia_nights" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text DEFAULT 'Trivia Night' NOT NULL,
	"status" text DEFAULT 'lobby' NOT NULL,
	"question_ids" jsonb NOT NULL,
	"current" integer DEFAULT -1 NOT NULL,
	"question_started_at" timestamp with time zone,
	"winner_cape" text,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trivia_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category" text NOT NULL,
	"question" text NOT NULL,
	"choices" jsonb NOT NULL,
	"answer" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "cape" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "sorted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "hero" jsonb;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "hero_avatar" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "photo_file_id" uuid;--> statement-breakpoint
ALTER TABLE "academy_challenges" ADD CONSTRAINT "academy_challenges_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academy_claims" ADD CONSTRAINT "academy_claims_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academy_claims" ADD CONSTRAINT "academy_claims_reviewed_by_id_users_id_fk" FOREIGN KEY ("reviewed_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cape_board_notes" ADD CONSTRAINT "cape_board_notes_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cape_bonuses" ADD CONSTRAINT "cape_bonuses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cape_bonuses" ADD CONSTRAINT "cape_bonuses_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cape_motto_votes" ADD CONSTRAINT "cape_motto_votes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cape_motto_votes" ADD CONSTRAINT "cape_motto_votes_motto_id_cape_mottos_id_fk" FOREIGN KEY ("motto_id") REFERENCES "public"."cape_mottos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cape_mottos" ADD CONSTRAINT "cape_mottos_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paper_planes" ADD CONSTRAINT "paper_planes_from_id_users_id_fk" FOREIGN KEY ("from_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paper_planes" ADD CONSTRAINT "paper_planes_to_id_users_id_fk" FOREIGN KEY ("to_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plane_hearts" ADD CONSTRAINT "plane_hearts_plane_id_paper_planes_id_fk" FOREIGN KEY ("plane_id") REFERENCES "public"."paper_planes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plane_hearts" ADD CONSTRAINT "plane_hearts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trivia_daily" ADD CONSTRAINT "trivia_daily_question_id_trivia_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."trivia_questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trivia_daily_answers" ADD CONSTRAINT "trivia_daily_answers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trivia_duels" ADD CONSTRAINT "trivia_duels_challenger_id_users_id_fk" FOREIGN KEY ("challenger_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trivia_duels" ADD CONSTRAINT "trivia_duels_opponent_id_users_id_fk" FOREIGN KEY ("opponent_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trivia_night_answers" ADD CONSTRAINT "trivia_night_answers_night_id_trivia_nights_id_fk" FOREIGN KEY ("night_id") REFERENCES "public"."trivia_nights"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trivia_night_answers" ADD CONSTRAINT "trivia_night_answers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trivia_nights" ADD CONSTRAINT "trivia_nights_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trivia_questions" ADD CONSTRAINT "trivia_questions_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "academy_claims_status_idx" ON "academy_claims" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "cape_bonuses_created_idx" ON "cape_bonuses" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "paper_planes_to_idx" ON "paper_planes" USING btree ("to_id","created_at");--> statement-breakpoint
CREATE INDEX "paper_planes_from_idx" ON "paper_planes" USING btree ("from_id","created_at");--> statement-breakpoint
CREATE INDEX "trivia_duels_challenger_idx" ON "trivia_duels" USING btree ("challenger_id","created_at");--> statement-breakpoint
CREATE INDEX "trivia_duels_opponent_idx" ON "trivia_duels" USING btree ("opponent_id","created_at");