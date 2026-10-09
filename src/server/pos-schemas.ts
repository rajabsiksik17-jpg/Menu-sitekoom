import { z } from "zod";

/** Payloads sent by the POS (C# SupermarketPOS.Application.Cloud). Prices arrive as decimals in the restaurant currency. */

const sha = z.string().regex(/^[0-9a-f]{64}$/i).transform((s) => s.toLowerCase());
const posId = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const name = z.string().trim().min(1).max(200);
const money = z.number().finite().min(0).max(1_000_000);

export const enrollSchema = z.object({
  code: z.string().trim().min(6).max(40),
  installationCode: z.string().trim().max(64).optional().nullable(),
  deviceName: z.string().trim().min(1).max(100),
  appVersion: z.string().trim().max(40).optional().nullable(),
});

export const menuSchema = z.object({
  hash: z.string().max(128),
  currency: z.object({ code: z.string().trim().min(1).max(8), symbol: z.string().trim().max(8), decimals: z.number().int().min(0).max(4) }),
  defaultPrepMinutes: z.number().int().min(1).max(240),
  requireAcceptance: z.boolean().default(true),
  categories: z.array(z.object({
    id: posId, name, sort: z.number().int().default(0), icon: z.string().max(16).nullish(), color: z.string().max(16).nullish(),
    image: sha.nullish(), active: z.boolean().default(true),
  })).max(500),
  products: z.array(z.object({
    id: posId, unitId: posId, categoryId: posId.nullish(), nameAr: name, nameEn: z.string().trim().max(200).nullish(),
    description: z.string().trim().max(2000).nullish(), price: money, image: sha.nullish(),
    prepMinutes: z.number().int().min(1).max(240).nullish(), available: z.boolean().default(true), availableAt: z.coerce.date().nullish(), sort: z.number().int().default(0),
    variants: z.array(z.object({ id: posId, name, price: money.nullish(), image: sha.nullish(), sort: z.number().int().default(0) })).max(100).default([]),
    groups: z.array(posId).max(50).default([]),
  })).max(5000),
  modifierGroups: z.array(z.object({
    id: posId, name, min: z.number().int().min(0).max(50), max: z.number().int().min(1).max(50), sort: z.number().int().default(0),
    options: z.array(z.object({ id: posId, name, price: z.number().finite().min(-100_000).max(100_000), isDefault: z.boolean().default(false), sort: z.number().int().default(0) })).max(100),
  })).max(500),
});
export type MenuPayload = z.infer<typeof menuSchema>;

export const tablesSchema = z.object({
  tables: z.array(z.object({
    uid: z.string().trim().regex(/^[0-9a-fA-F-]{32,36}$/),
    number: z.number().int().min(1).max(100000),
    name: z.string().trim().max(60).nullish(),
    seats: z.number().int().min(0).max(500).nullish(),
    status: z.enum(["active", "inactive", "archived"]),
  })).max(2000),
});

export const rotateSchema = z.object({ uid: z.string().trim().regex(/^[0-9a-fA-F-]{32,36}$/) });

export const ackSchema = z.object({ ids: z.array(z.string().uuid()).min(1).max(200) });

/** The POS sale issued when the cashier accepted the order (amounts as decimals in the restaurant currency). */
const signed = z.number().finite().min(-1_000_000).max(1_000_000);
export const invoiceSchema = z.object({
  saleId: z.number().int().positive(),
  number: z.string().trim().min(1).max(40),
  issuedAt: z.coerce.date(),
  cashier: z.string().trim().max(100).nullish(),
  paymentMethod: z.string().trim().max(100).nullish(),
  taxNumber: z.string().trim().max(60).nullish(),
  lines: z.array(z.object({
    name: z.string().trim().min(1).max(250),
    quantity: z.number().finite().min(0).max(10_000),
    unitPrice: signed, discount: signed, total: signed,
    options: z.array(z.string().trim().max(120)).max(30).default([]),
    note: z.string().trim().max(200).nullish(),
  })).max(200),
  subtotal: signed, discount: signed, tax: signed, total: signed, paid: signed,
});
export type InvoicePayload = z.infer<typeof invoiceSchema>;

export const requestStatusSchema = z.object({
  updates: z.array(z.object({
    id: z.string().uuid(),
    status: z.enum(["acknowledged", "printed", "dismissed"]),
    seq: z.number().int().min(1),
    at: z.coerce.date(),
  })).min(1).max(200),
});

export const tablesCloseSchema = z.object({
  closes: z.array(z.object({ uid: z.string().trim().min(8).max(64), closedAt: z.coerce.date() })).min(1).max(200),
});

export const statusSchema = z.object({
  updates: z.array(z.object({
    id: z.string().uuid(),
    status: z.enum(["accepted", "preparing", "ready", "completed", "rejected", "cancelled"]),
    seq: z.number().int().min(1),
    at: z.coerce.date(),
    prepMinutes: z.number().int().min(0).max(1440).nullish(),
    estimatedReadyAt: z.coerce.date().nullish(),
    reason: z.string().trim().max(300).nullish(),
    posOrderId: z.number().int().positive().nullish(),
    groupLabel: z.string().trim().max(40).nullish(),
    invoice: invoiceSchema.nullish(),
  })).min(1).max(200),
});
