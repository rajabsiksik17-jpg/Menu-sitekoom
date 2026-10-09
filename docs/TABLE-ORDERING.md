# Table ordering — business rules

## Concepts (kept separate on purpose)

| Concept | Where it lives | Created / changed by |
|---|---|---|
| **Order** | platform `orders` + POS `OnlineOrders` | the customer submits; only the POS moves it on |
| **Order accepted = sale** | POS `Sales` (+ payments, stock movements) | the cashier's «قبول»: one paid sale per order, in the same transaction |
| **Invoice (customer view)** | platform `orders.invoice` | a copy of the POS sale (number, lines, discounts, tax, total, paid, method) sent with the acceptance — never computed by the website |
| **Table session** | platform `table_sessions` + POS `TableSessions` | first order of a party → open; cashier «إنهاء جلسة الطاولة» or idle time → closed |
| **Invoice request** | platform `invoice_requests` + POS `OnlineInvoiceRequests` | customer «طلب الفاتورة» → cashier: seen / printed / dismissed |
| **Printing** | POS printers | explicit action with its own result; a failure never undoes a sale |

Decision (restaurant owner): **accepting an order is a paid sale** — there is no separate "mark as paid" step and no unpaid sales in the reports.

## Order lifecycle (state machine)

| Status | Set by | Customer sees | Allowed next |
|---|---|---|---|
| `submitted` | platform (validated, priced, stored) | "Sent — waiting for it to reach the restaurant" | delivered, rejected* |
| `delivered` | POS stored it locally (ack) | "At the cashier — waiting for confirmation" | accepted, rejected |
| `accepted` | cashier «قبول» / «قبول + طباعة» → **one paid sale** | "Accepted" + countdown, invoice available | preparing, ready, completed |
| `preparing` | staff | "Being prepared" + countdown | ready, completed |
| `ready` | staff | "Your order is ready!" | completed |
| `completed` | staff «تم التقديم», or ending the table session | "Served" | — |
| `rejected` | cashier, before acceptance, with a reason | reason | — |
| `cancelled` | — (an accepted order is a sale: undoing it is a **return** in the POS) | reason | — |

\* the platform itself never rejects or accepts; it only stores and forwards.

Guarantees: the customer is never told "accepted" before the POS committed the sale; a repeated «قبول» (double click, retry after a printer error,
retry after a crash) returns the existing sale (`ClientTxId = qr-<order id>` + the order's `SaleId` check) — never a second sale, payment or stock
movement; a rejected order cannot be accepted; an accepted order cannot be rejected or cancelled from the QR window (use a return).

## Acceptance at the cashier

- **قبول**: creates the sale through the normal sales service (current POS prices of product + flavor + options, tax, numbering, shift,
  stock policy, audit), pays it in full with the QR payment method (setting; default = first active cash method, never a method that needs
  a manager), accepts the order and computes its estimate — one transaction. Then the kitchen ticket is printed (setting).
- **قبول + طباعة**: the same, then the receipt is printed. If the printer fails, the order and its sale stay saved; the cashier is told and
  can print again from «طباعة الفاتورة» at any time. Reprints follow the POS rules (a printed receipt prints as a copy; `sales.reprint`).
- The customer's invoice comes from that sale. If the POS price changed between the order and the acceptance, the sale (and so the invoice)
  uses the POS price — the order's own total stays in its history for comparison.

## Table session

- The first order from a table opens a session (or joins the table's open one — friends at the same table share it). The session token
  goes to the customer's phone; it is the only access to the session (unguessable, 24 random bytes).
- **Ending**: the cashier «إنهاء جلسة الطاولة» (refused while an order waits for acceptance; orders still in the kitchen are marked served,
  open invoice requests are settled). The POS queues the close and sends it when online. The platform closes the session unless it contains
  an order the POS has not received yet (= a party that ordered after the cashier's decision) — no clock comparison is involved.
- **Idle close** (safety net if the cashier forgets): after the restaurant's *idle minutes* (dashboard, default 240, 30–1440) without activity,
  and only when no order is waiting or being prepared. Evaluated by the server when the session is read or a new order arrives.
- **After closing**: the customers still see the final invoice for the restaurant's *invoice display minutes* (dashboard, default 15, 0–1440),
  counted from when the platform learned of the close (server clock). Then the server refuses the session token and the order tracking
  links (`410 / 404`); the phone forgets them. **Nothing is deleted** — orders, invoices, requests and POS sales stay for the restaurant.
- A new party at the table always gets a new session: it never sees the previous party's orders, invoice or requests.

## Invoice visibility (customer)

`invoice.state` (server-computed):

| State | When | Shown |
|---|---|---|
| `none` | no order yet / nothing accepted and nothing waiting | "No invoice yet" |
| `waiting` | orders submitted, none accepted yet | "Appears once the cashier accepts your order" |
| `updating` | at least one accepted, **and a newer order is still waiting** | invoice controls held back: "A new order is waiting — the invoice updates once it's accepted" |
| `ready` | at least one accepted and nothing waiting | «عرض الفاتورة» (all sales of the session + table total, paid state) and «طلب الفاتورة» |

Rejected orders never count. The invoice is per sale (one per accepted order) with the session total — individual orders and the table
invoice are never confused.

## Invoice requests

- Allowed when the session is open and the invoice is `ready`. One **active** request per session (unique index): a second tap returns the
  same request. After it was handled (printed / dismissed) the customer may ask again (a new request).
- Delivered to the POS with the same long poll as orders (stored locally, then acknowledged — never lost, never duplicated).
- Cashier: «طباعة فاتورة الطاولة» (prints every sale of the session, then marks it printed), «تمت رؤيته», «تجاهل». The customer sees each
  step (sent → at the cashier → seen / printed / dismissed). A request never marks anything paid, never closes the table.

## Real-time

- POS ← platform: one outbound long poll (≤ 25 s) for orders and invoice requests; POS → platform: queued statuses (with invoices), request
  decisions and session closes, versioned (`seq`) so retries and late updates are harmless.
- Customer ← platform: long poll on the session (`GET /api/public/session/<token>?v=<version>&wait=20`) answers as soon as anything changes;
  on any failure it backs off and reloads the full state (reconciliation). Works through HTTP proxies/CDNs without WebSockets.
- Badge: the session's `customerVersion` (orders accepted/ready/served/rejected, invoice issued, request handled, session closed) vs the
  version the phone last displayed (stored) — a refresh never shows old changes as new.

## Preparation time

- Each product may have its own time (minutes, 1–240) in the POS product editor; otherwise the restaurant default (settings, default 15).
- On acceptance the POS computes the order duration = **the longest item** (10, 15, 25 → 25). Snapshot stored with the order.
- **Kitchen estimate mode**: *Parallel* (acceptance + duration) or *Queue* (starts after the latest active order).
- "Accept with a different time" and **+5′ / −5′** adjust an order (and its group); the customer sees "time updated".
- **Preparation group**: a new order of a table that still has accepted / preparing orders joins their group (estimate never moves earlier).

## Settings

POS → Settings → Restaurant → "الطاولات والطلب عبر QR": enable (off by default; nothing is active until on) · platform address + connect ·
default preparation time · estimate mode · **payment method for QR acceptance** · allow rejection · kitchen ticket on acceptance · group
orders of a table · sound. Disabling hides and stops everything without deleting anything.

Platform dashboard → restaurant → details: **invoice display minutes after closing** · **idle session close minutes** · contact, address,
languages, time zone; service status/pause, opening hours, location (see SECURITY.md for what the location check guarantees).
