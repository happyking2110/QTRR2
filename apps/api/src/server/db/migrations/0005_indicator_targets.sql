DO $$ BEGIN
 CREATE TYPE "public"."indicator_unit_kind" AS ENUM('percent', 'count');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."indicator_direction" AS ENUM('higher_is_worse', 'lower_is_worse');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "indicator" ADD COLUMN "unit_kind" "indicator_unit_kind";--> statement-breakpoint
ALTER TABLE "indicator" ADD COLUMN "unit_label" text;--> statement-breakpoint
ALTER TABLE "indicator" ADD COLUMN "direction" "indicator_direction";--> statement-breakpoint
ALTER TABLE "indicator" ADD COLUMN "yellow_at" numeric;--> statement-breakpoint
ALTER TABLE "indicator" ADD COLUMN "red_at" numeric;--> statement-breakpoint
ALTER TABLE "indicator" ADD COLUMN "target_value" numeric;--> statement-breakpoint
UPDATE "indicator"
SET
  "unit_kind" = CASE
    WHEN POSITION('%' IN "threshold_low_text") > 0 
      OR POSITION('%' IN "threshold_mid_text") > 0 
      OR POSITION('%' IN "threshold_high_text") > 0 THEN 'percent'::indicator_unit_kind
    ELSE 'count'::indicator_unit_kind
  END,
  "unit_label" = CASE
    WHEN POSITION('%' IN "threshold_low_text") > 0 
      OR POSITION('%' IN "threshold_mid_text") > 0 
      OR POSITION('%' IN "threshold_high_text") > 0 THEN '%'
    ELSE 'vụ việc'
  END,
  "direction" = CASE
    WHEN TRIM("threshold_low_text") LIKE '≤%' OR TRIM("threshold_low_text") LIKE '<=%' OR TRIM("threshold_low_text") LIKE '<%' OR TRIM("threshold_low_text") IN ('0', '0%') THEN 'higher_is_worse'::indicator_direction
    WHEN TRIM("threshold_low_text") LIKE '≥%' OR TRIM("threshold_low_text") LIKE '>=%' OR TRIM("threshold_low_text") LIKE '>%' OR TRIM("threshold_low_text") IN ('1', '1%') THEN 'lower_is_worse'::indicator_direction
    ELSE NULL
  END;
ALTER TABLE "indicator" ALTER COLUMN "unit_kind" SET DEFAULT 'count'::indicator_unit_kind;--> statement-breakpoint
ALTER TABLE "indicator" ALTER COLUMN "unit_label" SET DEFAULT 'vụ việc';--> statement-breakpoint
ALTER TABLE "indicator" ALTER COLUMN "unit_kind" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "indicator" ALTER COLUMN "unit_label" SET NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 GRANT USAGE ON TYPE "public"."indicator_unit_kind" TO hsrr_app;
 GRANT USAGE ON TYPE "public"."indicator_direction" TO hsrr_app;
EXCEPTION
 WHEN undefined_object THEN null;
END $$;
