ALTER TABLE "task_drafts" ADD COLUMN "kind" text DEFAULT 'task' NOT NULL;--> statement-breakpoint
ALTER TABLE "task_drafts" ADD COLUMN "format" text DEFAULT 'task-input' NOT NULL;--> statement-breakpoint
ALTER TABLE "task_drafts" ADD COLUMN "title" text DEFAULT '' NOT NULL;--> statement-breakpoint
UPDATE "task_drafts" SET "title" = coalesce("input"->>'title', '') WHERE "title" = '';
