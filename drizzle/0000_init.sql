CREATE TABLE "admin_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"admin_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip" text,
	"user_agent" text
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"restaurant_id" uuid,
	"actor_type" text NOT NULL,
	"actor_id" text,
	"action" text NOT NULL,
	"details" jsonb,
	"ip" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"pos_id" bigint NOT NULL,
	"name_ar" text NOT NULL,
	"name_en" text,
	"icon" text,
	"color" text,
	"image_sha" text,
	"sort" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dining_tables" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"pos_uid" text NOT NULL,
	"number" integer NOT NULL,
	"name" text,
	"seats" integer,
	"status" text DEFAULT 'active' NOT NULL,
	"token" text NOT NULL,
	"token_rotated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "enrollment_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"code_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"used_by_device_id" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"sha256" text NOT NULL,
	"mime" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"bytes" integer NOT NULL,
	"path" text NOT NULL,
	"source" text DEFAULT 'pos' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "modifier_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"pos_id" bigint NOT NULL,
	"name" text NOT NULL,
	"min_select" integer DEFAULT 0 NOT NULL,
	"max_select" integer DEFAULT 1 NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "modifier_options" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"group_pos_id" bigint NOT NULL,
	"pos_id" bigint NOT NULL,
	"name" text NOT NULL,
	"price_delta" bigint DEFAULT 0 NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" uuid NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"status" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor" text NOT NULL,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" uuid NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"product_pos_id" bigint NOT NULL,
	"pos_unit_id" bigint NOT NULL,
	"variant_pos_id" bigint,
	"name_ar" text NOT NULL,
	"name_en" text,
	"variant_name" text,
	"quantity" integer NOT NULL,
	"unit_price" bigint NOT NULL,
	"modifiers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"note" text,
	"prep_minutes" integer NOT NULL,
	"line_total" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"table_id" uuid NOT NULL,
	"table_pos_uid" text NOT NULL,
	"table_number" integer NOT NULL,
	"number" integer NOT NULL,
	"tracking_token" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"status" text DEFAULT 'submitted' NOT NULL,
	"subtotal" bigint NOT NULL,
	"total" bigint NOT NULL,
	"currency_code" text NOT NULL,
	"currency_decimals" integer NOT NULL,
	"note" text,
	"lang" text DEFAULT 'ar' NOT NULL,
	"location" jsonb,
	"client_ip" text,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"delivered_at" timestamp with time zone,
	"accepted_at" timestamp with time zone,
	"preparing_at" timestamp with time zone,
	"prep_minutes" integer,
	"estimated_ready_at" timestamp with time zone,
	"eta_changed_at" timestamp with time zone,
	"ready_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"rejected_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"reason" text,
	"pos_order_id" bigint,
	"group_label" text,
	"status_seq" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_admins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_login_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "pos_devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"token_hash" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"installation_code" text,
	"app_version" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone,
	"last_ip" text,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "product_modifier_groups" (
	"restaurant_id" uuid NOT NULL,
	"product_pos_id" bigint NOT NULL,
	"group_pos_id" bigint NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "product_modifier_groups_restaurant_id_product_pos_id_group_pos_id_pk" PRIMARY KEY("restaurant_id","product_pos_id","group_pos_id")
);
--> statement-breakpoint
CREATE TABLE "product_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"product_pos_id" bigint NOT NULL,
	"pos_id" bigint NOT NULL,
	"name" text NOT NULL,
	"price_override" bigint,
	"image_sha" text,
	"sort" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"pos_id" bigint NOT NULL,
	"pos_unit_id" bigint NOT NULL,
	"category_pos_id" bigint,
	"name_ar" text NOT NULL,
	"name_en" text,
	"description_ar" text,
	"description_en" text,
	"price" bigint NOT NULL,
	"image_sha" text,
	"prep_minutes" integer,
	"is_available" boolean DEFAULT true NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"is_featured" boolean DEFAULT false NOT NULL,
	"is_new" boolean DEFAULT false NOT NULL,
	"label_ar" text,
	"label_en" text,
	"popularity" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "promotions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"title_ar" text,
	"title_en" text,
	"subtitle_ar" text,
	"subtitle_en" text,
	"cta_ar" text,
	"cta_en" text,
	"cta_target" text,
	"image_media_id" uuid NOT NULL,
	"mobile_image_media_id" uuid,
	"sort" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "restaurants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name_ar" text NOT NULL,
	"name_en" text,
	"description_ar" text,
	"description_en" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"service_expires_at" timestamp with time zone,
	"ordering_paused" boolean DEFAULT false NOT NULL,
	"installation_code" text,
	"license_customer" text,
	"phone" text,
	"whatsapp" text,
	"address" text,
	"show_contact" boolean DEFAULT true NOT NULL,
	"logo_media_id" uuid,
	"cover_media_id" uuid,
	"theme" jsonb NOT NULL,
	"default_lang" text DEFAULT 'ar' NOT NULL,
	"languages" jsonb DEFAULT '["ar","en"]'::jsonb NOT NULL,
	"currency_code" text DEFAULT 'JOD' NOT NULL,
	"currency_symbol" text DEFAULT 'د.أ' NOT NULL,
	"currency_decimals" integer DEFAULT 3 NOT NULL,
	"opening_hours" jsonb,
	"timezone" text DEFAULT 'Asia/Amman' NOT NULL,
	"geo_enabled" boolean DEFAULT false NOT NULL,
	"lat" double precision,
	"lng" double precision,
	"geo_mode" text DEFAULT 'radius' NOT NULL,
	"radius_m" integer DEFAULT 80 NOT NULL,
	"polygon" jsonb,
	"max_accuracy_m" integer DEFAULT 100 NOT NULL,
	"default_prep_minutes" integer DEFAULT 15 NOT NULL,
	"require_acceptance" boolean DEFAULT true NOT NULL,
	"menu_version" integer DEFAULT 0 NOT NULL,
	"menu_hash" text,
	"menu_synced_at" timestamp with time zone,
	"pos_last_seen_at" timestamp with time zone,
	"order_seq" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "revoked_table_tokens" (
	"token" text PRIMARY KEY NOT NULL,
	"table_id" uuid NOT NULL,
	"revoked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"device_id" uuid,
	"kind" text NOT NULL,
	"ok" boolean NOT NULL,
	"detail" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "admin_sessions" ADD CONSTRAINT "admin_sessions_admin_id_platform_admins_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."platform_admins"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dining_tables" ADD CONSTRAINT "dining_tables_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollment_codes" ADD CONSTRAINT "enrollment_codes_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "modifier_groups" ADD CONSTRAINT "modifier_groups_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "modifier_options" ADD CONSTRAINT "modifier_options_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_table_id_dining_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."dining_tables"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pos_devices" ADD CONSTRAINT "pos_devices_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_modifier_groups" ADD CONSTRAINT "product_modifier_groups_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revoked_table_tokens" ADD CONSTRAINT "revoked_table_tokens_table_id_dining_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."dining_tables"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ix_admin_sessions_admin" ON "admin_sessions" USING btree ("admin_id");--> statement-breakpoint
CREATE INDEX "ix_audit_restaurant_at" ON "audit_logs" USING btree ("restaurant_id","at");--> statement-breakpoint
CREATE UNIQUE INDEX "ux_categories_pos" ON "categories" USING btree ("restaurant_id","pos_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ux_tables_pos_uid" ON "dining_tables" USING btree ("restaurant_id","pos_uid");--> statement-breakpoint
CREATE UNIQUE INDEX "ux_tables_token" ON "dining_tables" USING btree ("token");--> statement-breakpoint
CREATE UNIQUE INDEX "ux_enrollment_codes_hash" ON "enrollment_codes" USING btree ("code_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "ux_media_restaurant_sha" ON "media" USING btree ("restaurant_id","sha256");--> statement-breakpoint
CREATE UNIQUE INDEX "ux_modifier_groups_pos" ON "modifier_groups" USING btree ("restaurant_id","pos_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ux_modifier_options_pos" ON "modifier_options" USING btree ("restaurant_id","pos_id");--> statement-breakpoint
CREATE INDEX "ix_order_events_order" ON "order_events" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "ix_order_items_order" ON "order_items" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ux_orders_idempotency" ON "orders" USING btree ("restaurant_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "ux_orders_tracking" ON "orders" USING btree ("tracking_token");--> statement-breakpoint
CREATE UNIQUE INDEX "ux_orders_number" ON "orders" USING btree ("restaurant_id","number");--> statement-breakpoint
CREATE INDEX "ix_orders_restaurant_status" ON "orders" USING btree ("restaurant_id","status");--> statement-breakpoint
CREATE INDEX "ix_orders_submitted" ON "orders" USING btree ("restaurant_id","submitted_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ux_platform_admins_email" ON "platform_admins" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "ux_pos_devices_token" ON "pos_devices" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "ix_pos_devices_restaurant" ON "pos_devices" USING btree ("restaurant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ux_variants_pos" ON "product_variants" USING btree ("restaurant_id","pos_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ux_products_pos" ON "products" USING btree ("restaurant_id","pos_id");--> statement-breakpoint
CREATE INDEX "ix_products_category" ON "products" USING btree ("restaurant_id","category_pos_id");--> statement-breakpoint
CREATE INDEX "ix_promotions_restaurant" ON "promotions" USING btree ("restaurant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ux_restaurants_slug" ON "restaurants" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "ix_sync_logs_restaurant_at" ON "sync_logs" USING btree ("restaurant_id","at");