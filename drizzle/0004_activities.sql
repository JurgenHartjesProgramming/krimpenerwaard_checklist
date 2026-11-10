CREATE TYPE "public"."activity_status" AS ENUM('not_started', 'in_progress', 'done', 'not_applicable');--> statement-breakpoint
CREATE TYPE "public"."stakeholder_role" AS ENUM('lead', 'involved');--> statement-breakpoint
CREATE TABLE "activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"phase_id" uuid NOT NULL,
	"number" text DEFAULT '' NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"result" text DEFAULT '' NOT NULL,
	"status" "activity_status" DEFAULT 'not_started' NOT NULL,
	"status_changed_by" uuid,
	"status_changed_at" timestamp with time zone,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "stakeholders" ADD COLUMN "activity_id" uuid;--> statement-breakpoint
ALTER TABLE "stakeholders" ADD COLUMN "role" "stakeholder_role" DEFAULT 'involved' NOT NULL;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_phase_id_phases_id_fk" FOREIGN KEY ("phase_id") REFERENCES "public"."phases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_status_changed_by_users_id_fk" FOREIGN KEY ("status_changed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activities_project_idx" ON "activities" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "activities_phase_idx" ON "activities" USING btree ("phase_id");--> statement-breakpoint
ALTER TABLE "stakeholders" ADD CONSTRAINT "stakeholders_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "stakeholders_activity_idx" ON "stakeholders" USING btree ("activity_id");