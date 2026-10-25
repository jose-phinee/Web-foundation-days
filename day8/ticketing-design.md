# TicketHub Design Document

TicketHub is a website that sells tickets for concerts and events. This document follows the six-part design framework: requirements, estimates, API, data model, architecture and trade-offs. It also explains how the design stops two people buying the same seat.

**Starting facts:** 2 million registered users. On a normal day, 50,000 people visit and each views 10 pages, and 5,000 tickets are sold. When a popular concert goes on sale, 200,000 people try to buy its 20,000 seats within the first 10 minutes.

---

## 1. Requirements

### Functional requirements

- Users can register and log in.
- Users can browse and search events by name, date and city.
- Users can view an event's seat map and see which seats are available.
- Users can **hold** one or more seats for a short time (10 minutes) while they pay.
- Users can pay for held seats, and receive their tickets.
- Users can see their tickets and past orders.
- Held seats that are not paid for are released automatically.
- A user can buy at most 4 seats for one event, to stop a few people taking everything.

Out of scope: event organiser tools, refunds by customer request, resale of tickets.

### Non-functional requirements

- **Correctness (most important):** a seat must never be sold to two people, and a customer must never be charged without getting a ticket or get a ticket without being charged.
- **Fairness:** during a big sale, people are served in the order they arrive (first come, first served), no single user or bot can take far more than their share, and everyone is told clearly if they are waiting or if the event is sold out.
- **Speed:** browsing pages respond in under 300 ms. The seat map loads in under 1 second, even during a big sale.
- **Availability and survivability:** the site must stay up during a sale that is hundreds of times busier than normal, and degrade gracefully (slower queue) instead of crashing.
- **Consistency:** seat availability that is used to *decide* a sale must be exactly right. The seat map shown on screen may be a second or two old.
- **Durability:** every paid order is stored safely and is never lost.
- **Security:** all traffic uses HTTPS, passwords are hashed, and card details never touch our servers (a payment provider handles them).
- **Scalability:** we can add servers before a planned sale.

---

## 2. Estimates

Assumptions: one day is about **100,000 seconds**; peak traffic on a normal day is **5× the average**; an average order has **2 tickets**; each purchase takes about 3 database writes (hold, order, tickets).

### Normal day

| Measure | Working | Result |
| --- | --- | --- |
| Page views | 50,000 visitors × 10 pages = 500,000/day ÷ 100,000 | **5 views/s** average, **25/s** peak |
| Orders | 5,000 tickets ÷ 2 per order = 2,500 orders/day | **0.025 orders/s** average |
| Database writes | 2,500 orders × 3 writes = 7,500/day | **under 0.1 writes/s** average |
| Storage | 5,000 tickets/day × 365 = 1.8 million tickets/year at about 0.5 KB, plus orders | **about 2 GB/year** |

A normal day is very quiet. One small server could handle it.

### Big sale (200,000 people, 20,000 seats, 10 minutes = 600 seconds)

Extra assumptions: each person loads the seat map once and refreshes it about 5 more times (6 reads each), and each person tries to hold seats about 2 times.

| Measure | Working | Result |
| --- | --- | --- |
| Seat map reads | 200,000 × 6 = 1,200,000 ÷ 600 s | **2,000 reads/s** average, **10,000/s** peak (5×) |
| Hold attempts | 200,000 × 2 = 400,000 ÷ 600 s | **about 670 attempts/s** average, **3,300/s** peak |
| Successful holds | at most 20,000 seats ÷ 600 s | **about 33/s**; only **10%** of people can succeed |
| Paid orders | 20,000 seats ÷ 2 per order = 10,000 orders over about 10 to 20 minutes | **about 10 to 20 orders/s**, peak up to about 85/s |

### Comparison

| | Normal day | Big sale | Difference |
| --- | --- | --- | --- |
| Page or seat map reads | 5/s average (25/s peak) | 2,000/s average (10,000/s peak) | about **400 times** more |
| Booking writes | under 0.1/s | about 670 hold attempts/s | **thousands of times** more |

Two things make the big sale harder than the numbers suggest:

1. **Everyone wants the same 20,000 rows.** Adding servers doesn't remove the fight over the same seats, which all happen in one database. That fight must be controlled by the database itself and by limiting how many people can try at once.
2. **90% of people will fail.** About 180,000 people leave without a seat, so the system must tell them quickly and cheaply that the event is sold out.

---

## 3. API

Base URL `https://api.tickethub.example/v1`. JSON bodies, Bearer token for logged-in users.

| Method | Path | Description | Success status |
| --- | --- | --- | --- |
| `GET` | `/events?query=&city=&page=` | Browse and search events. | `200 OK` |
| `GET` | `/events/{event_id}` | Details of one event (name, venue, date, prices). | `200 OK` |
| `GET` | `/events/{event_id}/seats?section=` | Seat map with each seat's status (`available`, `held`, `sold`). | `200 OK` |
| `POST` | `/events/{event_id}/waiting-room` | Join the queue for a big sale and receive an entry token and position. | `202 Accepted` |
| `POST` | `/events/{event_id}/holds` | Hold chosen seats for 10 minutes. | `201 Created` |
| `DELETE` | `/holds/{hold_id}` | Release a hold early. | `204 No Content` |
| `POST` | `/orders` | Pay for a hold and create the order and tickets. | `201 Created` |
| `GET` | `/me/tickets` | List the logged-in user's tickets. | `200 OK` |

### Hold seats: `POST /events/42/holds`

```json
{ "seat_ids": [1501, 1502] }
```

**`201 Created`**

```json
{
  "hold_id": "h_8f3a21",
  "event_id": 42,
  "seat_ids": [1501, 1502],
  "total_cents": 30000,
  "expires_at": "2026-12-01T10:10:00Z"
}
```

If any seat is no longer free, **no seat is held** (all or nothing) and the reply is `409 Conflict`:

```json
{ "error": { "code": "SEAT_UNAVAILABLE", "message": "Seat 1502 has just been taken. Please choose another seat.", "seat_ids": [1502] } }
```

### Pay: `POST /orders`

The `Idempotency-Key` header makes a repeated request (a double click or a network retry) return the same order instead of charging twice.

```http
POST /v1/orders
Authorization: Bearer eyJhbGciOi...
Idempotency-Key: 5c1b7c2e-3b0a-4a3e-9d57-0f1e9a7a1111
```

```json
{ "hold_id": "h_8f3a21", "payment_token": "tok_visa_abc123" }
```

**`201 Created`**

```json
{
  "order_id": 9001,
  "status": "paid",
  "tickets": [
    { "ticket_id": 7001, "seat_id": 1501, "section": "A", "row": "3", "seat": "11" },
    { "ticket_id": 7002, "seat_id": 1502, "section": "A", "row": "3", "seat": "12" }
  ]
}
```

### Errors

| Status | When it happens |
| --- | --- |
| `400 Bad Request` | Invalid body, for example more than 4 seats or an empty list. |
| `401 Unauthorized` | Missing or expired token. |
| `402 Payment Required` | The payment was declined. The hold stays active until it expires so the user can try another card. |
| `404 Not Found` | The event or hold does not exist. |
| `409 Conflict` | A chosen seat is already held or sold. |
| `410 Gone` | The hold expired before payment. |
| `429 Too Many Requests` | Too many requests from one user or address (bot protection). |
| `503 Service Unavailable` | The site is overloaded. The client shows the waiting room and retries later. |

---

## 4. Data model

Five tables. (SQLite-style SQL: for PostgreSQL use `BIGSERIAL` and `TIMESTAMPTZ`, and `now()` instead of `datetime('now')`.)

| Table | Purpose | Key columns |
| --- | --- | --- |
| `users` | People with accounts | `id` PK, `email` UNIQUE, `name`, `password_hash` |
| `events` | Concerts and events | `id` PK, `name`, `venue`, `starts_at`, `on_sale_at` |
| `seats` | One row per seat per event, with its current status | `id` PK, `event_id` FK, `section`, `row_label`, `seat_number`, `price_cents`, `status`, `held_by_user_id` FK, `hold_expires_at` |
| `orders` | One payment by one user | `id` PK, `user_id` FK, `event_id` FK, `total_cents`, `status`, `payment_ref`, `idempotency_key` |
| `tickets` | One row per seat sold, linking an order to a seat | `id` PK, `order_id` FK, `seat_id` FK **UNIQUE** |

### Relationships

- **users to orders: one-to-many.** A user places many orders, and each order has one user.
- **events to seats: one-to-many.** An event has thousands of seats, and each seat belongs to one event.
- **orders to tickets: one-to-many.** An order has one or more tickets.
- **seats to tickets: one-to-one at most.** A seat can have **at most one ticket** (enforced by `UNIQUE`), and each ticket is for one seat.
- **users to events: many-to-many through orders and tickets.** Many users go to many events, and the `orders` table (with `event_id`) records each link.

```sql
PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  venue      TEXT NOT NULL,
  starts_at  TEXT NOT NULL,
  on_sale_at TEXT NOT NULL
);

CREATE TABLE seats (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id        INTEGER NOT NULL,
  section         TEXT NOT NULL,
  row_label       TEXT NOT NULL,
  seat_number     INTEGER NOT NULL,
  price_cents     INTEGER NOT NULL CHECK (price_cents >= 0),
  status          TEXT NOT NULL DEFAULT 'available'
                  CHECK (status IN ('available', 'held', 'sold')),
  held_by_user_id INTEGER,
  hold_expires_at TEXT,
  FOREIGN KEY (event_id) REFERENCES events (id),
  FOREIGN KEY (held_by_user_id) REFERENCES users (id),
  UNIQUE (event_id, section, row_label, seat_number)
);

CREATE TABLE orders (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id         INTEGER NOT NULL,
  event_id        INTEGER NOT NULL,
  total_cents     INTEGER NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'paid', 'failed', 'refunded')),
  payment_ref     TEXT UNIQUE,
  idempotency_key TEXT NOT NULL,
  created_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id)  REFERENCES users (id),
  FOREIGN KEY (event_id) REFERENCES events (id),
  UNIQUE (user_id, idempotency_key)
);

CREATE TABLE tickets (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  seat_id  INTEGER NOT NULL UNIQUE,   -- a seat can be sold only once
  FOREIGN KEY (order_id) REFERENCES orders (id),
  FOREIGN KEY (seat_id)  REFERENCES seats (id)
);

CREATE INDEX idx_seats_event_status ON seats (event_id, status);
CREATE INDEX idx_orders_user ON orders (user_id, created_at DESC);
```

The index `idx_seats_event_status` makes the seat map and "how many seats are left" fast. `idx_orders_user` makes "my tickets" fast.

---

## 5. How double-booking is prevented

The rule is simple: **the database, not the app, decides who gets a seat**, and it decides atomically (in one step that nothing can interrupt). Four layers protect each seat.

**Layer 1: an atomic, conditional hold (the main defence).** The app never reads a seat and then updates it, because two people could read "available" at the same moment. Instead it sends one `UPDATE` that only succeeds if the seat is still free, inside a transaction:

```sql
BEGIN;

UPDATE seats
SET status = 'held',
    held_by_user_id = :user_id,
    hold_expires_at = datetime('now', '+10 minutes')
WHERE event_id = :event_id
  AND id IN (1501, 1502)
  AND (status = 'available'
       OR (status = 'held' AND hold_expires_at < datetime('now')));

-- The app checks how many rows changed.
-- 2 changed -> COMMIT.   Fewer than 2 -> ROLLBACK and reply 409 Conflict.
COMMIT;
```

When two people send this for the same seat at the same moment, the database locks the row for the first one. The second one waits a moment, then sees the status is now `held` and updates **0 rows**, so they get a `409`. If a user asks for 2 seats and only 1 is free, the transaction is rolled back, so nobody is left with half an order.

**Layer 2: a transaction when paying.** When the payment succeeds, one transaction checks that the hold still belongs to this user and has not expired, creates the order, inserts the tickets and sets the seats to `sold`. If any step fails, everything is rolled back.

**Layer 3: a constraint as the last line of defence.** `tickets.seat_id` is `UNIQUE`. Even if there were a bug in the app code, the database would refuse to create a second ticket for the same seat, and that transaction would fail.

**Layer 4: idempotency.** `UNIQUE (user_id, idempotency_key)` on `orders` means a double click or a retry returns the same order and doesn't charge twice.

**Expired holds:** a hold counts as free once `hold_expires_at` has passed (see the `UPDATE` above), and a worker also resets old holds to `available` every minute so the seat map is accurate.

**The cache is never trusted for decisions.** The seat map shown on screen may be a second or two old, so someone can click a seat that has just gone. That is safe, because the hold request always goes to the primary database, which says `409` and the user picks another seat.

**If the payment succeeds but the hold has expired and someone else took the seat:** the transaction in Layer 2 fails, and the system refunds the payment automatically and tells the user. To make this rare, the hold is extended by a few minutes while a payment is in progress.

---

## 6. Architecture

```
                       +-------------------------+
                       |  Client (browser/app)   |
                       +------------+------------+
                                    |
                                    v
                       +------------+------------+
                       |           DNS           |
                       +------------+------------+
                                    |
                                    v
                       +------------+------------+
                       |    CDN + bot protection |  static files, event pages,
                       |   (rate limiting)       |  "sold out" page
                       +------------+------------+
                                    |
                                    v
                       +------------+------------+
                       |      Waiting room       |  admits a limited number of
                       |   (virtual queue)       |  people at a time
                       +------------+------------+
                                    |
                                    v
                       +------------+------------+
                       |     Load balancer       |
                       +------+-------------+----+
                              |             |
                   +----------+---+     +---+----------+
                   | App server 1 |     | App server N |  (stateless, more added
                   +--+-------+---+     +---+-------+--+   before a big sale)
                      |       |             |       |
        +-------------+       |             |       +-------------+
        v                     v             v                     v
 +------+-------+   +---------+-------------+--+          +-------+------+
 |    Cache     |   |  Primary database        |          |    Queue     |
 |   (Redis)    |   |  seats, holds, orders    |          +-------+------+
 | seat map     |   |  (all writes + holds)    |                  |
 | snapshots    |   +---------+----------------+                  v
 +--------------+             | copies changes          +---------+---------+
                              v                         |     Workers       |
                     +--------+--------+                | - email tickets   |
                     |  Read replica   |                | - release expired |
                     | (browse/search) |                |   holds           |
                     +-----------------+                | - refunds         |
                                                        +-------------------+
        App servers also call:  Payment provider (card payments)
```

### What each component does

- **Client:** the browser or phone app where people browse, pick seats and pay.
- **DNS:** it turns `tickethub.example` into the address of our servers, so we can move or add servers without changing the name.
- **CDN with bot protection:** it serves the static files and event pages from servers close to the user and blocks obviously automated or excessive traffic, so most of the 10,000 reads/s never reaches our servers.
- **Waiting room:** it lets only a fixed number of people (for example 2,000) at a time into the seat selection and shows everyone else their place in line, so 200,000 people can't all hit the database at once and the sale is fair.
- **Load balancer:** it spreads requests over the app servers and removes a failed server from the rotation.
- **App servers:** they run the booking logic (validation, holds, orders) and keep no data of their own, so we can add many more before a big sale.
- **Cache (Redis):** it keeps event details and a seat-map snapshot (refreshed every second or two) so the thousands of seat map reads each second never reach the database.
- **Primary database:** it is the single trusted record of seats and orders, and it makes the atomic holds and transactions that prevent double-booking.
- **Read replica:** it answers browse and search queries, which keeps ordinary reads away from the primary that is busy with bookings, and it is a ready copy if the primary fails.
- **Queue:** it holds background jobs such as emailing tickets, so the buyer's request finishes quickly even when we are busy.
- **Workers:** they take jobs from the queue to send tickets, release expired holds and issue refunds, away from the buyer's request.
- **Payment provider:** an external service that takes the card payment, so we never store card numbers.

### Purchase flow

1. The user joins the **waiting room** and is let in when it is their turn (during a big sale).
2. The app loads the seat map from the **cache** (a recent snapshot).
3. The user picks seats and sends `POST /holds`. The app server runs the **atomic hold** on the primary database. A `201` means the seats are theirs for 10 minutes. A `409` means someone was faster.
4. The user pays: `POST /orders` with the payment token and an idempotency key.
5. The app server calls the **payment provider**.
6. On success, one **transaction** creates the order and tickets and marks the seats `sold` (the `UNIQUE seat_id` guards this step).
7. The app server queues an "email the tickets" job, deletes the cached seat map for the event, and replies `201`.
8. A **worker** sends the email. The user sees the tickets in `GET /me/tickets`.

### How it survives the big sale

- **Plan ahead.** The sale time is known, so we add app servers and warm the cache beforehand.
- **Absorb the reads.** The CDN and the cache take the 10,000 reads/s, and the seat map is a snapshot, so only a small trickle reaches the database.
- **Control the writes.** The waiting room limits how many people can try to hold seats at once, so the primary database sees perhaps a few hundred hold attempts a second, not 3,300.
- **Say "sold out" cheaply.** When the last seat goes, a "sold out" flag is set in the cache and the CDN, so the other 180,000 people get an instant answer instead of hammering the database.
- **Never lose a sale.** Queued jobs are stored safely until a worker finishes them, and payments are idempotent, so a crash or a retry doesn't double-charge anyone.
- **Fail softly.** If the system is overloaded, it replies `503` and keeps people in the waiting room, instead of crashing.

---

## 7. Trade-offs

1. **Correct seat decisions vs speed and scale (one primary database).** Every hold goes to one primary database so that exactly one person wins each seat. This is slower and can't be spread across many machines the way reads can, but selling a seat twice is far worse than being a little slower. We reduce the load with the waiting room, and if one sale is ever too big, we could split seats across databases by event, at the cost of more complexity.
2. **Accurate seat map vs database load (cached snapshot).** The cached seat map can be one or two seconds old, so a user may click a seat that has just gone and get a `409`. In return, the database is protected from thousands of reads a second. We accept the occasional "seat just taken" message because the decision itself is always checked against the primary database.
3. **Fairness vs convenience (waiting room).** The waiting room makes the sale fair and keeps the site running, but some people wait and must sit through a queue. Admitting people in a random order within the first minute is fairer for people on slow connections than strict first-come-first-served, but some people will feel it is less fair. We accept the waiting time because the alternative is a crashed site where nobody can buy.
4. **Hold time (10 minutes).** A longer hold gives people time to find their card, but unpaid holds block seats from others. A shorter hold frees seats quickly but may cancel slow payers. We chose 10 minutes and extend it while a payment is in progress.
5. **Cost vs readiness (extra servers).** Adding many servers for a sale that lasts 10 minutes costs money, but they are only needed on the sale day, so we scale up before it and back down afterwards.