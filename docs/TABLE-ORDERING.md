# Table ordering — business rules

## Order lifecycle

| Status | Set by | Customer sees |
|---|---|---|
| `submitted` | platform (validated, priced, stored) | "Your order was sent — waiting for it to reach the restaurant" |
| `delivered` | POS stored it locally (ack) | "The restaurant received your order — waiting for the staff to confirm" |
| `accepted` | cashier (or automatically when "require acceptance" is off) | "Order accepted" + countdown |
| `preparing` | staff | "Being prepared" + countdown |
| `ready` | staff | "Your order is ready!" (countdown stops) |
| `completed` | staff ("served") or the payment of the table | final state, completion time |
| `rejected` / `cancelled` | cashier, with a reason shown to the customer | reason |

Rules: the platform never marks an order accepted; an order is never rejected after it was paid; a paid order cannot be paid again.
When the estimate passes and the order is not marked ready, the customer sees "Still being prepared" — never "ready".

## Preparation time

- Each product may have its own time (minutes, 1–240) in the POS product editor; otherwise the restaurant default (settings, default 15).
- The online menu shows the time of each product (synchronized from the POS; the platform never changes it).
- On acceptance the POS computes the order duration = **the longest item** (items of one order are prepared concurrently: 10, 15, 25 → 25, not 50).
  The current POS product times are used; the time sent with the order is the fallback. The duration and the estimated-ready time are stored
  with the order (snapshot) — later product changes never rewrite them.
- **Kitchen estimate mode** (setting):
  - *Parallel* (default): estimated ready = acceptance + duration.
  - *Queue*: the order starts when the latest active (accepted / preparing) order of the restaurant is expected ready.
- "Accept with a different time" lets the cashier set the minutes explicitly. **+5′ / −5′** adjust an order (and its group); every change is in the history and the customer page shows "time updated".

## Several orders of the same table

- Every order keeps its own id, number, items, notes, timestamps, status and payment state.
- **Preparation group** (setting "group orders of the same table", default on): a new order of a table that still has accepted / preparing
  orders joins their group. The group's estimate = max(current group estimate, this order's own estimate) — it can move later, never earlier.
  Staff can also group selected orders explicitly ("تجميع الطاولة") or remove one from its group.
- Orders in different groups keep independent estimates and statuses.

## Tables and sessions

- Tables are created in the POS (one by one or "add N tables"), each with a stable Uid; number, name and seats are editable labels.
  Creating or editing needs no Internet — changes are queued and sent when the platform is reachable.
- Table states: available · new order awaiting acceptance · preparing · ready to serve · awaiting payment · occupied · inactive.
- The first order received for a table opens a **table session**; the table stays occupied until the session closes:
  - automatically after the table is settled (setting "close on payment", default on) when nothing remains open or unpaid, or
  - by staff ("إغلاق الطاولة"), allowed only when every order is paid, rejected or cancelled.
- A table can be deactivated or archived only when it is free. History (sessions, orders, sales) is never deleted.
- **New QR code**: the old token stops accepting orders immediately (scanning it explains the code was replaced); identity and history stay.

## Settlement (payment)

"Settle table" puts all accepted, unpaid orders of the table in the normal cashier cart (current POS prices, options, notes; lines marked as already
sent to the kitchen) and the cashier completes the usual payment. The sale transaction links the orders (once — a second attempt fails as a whole),
moves stock once, creates the e-invoice entry like any sale and completes the orders. If POS prices changed since the order, the cashier is warned
with both totals before taking payment. Acceptance, preparation, payment and fiscal invoicing are separate steps.

## Settings (POS → Settings → Restaurant → "الطاولات والطلب عبر QR")

Enable switch (off by default; nothing else is visible or active until it is on) · platform address + "connect" (one-time code from the dashboard)
· default preparation time · estimate mode · require acceptance · allow rejection · kitchen ticket on acceptance · group orders of a table ·
close table on payment · sound for new orders. Disabling hides and stops everything without deleting tables or orders; re-enabling restores them.

## Ordering availability (platform dashboard)

Service status and end date, temporary pause, opening hours (time-zone aware, past-midnight periods), location-restricted ordering (radius or polygon,
max accuracy) — see SECURITY.md for what the location check does and does not guarantee.
