ALTER TABLE "action_plan" ADD COLUMN "manually_edited_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "cause" ADD COLUMN "manually_edited_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "control" ADD COLUMN "manually_edited_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "impact" ADD COLUMN "manually_edited_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "indicator" ADD COLUMN "manually_edited_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "risk_profile" ADD COLUMN "manually_edited_at" timestamp with time zone;