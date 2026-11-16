DROP TABLE "friday_actions" CASCADE;--> statement-breakpoint
DROP TABLE "friday_briefings" CASCADE;--> statement-breakpoint
DROP TABLE "friday_events" CASCADE;--> statement-breakpoint
DROP TABLE "friday_jobs" CASCADE;--> statement-breakpoint
DROP TABLE "friday_memories" CASCADE;--> statement-breakpoint
DROP TABLE "friday_messages" CASCADE;--> statement-breakpoint
DROP TABLE "friday_partners" CASCADE;--> statement-breakpoint
DROP TABLE "friday_reports" CASCADE;--> statement-breakpoint
DROP TABLE "friday_settings" CASCADE;--> statement-breakpoint
DELETE FROM "notifications" WHERE "type" = 'friday';