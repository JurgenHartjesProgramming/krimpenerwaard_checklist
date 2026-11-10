CREATE TABLE "activity_conflicts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"activity_id" uuid NOT NULL,
	"conflict_number" integer,
	"title" text NOT NULL,
	"theme" text DEFAULT '' NOT NULL,
	"severity" text DEFAULT '' NOT NULL,
	"side_a" text DEFAULT '' NOT NULL,
	"side_b" text DEFAULT '' NOT NULL,
	"why" text DEFAULT '' NOT NULL,
	"solutions" text DEFAULT '' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "stakeholders" ADD COLUMN "profile" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "activity_conflicts" ADD CONSTRAINT "activity_conflicts_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_conflicts" ADD CONSTRAINT "activity_conflicts_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_conflicts_activity_idx" ON "activity_conflicts" USING btree ("activity_id");