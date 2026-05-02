# Notification System Design

## Stage 1

### Overview

A campus notification platform that keeps students updated on Placements, Events, and Results in real time. The frontend team needs a clear API contract, so this doc defines the REST endpoints, request/response shapes, and how real-time delivery will work.

---

### REST API Endpoints

All endpoints are prefixed with `/api`. The `Authorization` header is required on every request (pre-authorised users assumed per evaluation guidelines).

#### Headers (all requests)

```
Content-Type: application/json
Authorization: Bearer <token>
```

---

#### 1. Get Notifications for a Student

```
GET /api/notifications/:studentId
```

**Query params:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string | No | Filter by type: `placement`, `event`, `result`, `general` |
| `isRead` | boolean | No | Filter by read status |
| `page` | number | No | Page number (default: 1) |
| `limit` | number | No | Results per page (default: 20) |

**Response (200):**

```json
{
  "studentId": "stu_001",
  "total": 42,
  "page": 1,
  "limit": 20,
  "notifications": [
    {
      "id": "notif_uuid",
      "studentId": "stu_001",
      "type": "placement",
      "title": "Interview scheduled – Infosys",
      "message": "Your interview is on 5th May at 10am in Block A.",
      "metadata": { "company": "Infosys", "venue": "Block A" },
      "isRead": false,
      "createdAt": "2026-05-02T10:00:00Z"
    }
  ]
}
```

---

#### 2. Get Unread Count

```
GET /api/notifications/:studentId/unread-count
```

**Response (200):**

```json
{
  "studentId": "stu_001",
  "unreadCount": 7
}
```

---

#### 3. Create Notification

```
POST /api/notifications
```

**Request body:**

```json
{
  "studentId": "stu_001",
  "type": "event",
  "title": "Tech Fest 2026 – Registration Open",
  "message": "Register before 10th May to participate.",
  "metadata": {
    "eventDate": "2026-05-15",
    "registrationLink": "https://techfest.srmist.edu.in"
  }
}
```

**Response (201):**

```json
{
  "message": "Notification created",
  "notification": {
    "id": "notif_uuid",
    "studentId": "stu_001",
    "type": "event",
    "title": "Tech Fest 2026 – Registration Open",
    "message": "Register before 10th May to participate.",
    "metadata": { "eventDate": "2026-05-15" },
    "isRead": false,
    "createdAt": "2026-05-02T10:05:00Z"
  }
}
```

---

#### 4. Mark Single Notification as Read

```
PATCH /api/notifications/:notifId/read
```

**Response (200):**

```json
{
  "message": "Marked as read",
  "notification": { "id": "notif_uuid", "isRead": true, "readAt": "2026-05-02T10:10:00Z" }
}
```

---

#### 5. Mark All Notifications as Read

```
PATCH /api/notifications/:studentId/read-all
```

**Response (200):**

```json
{
  "message": "7 notifications marked as read"
}
```

---

#### 6. Delete a Notification

```
DELETE /api/notifications/:notifId
```

**Response (200):**

```json
{
  "message": "Notification deleted"
}
```

---

### Real-Time Notification Mechanism

For real-time delivery, **Server-Sent Events (SSE)** is the preferred approach here over raw WebSockets, since notifications are unidirectional (server → client) and SSE is simpler to implement and works over plain HTTP without an upgrade handshake.

```
GET /api/notifications/:studentId/stream
```

The server keeps the connection open and pushes events as `text/event-stream`:

```
data: {"id":"notif_uuid","type":"placement","title":"Interview scheduled – TCS"}

data: {"id":"notif_uuid2","type":"result","title":"Semester results published"}
```

The frontend listens with `EventSource` — no polling needed, and the connection auto-reconnects if dropped.

---

## Stage 2

### Persistent Storage Choice — PostgreSQL

PostgreSQL makes sense here. The data is relational (students → notifications), reads heavily outnumber writes, and we need things like pagination, filtering by `isRead`, and sorted queries by `createdAt` — all of which SQL handles well out of the box. NoSQL like MongoDB would work too but offers no real benefit for this access pattern and makes joins messier.

### Schema

```sql
CREATE TABLE students (
  id          VARCHAR(50) PRIMARY KEY,
  name        VARCHAR(100) NOT NULL,
  email       VARCHAR(150) NOT NULL UNIQUE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id  VARCHAR(50) NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  type        VARCHAR(20) NOT NULL CHECK (type IN ('placement', 'event', 'result', 'general')),
  title       VARCHAR(255) NOT NULL,
  message     TEXT NOT NULL,
  metadata    JSONB DEFAULT '{}',
  is_read     BOOLEAN DEFAULT FALSE,
  read_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- the index that actually matters — filters notifications by student + unread status
-- and sorts by newest first, which is what the fetch query does every time
CREATE INDEX idx_notifications_student_read_created
  ON notifications(student_id, is_read, created_at DESC);
```

### Potential Issues as Data Grows

- **Read fan-out**: if a placement notification needs to go to 5000 students, inserting 5000 rows one-by-one is slow. Solution: bulk insert with `INSERT INTO notifications (...) VALUES (...), (...), ...` in batches.
- **Table bloat**: old read notifications pile up. A `created_at < NOW() - INTERVAL '90 days'` cleanup job run via cron handles this.
- **Connection pooling**: at scale, opening a new DB connection per request kills the DB. Use `pg-pool` or equivalent.

### Key Queries

**Fetch unread notifications for a student (paginated):**
```sql
SELECT * FROM notifications
WHERE student_id = $1
  AND is_read = false
ORDER BY created_at DESC
LIMIT $2 OFFSET $3;
```

**Mark all as read:**
```sql
UPDATE notifications
SET is_read = true, read_at = NOW()
WHERE student_id = $1 AND is_read = false;
```

**Unread count:**
```sql
SELECT COUNT(*) FROM notifications
WHERE student_id = $1 AND is_read = false;
```

---

## Stage 3

### The Slow Query

```sql
SELECT * FROM notifications
WHERE studentID = 1042 AND isRead = false
ORDER BY createdAt DESC;
```

At 50,000 students and 5,000,000 notifications, a sequential scan on this is painful. PostgreSQL will scan every row just to filter by `studentID` and `isRead`.

### Is the Advice to "Index Every Column" Effective?

Not really. Indexing every column wastes disk space and slows down writes — every INSERT or UPDATE has to update all those indexes. The right move is to index the columns that actually appear together in the WHERE clause and ORDER BY. Blindly adding individual indexes on `studentID`, `isRead`, `createdAt` separately won't help much either, because the query planner might only use one at a time.

### The Right Fix

```sql
CREATE INDEX idx_notifications_student_unread
  ON notifications(student_id, is_read, created_at DESC)
  WHERE is_read = false;
```

A **partial index** (`WHERE is_read = false`) is the key insight here — it only indexes rows where `is_read = false`, which is exactly what this query reads. Once a notification is marked read it drops off the index automatically. At 5M notifications, if even 20% are unread, this index is 80% smaller than a full index.

With this index, PostgreSQL:
1. Looks up `student_id = 1042` + `is_read = false` directly from the index — no table scan
2. Returns rows already in `created_at DESC` order — no sort step

### Finding Students Who Got a Placement Notification in the Last 7 Days

The `notifications` table has a `notification_type` enum column with values `'Event'`, `'Result'`, `'Placement'`. Query:

```sql
SELECT DISTINCT student_id
FROM notifications
WHERE notification_type = 'Placement'
  AND created_at >= NOW() - INTERVAL '7 days';
```

Support index:

```sql
CREATE INDEX idx_notif_type_created ON notifications(notification_type, created_at DESC);
```

### Revised Query

```sql
SELECT id, notification_type, title, message, created_at
FROM notifications
WHERE student_id = $1
  AND is_read = false
ORDER BY created_at DESC
LIMIT 50;
```

---

## Stage 4

### Problem

Fetching all notifications on every page load means a DB query per student per visit. At 50,000 students, even staggered sessions generate a massive read load. The unread count badge alone triggers a query per page.

### Solution — Two-Layer Cache

**Layer 1: In-process cache (Node.js Map)**
- Cache the unread count per student in memory with a short TTL (30–60 seconds)
- Invalidated when a notification is created or marked read
- Handles the badge counter cheaply without hitting DB

**Layer 2: Redis**
- Cache the full notification list per student with a TTL of 2–5 minutes
- Key: `notifications:{studentId}:unread`
- On write (new notification or mark-as-read), invalidate the relevant key
- Handles concurrent requests from the same student hitting multiple server instances

### Tradeoffs

| Strategy | Pros | Cons |
|----------|------|------|
| In-process Map | Zero latency, zero infra | Stale across server restarts, doesn't work with multiple instances |
| Redis | Works across instances, configurable TTL | Extra infra, slight latency (~1ms), adds complexity |
| No cache (current) | Always fresh | Crushes DB under load |

For a campus with 50,000 students, Redis is worth it. The stale window (2–5 min TTL) is acceptable for notifications — a student won't notice a 2-minute delay in seeing a new badge count.

### Cache Invalidation

The tricky part. Invalidate on:
- `POST /api/notifications` — clear recipient's cache
- `PATCH /:notifId/read` — clear that student's cache
- `PATCH /:studentId/read-all` — clear that student's cache

Pattern: write-through invalidation (update DB first, then delete cache key). Never update the cache directly — let it repopulate on next read.

---

## Stage 5

### The Problem With `notify_all`

```
function notify_all(student_ids, message):
  for student_id in student_ids:
    send_email(student_id, message)   # calls Email API
    save_to_db(student_id, message)   # DB insert
    push_to_app(student_id, message)  # SSE/WebSocket push
```

Issues:
1. **Email failure kills the loop** — if `send_email` fails at student 200, students 200–50,000 get nothing and we don't know how many succeeded
2. **Tight coupling** — email + DB + push happen sequentially per student, so failure in one blocks the others
3. **No retry** — failed sends are silently lost
4. **Sequential is slow** — 50,000 sequential iterations is minutes of runtime

### Redesigned Approach

Decouple the steps using a **message queue** (e.g. Bull/BullMQ with Redis):

```javascript
// Step 1: DB write is the source of truth — do this first, atomically
async function notify_all(student_ids, message) {
  // bulk insert all notifications at once
  await db.bulkInsert(student_ids.map(id => ({
    student_id: id,
    message,
    type: 'placement',
    created_at: new Date()
  })));

  // Step 2: enqueue delivery jobs — email and push are fire-and-forget
  const jobs = student_ids.map(id => ({
    name: 'deliver_notification',
    data: { student_id: id, message }
  }));
  await notificationQueue.addBulk(jobs);
}

// Step 3: workers process the queue with concurrency + retry
notificationQueue.process('deliver_notification', 50, async (job) => {
  const { student_id, message } = job.data;
  await Promise.allSettled([
    sendEmail(student_id, message),   // fails gracefully
    pushToApp(student_id, message)
  ]);
});
```

### Why This Works

- **DB insert first** — notifications are persisted even if email delivery fails entirely
- **Queue handles retries** — Bull retries failed jobs with exponential backoff (configurable)
- **`Promise.allSettled`** — email failure doesn't block the push, and vice versa
- **Concurrency = 50** — processes 50 students in parallel instead of 1-by-1
- **Audit trail** — failed jobs stay in the queue's failed set for inspection

### Should DB Save and Email Happen Together?

No. They serve different purposes:
- DB save = the notification exists (source of truth)
- Email = one delivery channel (best-effort)

Coupling them means an email outage prevents notifications from being recorded at all. Keep them separate — save to DB synchronously, deliver asynchronously.

---

## Stage 6

### Priority Inbox

The goal is to always show the top N most important unread notifications regardless of how many come in.

### Scoring Approach

Each notification gets a priority score based on two factors:

1. **Type weight** — `Placement = 3`, `Result = 2`, `Event = 1` (placement beats everything else)
2. **Recency decay** — newer notifications score higher. Using exponential decay with a 12-hour half-life:

```
score = type_weight × 0.5^(age_in_hours / 12)
```

This means a Placement from 12 hours ago scores the same as a Result from right now — which feels right. A very old placement (say, 48 hours) could be outranked by a fresh Result, which also makes sense since a 2-day-old interview notice is less urgent than a just-published result.

### Keeping Top 10 Efficient as New Notifications Arrive

For a static list, sorting O(n log n) is fine. For a live stream of incoming notifications, maintain a **min-heap of size N** (keyed by score). When a new notification arrives:
- Compute its score
- If the heap has fewer than N items, push it
- Else if its score > heap minimum, pop the min and push the new one

This gives O(log N) per insert regardless of how many total notifications exist.

### Implementation

See `notification_app_be/priority_inbox.js` for the full working implementation. Run with:

```bash
node priority_inbox.js
```

Output shows the top 10 notifications ranked by priority score, with type, message, timestamp, and computed score displayed for each entry.
