CREATE TABLE "invoice_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"table_pos_uid" text NOT NULL,
	"table_number" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"status_seq" integer DEFAULT 0 NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"delivered_at" timestamp with time zone,
	"handled_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "invoice_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "table_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"table_id" uuid NOT NULL,
	"token" text NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_activity_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	"close_reason" text,
	"visible_until" timestamp with time zone,
	"version" integer DEFAULT 0 NOT NULL,
	"customer_version" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "table_sessions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "session_id" uuid;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "invoice" jsonb;--> statement-breakpoint
ALTER TABLE "restaurants" ADD COLUMN "invoice_visible_minutes" integer DEFAULT 15 NOT NULL;--> statement-breakpoint
ALTER TABLE "restaurants" ADD COLUMN "session_idle_minutes" integer DEFAULT 240 NOT NULL;--> statement-breakpoint
ALTER TABLE "invoice_requests" ADD CONSTRAINT "invoice_requests_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_requests" ADD CONSTRAINT "invoice_requests_session_id_table_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."table_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "table_sessions" ADD CONSTRAINT "table_sessions_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "table_sessions" ADD CONSTRAINT "table_sessions_table_id_dining_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."dining_tables"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ux_invoice_requests_active" ON "invoice_requests" USING btree ("session_id") WHERE status in ('pending', 'delivered', 'acknowledged');--> statement-breakpoint
CREATE INDEX "ix_invoice_requests_restaurant" ON "invoice_requests" USING btree ("restaurant_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "ux_table_sessions_token" ON "table_sessions" USING btree ("token");--> statement-breakpoint
CREATE UNIQUE INDEX "ux_table_sessions_open" ON "table_sessions" USING btree ("table_id") WHERE closed_at is null;--> statement-breakpoint
CREATE INDEX "ix_table_sessions_restaurant" ON "table_sessions" USING btree ("restaurant_id","opened_at");--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_session_id_table_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."table_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ix_orders_session" ON "orders" USING btree ("session_id");--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON public.table_sessions, public.invoice_requests FROM anon, authenticated';
  END IF;
END $$;
