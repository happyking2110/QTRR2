CREATE TYPE "public"."assignment_target_type" AS ENUM('control', 'indicator');--> statement-breakpoint
CREATE TYPE "public"."cycle_status" AS ENUM('open', 'archived');--> statement-breakpoint
CREATE TYPE "public"."indicator_kind" AS ENUM('kri', 'kci');--> statement-breakpoint
CREATE TYPE "public"."period_kind" AS ENUM('month', 'quarter', 'event');--> statement-breakpoint
CREATE TYPE "public"."submission_status" AS ENUM('pending', 'approved', 'rejected', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."unit_kind" AS ENUM('department', 'center', 'group');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'ban4', 'unit', 'viewer');--> statement-breakpoint
CREATE TYPE "public"."zone_source" AS ENUM('auto', 'manual');--> statement-breakpoint
CREATE TABLE "action_control" (
	"action_id" uuid NOT NULL,
	"control_id" uuid NOT NULL,
	CONSTRAINT "action_control_action_id_control_id_pk" PRIMARY KEY("action_id","control_id")
);
--> statement-breakpoint
CREATE TABLE "action_plan" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"code" varchar(50) NOT NULL,
	"description" text NOT NULL,
	"responsibility_text" text NOT NULL,
	"deliverable" text NOT NULL,
	"due_text" text NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "action_plan_profile_id_code_unique" UNIQUE("profile_id","code")
);
--> statement-breakpoint
CREATE TABLE "action_task" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"action_id" uuid NOT NULL,
	"name" text NOT NULL,
	"unit_id" uuid,
	"due_date" date NOT NULL,
	"weight" integer DEFAULT 1 NOT NULL,
	"source_text" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "action_update" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"period_key" varchar(50) NOT NULL,
	"progress" integer NOT NULL,
	"note" text,
	"status" "submission_status" DEFAULT 'pending' NOT NULL,
	"submitted_by" uuid,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"review_note" text
);
--> statement-breakpoint
CREATE TABLE "app_setting" (
	"key" varchar(100) PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app_user" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255) NOT NULL,
	"full_name" varchar(255) NOT NULL,
	"role" "user_role" NOT NULL,
	"unit_id" uuid,
	"password_hash" varchar(255) NOT NULL,
	"must_change_password" boolean DEFAULT true NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"failed_attempts" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "app_user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid,
	"action" varchar(100) NOT NULL,
	"entity" varchar(100) NOT NULL,
	"entity_id" varchar(100),
	"before" jsonb,
	"after" jsonb,
	"ip" varchar(45)
);
--> statement-breakpoint
CREATE TABLE "cause" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"code" varchar(50) NOT NULL,
	"cause_group" varchar(100) NOT NULL,
	"description" text NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "cause_profile_id_code_unique" UNIQUE("profile_id","code")
);
--> statement-breakpoint
CREATE TABLE "control" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"code" varchar(50) NOT NULL,
	"description" text NOT NULL,
	"owner_text" text NOT NULL,
	"frequency" varchar(100) NOT NULL,
	"objective" varchar(100) NOT NULL,
	"method" varchar(100) NOT NULL,
	"design_eff" varchar(100) NOT NULL,
	"operating_eff" varchar(100) NOT NULL,
	"overall_eff" varchar(100) NOT NULL,
	"needs_supplement" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "control_profile_id_code_unique" UNIQUE("profile_id","code")
);
--> statement-breakpoint
CREATE TABLE "control_cause" (
	"control_id" uuid NOT NULL,
	"cause_id" uuid NOT NULL,
	CONSTRAINT "control_cause_control_id_cause_id_pk" PRIMARY KEY("control_id","cause_id")
);
--> statement-breakpoint
CREATE TABLE "cycle" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"year" integer NOT NULL,
	"status" "cycle_status" DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cycle_year_unique" UNIQUE("year")
);
--> statement-breakpoint
CREATE TABLE "impact" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"code" varchar(50) NOT NULL,
	"impact_group" varchar(100) NOT NULL,
	"description" text NOT NULL,
	"level" varchar(50) NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "impact_profile_id_code_unique" UNIQUE("profile_id","code")
);
--> statement-breakpoint
CREATE TABLE "indicator" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"code" varchar(50) NOT NULL,
	"kind" "indicator_kind" NOT NULL,
	"name" text NOT NULL,
	"formula" text NOT NULL,
	"frequency" varchar(100) NOT NULL,
	"period_kind" "period_kind" NOT NULL,
	"threshold_low_text" text NOT NULL,
	"threshold_mid_text" text NOT NULL,
	"threshold_high_text" text NOT NULL,
	"zone_rules" jsonb,
	"note" text,
	"owner_unit_id" uuid,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "indicator_profile_id_code_unique" UNIQUE("profile_id","code")
);
--> statement-breakpoint
CREATE TABLE "indicator_reading" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"indicator_id" uuid NOT NULL,
	"period_key" varchar(50) NOT NULL,
	"value_num" numeric,
	"value_text" text,
	"zone" varchar(20),
	"zone_source" "zone_source",
	"note" text,
	"status" "submission_status" DEFAULT 'pending' NOT NULL,
	"submitted_by" uuid,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"review_note" text
);
--> statement-breakpoint
CREATE TABLE "password_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"password_hash" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "period" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cycle_id" uuid NOT NULL,
	"key" varchar(50) NOT NULL,
	"kind" "period_kind" NOT NULL,
	"label" varchar(255) NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"closed_at" timestamp with time zone,
	"closed_by" uuid,
	"reopen_reason" text,
	CONSTRAINT "period_cycle_id_key_unique" UNIQUE("cycle_id","key")
);
--> statement-breakpoint
CREATE TABLE "residual_assessment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"period_key" varchar(50) NOT NULL,
	"impact" varchar(50) NOT NULL,
	"likelihood" varchar(50) NOT NULL,
	"level" varchar(50) NOT NULL,
	"entered_by" uuid,
	"entered_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "residual_assessment_profile_id_period_key_unique" UNIQUE("profile_id","period_key")
);
--> statement-breakpoint
CREATE TABLE "risk_profile" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cycle_id" uuid NOT NULL,
	"risk_code" varchar(50) NOT NULL,
	"hsrr_code" varchar(100) NOT NULL,
	"name" text NOT NULL,
	"risk_type" varchar(255) NOT NULL,
	"risk_zone" varchar(255) NOT NULL,
	"risk_group" varchar(255) NOT NULL,
	"owner" varchar(255) NOT NULL,
	"related_activity" text NOT NULL,
	"prepared_by_unit" varchar(255) NOT NULL,
	"description" text NOT NULL,
	"inherent_impact" varchar(50) NOT NULL,
	"inherent_likelihood" varchar(50) NOT NULL,
	"inherent_level" varchar(50) NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "risk_profile_cycle_id_risk_code_unique" UNIQUE("cycle_id","risk_code")
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "session_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "unit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(50) NOT NULL,
	"name" varchar(255) NOT NULL,
	"kind" "unit_kind" NOT NULL,
	CONSTRAINT "unit_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "unit_assignment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"unit_id" uuid NOT NULL,
	"target_type" "assignment_target_type" NOT NULL,
	"target_id" uuid NOT NULL,
	CONSTRAINT "unit_assignment_unit_target_unique" UNIQUE("unit_id","target_type","target_id")
);
--> statement-breakpoint
ALTER TABLE "action_control" ADD CONSTRAINT "action_control_action_id_action_plan_id_fk" FOREIGN KEY ("action_id") REFERENCES "public"."action_plan"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_control" ADD CONSTRAINT "action_control_control_id_control_id_fk" FOREIGN KEY ("control_id") REFERENCES "public"."control"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_plan" ADD CONSTRAINT "action_plan_profile_id_risk_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."risk_profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_task" ADD CONSTRAINT "action_task_action_id_action_plan_id_fk" FOREIGN KEY ("action_id") REFERENCES "public"."action_plan"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_task" ADD CONSTRAINT "action_task_unit_id_unit_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."unit"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_update" ADD CONSTRAINT "action_update_task_id_action_task_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."action_task"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_update" ADD CONSTRAINT "action_update_submitted_by_app_user_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_update" ADD CONSTRAINT "action_update_reviewed_by_app_user_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_setting" ADD CONSTRAINT "app_setting_updated_by_app_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_user" ADD CONSTRAINT "app_user_unit_id_unit_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."unit"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cause" ADD CONSTRAINT "cause_profile_id_risk_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."risk_profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "control" ADD CONSTRAINT "control_profile_id_risk_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."risk_profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "control_cause" ADD CONSTRAINT "control_cause_control_id_control_id_fk" FOREIGN KEY ("control_id") REFERENCES "public"."control"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "control_cause" ADD CONSTRAINT "control_cause_cause_id_cause_id_fk" FOREIGN KEY ("cause_id") REFERENCES "public"."cause"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "impact" ADD CONSTRAINT "impact_profile_id_risk_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."risk_profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indicator" ADD CONSTRAINT "indicator_profile_id_risk_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."risk_profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indicator" ADD CONSTRAINT "indicator_owner_unit_id_unit_id_fk" FOREIGN KEY ("owner_unit_id") REFERENCES "public"."unit"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indicator_reading" ADD CONSTRAINT "indicator_reading_indicator_id_indicator_id_fk" FOREIGN KEY ("indicator_id") REFERENCES "public"."indicator"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indicator_reading" ADD CONSTRAINT "indicator_reading_submitted_by_app_user_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indicator_reading" ADD CONSTRAINT "indicator_reading_reviewed_by_app_user_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_history" ADD CONSTRAINT "password_history_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "period" ADD CONSTRAINT "period_cycle_id_cycle_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."cycle"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "period" ADD CONSTRAINT "period_closed_by_app_user_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "residual_assessment" ADD CONSTRAINT "residual_assessment_profile_id_risk_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."risk_profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "residual_assessment" ADD CONSTRAINT "residual_assessment_entered_by_app_user_id_fk" FOREIGN KEY ("entered_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk_profile" ADD CONSTRAINT "risk_profile_cycle_id_cycle_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."cycle"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unit_assignment" ADD CONSTRAINT "unit_assignment_unit_id_unit_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."unit"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "action_update_task_period_status_idx" ON "action_update" USING btree ("task_id","period_key","status");--> statement-breakpoint
CREATE INDEX "audit_log_at_entity_idx" ON "audit_log" USING btree ("at","entity");--> statement-breakpoint
CREATE INDEX "indicator_reading_indicator_period_status_idx" ON "indicator_reading" USING btree ("indicator_id","period_key","status");