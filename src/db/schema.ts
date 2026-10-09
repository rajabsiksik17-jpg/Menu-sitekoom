import {
  pgTable, uuid, text, boolean, integer, bigint, timestamp, doublePrecision, jsonb, uniqueIndex, index, primaryKey, serial,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * Multi-tenant model. Every restaurant-owned row carries restaurant_id; data access always filters by the tenant that the
 * caller was authenticated for (device token, public slug + table token, or a platform administrator session).
 * Money is stored as integer minor units (amount × 10^decimals of the restaurant currency, e.g. fils for JOD).
 */

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const now = () => sql`now()`;

// ── Platform ───────────────────────────────────────────────────────────────

export const platformAdmins = pgTable("platform_admins", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: ts("created_at").notNull().default(now()),
  lastLoginAt: ts("last_login_at"),
  // Two-factor sign-in (authenticator app, RFC 6238). The secret is sealed with AES-256-GCM (key derived from APP_SECRET).
  totpSecret: text("totp_secret"),
  totpEnabled: boolean("totp_enabled").notNull().default(false),
  totpLastStep: integer("totp_last_step"), // a code is accepted once (no replay)
  failedLogins: integer("failed_logins").notNull().default(0),
  lockedUntil: ts("locked_until"),
}, (t) => [uniqueIndex("ux_platform_admins_email").on(t.email)]).enableRLS();

export const adminSessions = pgTable("admin_sessions", {
  // SHA-256 of the cookie token: a database leak does not reveal live sessions.
  id: text("id").primaryKey(),
  adminId: uuid("admin_id").notNull().references(() => platformAdmins.id, { onDelete: "cascade" }),
  createdAt: ts("created_at").notNull().default(now()),
  expiresAt: ts("expires_at").notNull(),
  ip: text("ip"),
  userAgent: text("user_agent"),
}, (t) => [index("ix_admin_sessions_admin").on(t.adminId)]).enableRLS();

// ── Tenants ────────────────────────────────────────────────────────────────

export type Theme = {
  primary: string; secondary: string; background: "light" | "warm" | "dark";
  buttonStyle: "rounded" | "pill" | "square"; cardStyle: "elevated" | "flat" | "outline"; layout: "grid" | "list";
};
export type OpeningHours = { day: number; open: string; close: string }[]; // day 0 = Sunday, "HH:MM" local time
export type Polygon = [number, number][]; // [lat, lng]

export const restaurants = pgTable("restaurants", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull(),
  nameAr: text("name_ar").notNull(),
  nameEn: text("name_en"),
  descriptionAr: text("description_ar"),
  descriptionEn: text("description_en"),
  // draft = being prepared, active = public, suspended = menu shows "unavailable".
  status: text("status").notNull().default("draft"),
  // Online ordering entitlement (sold separately from the offline POS license).
  serviceExpiresAt: ts("service_expires_at"),
  orderingPaused: boolean("ordering_paused").notNull().default(false),
  // Links the account to one licensed POS installation (the installation code shown on the POS license screen).
  installationCode: text("installation_code"),
  licenseCustomer: text("license_customer"),
  phone: text("phone"),
  whatsapp: text("whatsapp"),
  address: text("address"),
  showContact: boolean("show_contact").notNull().default(true),
  logoMediaId: uuid("logo_media_id"),
  coverMediaId: uuid("cover_media_id"),
  theme: jsonb("theme").$type<Theme>().notNull(),
  defaultLang: text("default_lang").notNull().default("ar"),
  languages: jsonb("languages").$type<string[]>().notNull().default(["ar", "en"]),
  currencyCode: text("currency_code").notNull().default("JOD"),
  currencySymbol: text("currency_symbol").notNull().default("د.أ"),
  currencyDecimals: integer("currency_decimals").notNull().default(3),
  openingHours: jsonb("opening_hours").$type<OpeningHours>(),
  timezone: text("timezone").notNull().default("Asia/Amman"),
  // Geofence: table orders only from inside this area (radius around the point, or a polygon).
  geoEnabled: boolean("geo_enabled").notNull().default(false),
  lat: doublePrecision("lat"),
  lng: doublePrecision("lng"),
  geoMode: text("geo_mode").notNull().default("radius"),
  radiusM: integer("radius_m").notNull().default(80),
  polygon: jsonb("polygon").$type<Polygon>(),
  maxAccuracyM: integer("max_accuracy_m").notNull().default(100),
  // Table sessions: how long the final invoice stays visible to the table's customers after the session is closed, and
  // after how long without activity an open session (all orders finished) is closed automatically.
  invoiceVisibleMinutes: integer("invoice_visible_minutes").notNull().default(15),
  sessionIdleMinutes: integer("session_idle_minutes").notNull().default(240),
  // Synced from the POS settings.
  defaultPrepMinutes: integer("default_prep_minutes").notNull().default(15),
  requireAcceptance: boolean("require_acceptance").notNull().default(true),
  menuVersion: integer("menu_version").notNull().default(0),
  menuHash: text("menu_hash"),
  menuSyncedAt: ts("menu_synced_at"),
  posLastSeenAt: ts("pos_last_seen_at"),
  orderSeq: integer("order_seq").notNull().default(0),
  createdAt: ts("created_at").notNull().default(now()),
  updatedAt: ts("updated_at").notNull().default(now()),
}, (t) => [uniqueIndex("ux_restaurants_slug").on(t.slug)]).enableRLS();

/** A POS installation connected to a restaurant (main device). Authenticates with a bearer token stored hashed. */
export const posDevices = pgTable("pos_devices", {
  id: uuid("id").primaryKey().defaultRandom(),
  restaurantId: uuid("restaurant_id").notNull().references(() => restaurants.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  tokenHash: text("token_hash").notNull(),
  status: text("status").notNull().default("active"), // active | revoked
  installationCode: text("installation_code"),
  appVersion: text("app_version"),
  createdAt: ts("created_at").notNull().default(now()),
  lastSeenAt: ts("last_seen_at"),
  lastIp: text("last_ip"),
  revokedAt: ts("revoked_at"),
}, (t) => [uniqueIndex("ux_pos_devices_token").on(t.tokenHash), index("ix_pos_devices_restaurant").on(t.restaurantId)]).enableRLS();

/** One-time code typed on the POS to connect it (short-lived, single use, stored hashed). */
export const enrollmentCodes = pgTable("enrollment_codes", {
  id: uuid("id").primaryKey().defaultRandom(),
  restaurantId: uuid("restaurant_id").notNull().references(() => restaurants.id, { onDelete: "cascade" }),
  codeHash: text("code_hash").notNull(),
  expiresAt: ts("expires_at").notNull(),
  usedAt: ts("used_at"),
  usedByDeviceId: uuid("used_by_device_id"),
  createdBy: uuid("created_by"),
  createdAt: ts("created_at").notNull().default(now()),
}, (t) => [uniqueIndex("ux_enrollment_codes_hash").on(t.codeHash)]).enableRLS();

export const media = pgTable("media", {
  id: uuid("id").primaryKey().defaultRandom(),
  restaurantId: uuid("restaurant_id").notNull().references(() => restaurants.id, { onDelete: "cascade" }),
  sha256: text("sha256").notNull(),
  mime: text("mime").notNull(),
  width: integer("width").notNull(),
  height: integer("height").notNull(),
  bytes: integer("bytes").notNull(),
  path: text("path").notNull(),
  source: text("source").notNull().default("pos"), // pos | admin
  createdAt: ts("created_at").notNull().default(now()),
}, (t) => [uniqueIndex("ux_media_restaurant_sha").on(t.restaurantId, t.sha256)]).enableRLS();

// ── Menu (synced from the POS: the POS is the source of truth) ────────────

export const categories = pgTable("categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  restaurantId: uuid("restaurant_id").notNull().references(() => restaurants.id, { onDelete: "cascade" }),
  posId: bigint("pos_id", { mode: "number" }).notNull(),
  nameAr: text("name_ar").notNull(),
  nameEn: text("name_en"),
  icon: text("icon"),
  color: text("color"),
  imageSha: text("image_sha"),
  sort: integer("sort").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
}, (t) => [uniqueIndex("ux_categories_pos").on(t.restaurantId, t.posId)]).enableRLS();

export const products = pgTable("products", {
  id: uuid("id").primaryKey().defaultRandom(),
  restaurantId: uuid("restaurant_id").notNull().references(() => restaurants.id, { onDelete: "cascade" }),
  posId: bigint("pos_id", { mode: "number" }).notNull(),
  posUnitId: bigint("pos_unit_id", { mode: "number" }).notNull(),
  categoryPosId: bigint("category_pos_id", { mode: "number" }),
  nameAr: text("name_ar").notNull(),
  nameEn: text("name_en"),
  descriptionAr: text("description_ar"),
  descriptionEn: text("description_en"),
  price: bigint("price", { mode: "number" }).notNull(),
  imageSha: text("image_sha"), // SHA-256 of the POS image file; the file is uploaded once into media
  prepMinutes: integer("prep_minutes"),
  isAvailable: boolean("is_available").notNull().default(true),
  isActive: boolean("is_active").notNull().default(true),
  sort: integer("sort").notNull().default(0),
  // Presentation only, managed in the platform dashboard (never overwritten by a sync).
  isFeatured: boolean("is_featured").notNull().default(false),
  isNew: boolean("is_new").notNull().default(false),
  labelAr: text("label_ar"),
  labelEn: text("label_en"),
  popularity: integer("popularity").notNull().default(0),
}, (t) => [uniqueIndex("ux_products_pos").on(t.restaurantId, t.posId), index("ix_products_category").on(t.restaurantId, t.categoryPosId)]).enableRLS();

/** Flavors of a product (price override of the base unit); selling a flavor moves the parent product's stock in the POS. */
export const productVariants = pgTable("product_variants", {
  id: uuid("id").primaryKey().defaultRandom(),
  restaurantId: uuid("restaurant_id").notNull().references(() => restaurants.id, { onDelete: "cascade" }),
  productPosId: bigint("product_pos_id", { mode: "number" }).notNull(),
  posId: bigint("pos_id", { mode: "number" }).notNull(),
  name: text("name").notNull(),
  priceOverride: bigint("price_override", { mode: "number" }),
  imageSha: text("image_sha"),
  sort: integer("sort").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
}, (t) => [uniqueIndex("ux_variants_pos").on(t.restaurantId, t.posId)]).enableRLS();

export const modifierGroups = pgTable("modifier_groups", {
  id: uuid("id").primaryKey().defaultRandom(),
  restaurantId: uuid("restaurant_id").notNull().references(() => restaurants.id, { onDelete: "cascade" }),
  posId: bigint("pos_id", { mode: "number" }).notNull(),
  name: text("name").notNull(),
  minSelect: integer("min_select").notNull().default(0),
  maxSelect: integer("max_select").notNull().default(1),
  sort: integer("sort").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
}, (t) => [uniqueIndex("ux_modifier_groups_pos").on(t.restaurantId, t.posId)]).enableRLS();

export const modifierOptions = pgTable("modifier_options", {
  id: uuid("id").primaryKey().defaultRandom(),
  restaurantId: uuid("restaurant_id").notNull().references(() => restaurants.id, { onDelete: "cascade" }),
  groupPosId: bigint("group_pos_id", { mode: "number" }).notNull(),
  posId: bigint("pos_id", { mode: "number" }).notNull(),
  name: text("name").notNull(),
  priceDelta: bigint("price_delta", { mode: "number" }).notNull().default(0),
  isDefault: boolean("is_default").notNull().default(false),
  sort: integer("sort").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
}, (t) => [uniqueIndex("ux_modifier_options_pos").on(t.restaurantId, t.posId)]).enableRLS();

export const productModifierGroups = pgTable("product_modifier_groups", {
  restaurantId: uuid("restaurant_id").notNull().references(() => restaurants.id, { onDelete: "cascade" }),
  productPosId: bigint("product_pos_id", { mode: "number" }).notNull(),
  groupPosId: bigint("group_pos_id", { mode: "number" }).notNull(),
  sort: integer("sort").notNull().default(0),
}, (t) => [primaryKey({ columns: [t.restaurantId, t.productPosId, t.groupPosId] })]).enableRLS();

// ── Tables (created on the POS, mirrored here with their public QR token) ─

export const diningTables = pgTable("dining_tables", {
  id: uuid("id").primaryKey().defaultRandom(),
  restaurantId: uuid("restaurant_id").notNull().references(() => restaurants.id, { onDelete: "cascade" }),
  posUid: text("pos_uid").notNull(), // stable id generated by the POS (GUID)
  number: integer("number").notNull(),
  name: text("name"),
  seats: integer("seats"),
  status: text("status").notNull().default("active"), // active | inactive | archived
  token: text("token").notNull(), // unguessable public QR token (the only thing in the QR besides the restaurant slug)
  tokenRotatedAt: ts("token_rotated_at").notNull().default(now()),
  createdAt: ts("created_at").notNull().default(now()),
  updatedAt: ts("updated_at").notNull().default(now()),
}, (t) => [uniqueIndex("ux_tables_pos_uid").on(t.restaurantId, t.posUid), uniqueIndex("ux_tables_token").on(t.token)]).enableRLS();

/** Old QR tokens after a regeneration: scanning one tells the customer the code was replaced (never orders). */
export const revokedTableTokens = pgTable("revoked_table_tokens", {
  token: text("token").primaryKey(),
  tableId: uuid("table_id").notNull().references(() => diningTables.id, { onDelete: "cascade" }),
  revokedAt: ts("revoked_at").notNull().default(now()),
}).enableRLS();

/**
 * One sitting at a table: from the first order of a party until the cashier ends it (or it idles out). The customers of
 * the table reach it with an unguessable token kept on their phones; a new party after closing gets a new session, so it
 * never sees the previous party's orders or invoice. Closing only hides the customer view — orders and invoices stay.
 * version: any change; customerVersion: changes worth a notification badge (status, invoice, request, closing).
 */
export const tableSessions = pgTable("table_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  restaurantId: uuid("restaurant_id").notNull().references(() => restaurants.id, { onDelete: "cascade" }),
  tableId: uuid("table_id").notNull().references(() => diningTables.id, { onDelete: "cascade" }),
  token: text("token").notNull(),
  openedAt: ts("opened_at").notNull().default(now()),
  lastActivityAt: ts("last_activity_at").notNull().default(now()),
  closedAt: ts("closed_at"),
  closeReason: text("close_reason"), // pos | idle
  visibleUntil: ts("visible_until"),
  version: integer("version").notNull().default(0),
  customerVersion: integer("customer_version").notNull().default(0),
}, (t) => [
  uniqueIndex("ux_table_sessions_token").on(t.token),
  // At most one open session per table (serialises concurrent first orders).
  uniqueIndex("ux_table_sessions_open").on(t.tableId).where(sql`closed_at is null`),
  index("ix_table_sessions_restaurant").on(t.restaurantId, t.openedAt),
]).enableRLS();

// ── Orders ─────────────────────────────────────────────────────────────────

export type OrderModifier = { posId: number; group: string; name: string; priceDelta: number };
export type OrderLocation = { lat: number; lng: number; accuracy: number; distanceM: number | null; inside: boolean };

/** The POS sale created when the cashier accepted the order (authoritative amounts, minor units). Never computed here. */
export type OrderInvoice = {
  saleId: number; number: string; issuedAt: string; cashier: string | null; paymentMethod: string | null;
  lines: { name: string; quantity: number; unitPrice: number; discount: number; total: number; options: string[]; note: string | null }[];
  subtotal: number; discount: number; tax: number; total: number; paid: number; taxNumber: string | null;
};

/**
 * submitted (cloud stored) → delivered (persisted by the POS) → accepted (cashier) → preparing → ready → completed;
 * rejected / cancelled. Only the POS moves an order past "delivered".
 */
export const orders = pgTable("orders", {
  id: uuid("id").primaryKey().defaultRandom(),
  restaurantId: uuid("restaurant_id").notNull().references(() => restaurants.id, { onDelete: "cascade" }),
  tableId: uuid("table_id").notNull().references(() => diningTables.id),
  sessionId: uuid("session_id").references(() => tableSessions.id),
  tablePosUid: text("table_pos_uid").notNull(),
  tableNumber: integer("table_number").notNull(),
  number: integer("number").notNull(),
  trackingToken: text("tracking_token").notNull(),
  idempotencyKey: text("idempotency_key").notNull(),
  status: text("status").notNull().default("submitted"),
  subtotal: bigint("subtotal", { mode: "number" }).notNull(),
  total: bigint("total", { mode: "number" }).notNull(),
  currencyCode: text("currency_code").notNull(),
  currencyDecimals: integer("currency_decimals").notNull(),
  note: text("note"),
  lang: text("lang").notNull().default("ar"),
  location: jsonb("location").$type<OrderLocation>(),
  clientIp: text("client_ip"),
  submittedAt: ts("submitted_at").notNull().default(now()),
  deliveredAt: ts("delivered_at"),
  acceptedAt: ts("accepted_at"),
  preparingAt: ts("preparing_at"),
  prepMinutes: integer("prep_minutes"),
  estimatedReadyAt: ts("estimated_ready_at"),
  etaChangedAt: ts("eta_changed_at"),
  readyAt: ts("ready_at"),
  completedAt: ts("completed_at"),
  rejectedAt: ts("rejected_at"),
  cancelledAt: ts("cancelled_at"),
  reason: text("reason"),
  posOrderId: bigint("pos_order_id", { mode: "number" }),
  groupLabel: text("group_label"),
  invoice: jsonb("invoice").$type<OrderInvoice>(),
  statusSeq: integer("status_seq").notNull().default(0),
  updatedAt: ts("updated_at").notNull().default(now()),
}, (t) => [
  uniqueIndex("ux_orders_idempotency").on(t.restaurantId, t.idempotencyKey),
  uniqueIndex("ux_orders_tracking").on(t.trackingToken),
  uniqueIndex("ux_orders_number").on(t.restaurantId, t.number),
  index("ix_orders_restaurant_status").on(t.restaurantId, t.status),
  index("ix_orders_submitted").on(t.restaurantId, t.submittedAt),
  index("ix_orders_session").on(t.sessionId),
]).enableRLS();

export const orderItems = pgTable("order_items", {
  id: serial("id").primaryKey(),
  orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  restaurantId: uuid("restaurant_id").notNull(),
  productPosId: bigint("product_pos_id", { mode: "number" }).notNull(),
  posUnitId: bigint("pos_unit_id", { mode: "number" }).notNull(),
  variantPosId: bigint("variant_pos_id", { mode: "number" }),
  nameAr: text("name_ar").notNull(),
  nameEn: text("name_en"),
  variantName: text("variant_name"),
  quantity: integer("quantity").notNull(),
  unitPrice: bigint("unit_price", { mode: "number" }).notNull(), // base + variant + modifiers, snapshot
  modifiers: jsonb("modifiers").$type<OrderModifier[]>().notNull().default([]),
  note: text("note"),
  prepMinutes: integer("prep_minutes").notNull(),
  lineTotal: bigint("line_total", { mode: "number" }).notNull(),
}, (t) => [index("ix_order_items_order").on(t.orderId)]).enableRLS();

export const orderEvents = pgTable("order_events", {
  id: serial("id").primaryKey(),
  orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  restaurantId: uuid("restaurant_id").notNull(),
  status: text("status").notNull(),
  at: ts("at").notNull().default(now()),
  actor: text("actor").notNull(), // customer | platform | pos | admin
  note: text("note"),
}, (t) => [index("ix_order_events_order").on(t.orderId)]).enableRLS();

/**
 * A customer asked for the table's invoice. pending (stored) → delivered (the POS has it) → acknowledged / printed /
 * dismissed (cashier). Only one active request per session; a new one is possible after the previous was handled.
 */
export const invoiceRequests = pgTable("invoice_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  restaurantId: uuid("restaurant_id").notNull().references(() => restaurants.id, { onDelete: "cascade" }),
  sessionId: uuid("session_id").notNull().references(() => tableSessions.id, { onDelete: "cascade" }),
  tablePosUid: text("table_pos_uid").notNull(),
  tableNumber: integer("table_number").notNull(),
  status: text("status").notNull().default("pending"),
  statusSeq: integer("status_seq").notNull().default(0),
  requestedAt: ts("requested_at").notNull().default(now()),
  deliveredAt: ts("delivered_at"),
  handledAt: ts("handled_at"),
}, (t) => [
  uniqueIndex("ux_invoice_requests_active").on(t.sessionId).where(sql`status in ('pending', 'delivered', 'acknowledged')`),
  index("ix_invoice_requests_restaurant").on(t.restaurantId, t.status),
]).enableRLS();

// ── Content ────────────────────────────────────────────────────────────────

export const promotions = pgTable("promotions", {
  id: uuid("id").primaryKey().defaultRandom(),
  restaurantId: uuid("restaurant_id").notNull().references(() => restaurants.id, { onDelete: "cascade" }),
  titleAr: text("title_ar"),
  titleEn: text("title_en"),
  subtitleAr: text("subtitle_ar"),
  subtitleEn: text("subtitle_en"),
  ctaAr: text("cta_ar"),
  ctaEn: text("cta_en"),
  // "category:<posId>" / "product:<posId>" scroll inside the menu; otherwise an https:// link.
  ctaTarget: text("cta_target"),
  imageMediaId: uuid("image_media_id").notNull(),
  mobileImageMediaId: uuid("mobile_image_media_id"),
  sort: integer("sort").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  startsAt: ts("starts_at"),
  endsAt: ts("ends_at"),
  archivedAt: ts("archived_at"),
  createdAt: ts("created_at").notNull().default(now()),
}, (t) => [index("ix_promotions_restaurant").on(t.restaurantId)]).enableRLS();

// ── Observability ──────────────────────────────────────────────────────────

export const auditLogs = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  restaurantId: uuid("restaurant_id"),
  actorType: text("actor_type").notNull(), // admin | pos | customer | system
  actorId: text("actor_id"),
  action: text("action").notNull(),
  details: jsonb("details").$type<Record<string, unknown>>(),
  ip: text("ip"),
  at: ts("at").notNull().default(now()),
}, (t) => [index("ix_audit_restaurant_at").on(t.restaurantId, t.at)]).enableRLS();

export const syncLogs = pgTable("sync_logs", {
  id: serial("id").primaryKey(),
  restaurantId: uuid("restaurant_id").notNull(),
  deviceId: uuid("device_id"),
  kind: text("kind").notNull(), // menu | media | tables | orders | ack | status | enroll
  ok: boolean("ok").notNull(),
  detail: text("detail"),
  at: ts("at").notNull().default(now()),
}, (t) => [index("ix_sync_logs_restaurant_at").on(t.restaurantId, t.at)]).enableRLS();
