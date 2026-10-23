# SnapShare Scaling Plan

SnapShare is a photo-sharing app. Users upload photos and scroll a feed of photos from the people they follow. This plan estimates the load and designs a system that can handle it.

## 1. Assumptions

- Registered users: **10,000,000**
- Active users each day: **10%** of registered users
- Each active user uploads **1 photo per day**
- Each active user views **50 feed pages per day**
- Average photo size: **2 MB**; each photo also gets a **50 KB thumbnail**
- One day is about **100,000 seconds** (a rounded-up estimate of the real 86,400 seconds, to keep the arithmetic simple)
- **Peak traffic is 5× the average**
- Storage is counted in decimal units (1 TB = 1,000,000 MB), and a year is 365 days
- Each photo's details (owner, caption, time, file location) take about 1 KB in the database

**Daily active users (DAU):** 10,000,000 × 10% = **1,000,000 users per day**

## 2. Estimates

### Uploads per second

- Uploads per day: 1,000,000 users × 1 photo = **1,000,000 uploads/day**
- Average: 1,000,000 ÷ 100,000 = **10 uploads/second**
- Peak (5×): **50 uploads/second**, which is about 100 MB/second of incoming photo data (50 × 2 MB)

### Feed views per second

- Feed views per day: 1,000,000 users × 50 pages = **50,000,000 views/day**
- Average: 50,000,000 ÷ 100,000 = **500 views/second**
- Peak (5×): **2,500 views/second**

Using the exact 86,400 seconds in a day, the averages would be about 11.6 uploads/second and 579 views/second. The estimate above is close enough for planning.

### Photo storage per year

| Item | Per day | Per year (× 365) |
| --- | --- | --- |
| Original photos (1,000,000 × 2 MB) | 2 TB | 730 TB |
| Thumbnails (1,000,000 × 50 KB) | 50 GB | about 18 TB |
| **Total** | about 2.05 TB | **about 750 TB (0.75 PB)** |

Photo details in the database are tiny by comparison: 1,000,000 rows × 1 KB is about 1 GB per day, or roughly 365 GB per year. Real storage will be higher, because the object storage keeps extra copies of every file for safety.

## 3. Read-heavy or write-heavy?

SnapShare is **read-heavy**. There are 50,000,000 feed views for every 1,000,000 uploads, a ratio of about **50 reads to 1 write**.

What this means for the design:

- **Make reads cheap and fast.** Use a CDN for photos, a cache for feeds, and a read replica of the database so most reads never touch the main database.
- **Keep writes simple and safe.** Only 10 uploads/second on average need to go to the main database, which it can handle comfortably. A queue absorbs bursts and moves slow work (thumbnails) out of the upload request.
- **Add database indexes** for the common reads, such as a user's photos by date and who follows whom.
- **Accept slightly old data in the feed.** A feed that is a few seconds out of date is fine, and it makes the heavy read traffic far cheaper to serve.

## 4. Why photos should not be stored in the database

Photos should be stored in **object storage** (for example Azure Blob Storage or Amazon S3), and the database should hold only a small record with the file's location.

- **Size:** about 750 TB of photos a year would make the database huge, while the details of the photos amount to only a few hundred GB.
- **Cost:** database storage is far more expensive per GB than object storage.
- **Speed:** large files slow down queries, backups, restores and replication.
- **Cache waste:** the database cache would fill with photo data instead of the small records the app asks for most.
- **No CDN:** a CDN can serve a file straight from object storage by its URL, but it can't read photos out of a database.
- **Built for the job:** object storage is designed to hold huge numbers of large files cheaply and keeps several copies automatically.

The database `photos` table stores: `photo_id`, `user_id`, `caption`, `created_at`, `original_key`, `thumbnail_key` and `status`. The keys point to the files in object storage.

## 5. Architecture diagram

```
                              +--------------------+
                              |  Users (app / web) |
                              +---------+----------+
                                        |
                                        v
       photos and thumbnails    +-------+--------+
   +--------------------------> |      CDN       |
   |   (cache miss: fetch from  +-------+--------+
   |    object storage)                 | API requests (feed, upload, follow)
   |                                    v
   |                            +-------+--------+
   |                            | Load balancer  |
   |                            +-------+--------+
   |                                    |
   |                    +---------------+---------------+
   |                    v               v               v
   |             +------+-----+  +------+-----+  +------+-----+
   |             | App server |  | App server |  | App server |   (stateless)
   |             +--+---+---+-+  +------------+  +------------+
   |                |   |   |
   |     check first|   |   | 1. save photo        3. add job
   |                v   |   v    file                  |
   |         +------+-+  |  +-----+--------------+      v
   |         | Cache  |  |  |  Object storage    |  +---+---------+
   |         | (Redis)|  |  | (photos+thumbnails)|  |    Queue    |
   |         +--------+  |  +-----+--------------+  +---+---------+
   |                     |        ^   ^                  |
   +---------------------+--------+   |                  v
                         |            |         +--------+---------+
                         |            +---------+ Thumbnail worker |
                         |        5. save        |  (several)       |
                         |           thumbnail   +--------+---------+
                         |                                |
                         | 2. save details (writes)       | 6. mark photo ready
                         v                                v
                  +------+------------------------------------+
                  |        Database (primary)                 |
                  +------+------------------------------------+
                         | copies every change
                         v
                  +------+---------+
                  | Read replica   |  <-- feed reads when the cache misses
                  +----------------+
```

How to read it:

- **Photo files** go from users to the CDN. On a cache miss the CDN fetches from object storage.
- **API requests** go through the load balancer to any of the app servers.
- **Feed reads:** app server, cache first, then the read replica if the cache misses.
- **Writes:** app server saves the photo file to object storage and the photo's details to the primary database.
- **Thumbnails:** app server adds a job to the queue, a worker picks it up, creates the thumbnail, saves it to object storage and updates the database.

## 6. What each component does

- **CDN:** it keeps copies of photos and thumbnails on servers close to the user, so images load quickly and most photo traffic never reaches our own servers.
- **Load balancer:** it spreads incoming requests across many app servers so that no single server is overloaded and one server failing doesn't take the app down.
- **App servers:** they run the SnapShare logic (login, upload, feed) and, because they keep no user data of their own, we can add more of them as traffic grows.
- **Cache (Redis):** it keeps recently built feeds and popular data in memory so repeated feed views are answered in a fraction of a millisecond without touching the database.
- **Database (primary):** it is the trusted record of users, follows and photo details, and it handles all writes so the data stays consistent.
- **Read replica:** it is a live copy of the primary that answers read queries, which takes the heavy feed-reading load off the primary database.
- **Object storage:** it stores the actual photo and thumbnail files cheaply and durably, at hundreds of terabytes per year, which a database could not do.
- **Queue:** it holds "make a thumbnail" jobs so an upload can finish immediately, and it absorbs bursts of uploads without losing any work.
- **Thumbnail worker:** it takes jobs from the queue and creates the 50 KB thumbnails in the background, and we can run more workers when the queue gets long.

## 7. Upload flow, step by step

1. **User uploads.** The user picks a photo in the app, which sends it to SnapShare through the CDN and load balancer to one of the app servers.
2. **Check the request.** The app server checks that the user is logged in, that the file is an allowed image type, and that it is within the size limit (for example, 10 MB).
3. **Save the file.** The app server saves the original photo in object storage and gets back its file key.
4. **Save the details.** The app server writes a new row to the primary database (owner, caption, time, original file key, status `processing`).
5. **Queue the thumbnail job.** The app server adds a message with the photo's ID and file key to the queue.
6. **Reply quickly.** The app server tells the user "uploaded" (HTTP `201 Created`), without waiting for the thumbnail. The app shows the photo from the user's own device while it processes.
7. **Worker makes the thumbnail.** A thumbnail worker takes the job from the queue, downloads the original from object storage, creates a 50 KB thumbnail, and saves it back to object storage.
8. **Mark it ready.** The worker updates the photo's row in the database with the thumbnail key and sets the status to `ready`. If the job fails, it goes back on the queue and is retried a few times before being marked as failed and logged for review.
9. **Refresh the cache.** The cached copy of the uploader's photo list is deleted, so the next read is fresh. Followers see the photo when their cached feed next refreshes, usually within seconds or a minute.
10. **Followers see it.** When a follower opens their feed, the app server checks the cache, then the read replica on a miss, and returns the photo's thumbnail URL. The follower's app then loads the image from the CDN.

## 8. Trade-offs

1. **Fresh data vs speed (cache and read replica).** The cache and read replica make reads fast and protect the primary database, but followers may see a new photo a few seconds late, because the replica copies changes shortly after they happen and cached feeds are kept for a short time. We accept this because 50 reads for every write makes speed more important than showing the very latest photo instantly.
2. **Fast uploads vs a thumbnail that isn't instant (queue and worker).** Making thumbnails in the background keeps uploads quick and lets us handle bursts, but the thumbnail isn't ready for a short while, so the app needs a placeholder or the user's own copy. It also adds more parts to run, monitor and retry, which is more complex than making the thumbnail inside the upload request.
3. **Cost and complexity vs performance (CDN).** A CDN makes images load faster worldwide and cuts the load on our servers, but it costs money and cached copies can stay in the CDN after a photo is deleted, until the copy expires or we purge it.
4. **Simplicity vs scale (object storage instead of the database).** Keeping photo files out of the database makes the system cheap and scalable, but now the file and its database row live in two places that must be kept in step. If one write fails, we can end up with a file with no row, or a row with no file, so we need clean-up jobs.