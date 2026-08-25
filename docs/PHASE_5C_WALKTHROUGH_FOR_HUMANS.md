# Step-by-step: testing the record rules (plain-language version)

This is a click-by-click guide to the same tests described in
`PHASE_5C_RULES_MANUAL_VERIFICATION.md`. That document was written for a developer.
This one is written for you — no programming knowledge assumed. Where a technical
word is unavoidable, it's explained the first time it appears.

**What we're doing, in one sentence:** checking that the security rules for
calibration records actually let the right people do the right things, and refuse
everyone else — before those rules go live for real.

Budget about 45–60 minutes the first time through.

---

## Part 1 — Words you'll see

- **UID** — a long random ID Firebase gives every user account. Not their email,
  not their name. The rules check the UID, so you need to know each test user's UID
  before starting.
- **Document** — one record in the database. Like one row in a spreadsheet.
- **Field** — one piece of information inside a document. Like one cell.
- **Rules Playground** — a page in the Firebase console that lets you *simulate* an
  action ("what if this person tried to do this?") without actually doing it for
  real, or without needing your app running.
- **Allow / Deny** — the result the Playground shows you. Allow means the action
  would succeed. Deny means it would be blocked.

---

## Part 2 — One-time setup (do this first)

### Step 1: Create three test user accounts

You need three separate people for these tests, because the rules deliberately
stop one person doing everything (e.g. approving their own work).

If you already have real staff accounts you trust for this, you can use those
instead of creating new ones — skip to Step 2. Otherwise, create three new users
in **Firebase Console → Authentication → Users → Add user**. Any email works, even
a fake one like `tech-test@example.com` — this is just for testing.

Call them, in your notes, **TECH**, **REVIEWER**, **APPROVER**. They must be three
different accounts.

### Step 2: Write down each one's UID

Still in **Authentication → Users**, each row shows a **User UID** column — a long
string like `a1B2c3D4e5F6...`. Copy each one into a notes file, labeled clearly:

```
TECH_UID = ...
REVIEWER_UID = ...
APPROVER_UID = ...
```

You'll paste these UIDs into the Playground repeatedly, so having them ready saves
a lot of tab-switching.

### Step 3: Give each user the right role, in Firestore

Go to **Firestore Database → Data tab → `users` collection**.

For each of the three UIDs, you need a document at `users/{that UID}` — for
example `users/a1B2c3D4e5F6...` — containing a field called `role`.

- **TECH** → `role` = `staff`
- **REVIEWER** → `role` = `admin`
- **APPROVER** → `role` = `admin`

(Reviewer and approver must both be admin, and must be *different* admins — your
lab confirmed it has two or more admin accounts, which is exactly why.)

If a document for that UID doesn't exist yet, click **Add document**, type the UID
as the Document ID, then add a field named `role` (type: string) with the value
above.

### Step 4: Confirm the two role documents exist

Still in Firestore Data tab, look for a collection called `roles`. Confirm:

- `roles/admin` exists, and has a `permissions` field that's a list including
  things like `records.review` and `records.approve`
- `roles/staff` exists, and its `permissions` list includes `records.commit` and
  `records.revise`

**If either is missing, stop here and tell me** — the rest of these tests, and the
real app, will not work correctly until those exist.

### Step 5: Open the Rules Playground

1. Go to **Firebase Console → Firestore Database → Rules** tab.
2. Look for a button near the top of the rules editor labeled **Rules Playground**
   (it has a small tuning-knob icon). Click it.
3. A panel opens on the left with these controls, top to bottom:
   - **Simulation type** — a dropdown (get / create / update / delete)
   - **Location** — a path field, e.g. `/records/scratch1`
   - **Data** — a button labeled **Build document** (only shows for create/update)
   - **Authenticated** — a toggle switch
   - Below that when Authenticated is on: **Provider**, **Firebase UID**, **Email**,
     **Name**, **Phone**
   - A blue **Run** button

You'll use this same panel for every test below. It resets between runs, so you'll
repeat these steps each time — that repetition is normal.

---

## Part 3 — How to run any single test

Every test in Part 4 follows this exact pattern. Read this once carefully, then
you can move quickly.

1. **Set Simulation type** — click the dropdown, pick `create`, `update`, or
   `delete` as the test says.
2. **Set Location** — click the second (blank) field under Location, type the path,
   e.g. `/records/scratch1`.
3. **Set the data** (only for create/update):
   - Click **Build document**.
   - A dialog opens with **Field / Type / Value** columns.
   - Type the field name (e.g. `status`) in the Field box.
   - Leave Type as `string` unless the test says otherwise.
   - Click the value box underneath and type the value (e.g. `draft`).
   - To add another field, click **+ Add field** and repeat.
   - Click **Done**.
4. **Turn on Authenticated** — click the toggle so it turns blue.
5. **Set Firebase UID** — paste in the UID of whichever test user the case names
   (TECH_UID, REVIEWER_UID, etc). Leave Email/Name/Phone blank — they don't affect
   the result.
6. **Click Run.**
7. **Read the result**, shown above the Run button — it will say **Allow** or
   **Deny** in a colored banner.
8. **Compare to "Expected"** in the table below. Tick it off. If it doesn't match,
   stop and note exactly which case failed — don't continue past a mismatch without
   flagging it.

**For unauthenticated tests:** just leave the Authenticated toggle off. Skip the
Firebase UID field entirely.

---

## Part 4 — The tests, in plain steps

Work through these in order — later sections reuse documents you create in earlier
ones.

### Group 1 — Creating a new record

No scratch document needed yet.

**1a.**
- Simulation type: `create`
- Location: `/records/scratch1`
- Data: field `status` = `draft`
- Authenticated: on, UID = TECH_UID
- Run → expect **Allow**

**1b.** Same as 1a, but change the data field to `status` = `committed` instead of
`draft`.
- Run → expect **Deny**

**1c.** Same as 1a, but turn Authenticated **off** (don't set a UID).
- Run → expect **Deny**

### Group 2 — Editing your own draft

First, create a real scratch document (not just a simulated one) so later tests
have something real to check against.

**Create the document for real:**
1. Go to **Firestore Database → Data tab**.
2. Find or create collection `records`.
3. Click **Add document**, set Document ID to `rec_draft`.
4. Add these fields:
   - `status` (string) = `draft`
   - `createdBy` (string) = TECH_UID (paste the actual value)
   - `rows` (array) = leave empty
   - `environment` (array) = leave empty
5. Save.

Now back in the Playground:

**2a.**
- Simulation type: `update`
- Location: `/records/rec_draft`
- Data: `status` = `draft`, `createdBy` = TECH_UID, plus a `rows` field (array) with
  one item if you want — the exact content isn't critical, just keep `status` as
  `draft`
- Authenticated: on, UID = TECH_UID
- Run → expect **Allow**

**2b.** Same as 2a, but change the UID to REVIEWER_UID instead.
- Run → expect **Allow** (yes, allowed — anyone can currently edit a draft that's
  still a draft; that's intentional and unchanged)

### Group 3 — Committing a draft (this is where a record number gets assigned)

Reuse `/records/rec_draft` from Group 2.

**3a.**
- Simulation type: `update`
- Location: `/records/rec_draft`
- Data: `status` = `committed`, `recordNumber` = `X-001`, `committedBy` = TECH_UID
  (add a `rows` and `summary` field too if you want, type array/map — not essential
  to the result)
- Authenticated: on, UID = TECH_UID
- Run → expect **Allow**

**3b.** Same as 3a, but change UID to a made-up value that has no matching
`users/` document — type any random text like `nobody123` into Firebase UID.
- Run → expect **Deny**

**3c.** Same as 3a again, but this time create/edit the scratch doc so its current
`status` is already `committed` (edit `rec_draft` in the Data tab to set
`status` = `committed` first), then run the same update.
- Run → expect **Deny**

**3d.** Set the scratch doc's `status` back to `draft` in the Data tab. In the
Playground, try `update` with data `status` = `reviewed` directly (skipping
committed).
- Run → expect **Deny**

Afterward, edit `rec_draft` in the Data tab back to `status` = `committed` (with
`recordNumber` = `X-001`) so Group 4 can use it.

### Group 4 — Reviewing a committed record

Create a fresh scratch document:
1. **Add document**, ID `rec_committed`.
2. Fields: `status` = `committed`, `createdBy` = TECH_UID, `recordNumber` = `X-001`.

**4a.**
- Simulation type: `update`
- Location: `/records/rec_committed`
- Data: `status` = `reviewed`, `reviewedAt` = (any value, type string, e.g. `now`),
  `reviewedBy` = REVIEWER_UID, `reviewerSignature` = (type map, leave empty or add
  any sub-field)
- Authenticated: on, UID = REVIEWER_UID
- Run → expect **Allow**

**4b.** Same as 4a, but set `reviewedBy` to APPROVER_UID instead of REVIEWER_UID
(so it doesn't match the person actually logged in).
- Run → expect **Deny** (this catches someone signing as somebody else)

**4c.** Same as 4a, but change Firebase UID to TECH_UID (the same person who
created the draft).
- Run → expect **Deny** (nobody reviews their own work)

**4d.** Same as 4a, but also add an unrelated extra field to the data, e.g.
`rows` = (array, anything).
- Run → expect **Deny**

**4e.** Same as 4a, but first edit `rec_committed` in the Data tab to set
`status` = `draft` temporarily, then run.
- Run → expect **Deny**. Afterward, set it back to `status` = `committed`.

### Group 5 — Approving a reviewed record

Create a fresh scratch document:
1. **Add document**, ID `rec_reviewed`.
2. Fields: `status` = `reviewed`, `createdBy` = TECH_UID, `reviewedBy` =
   REVIEWER_UID, `recordNumber` = `X-001`.

**5a.**
- Simulation type: `update`
- Location: `/records/rec_reviewed`
- Data: `status` = `approved`, `approvedAt` = `now`, `approvedBy` = APPROVER_UID,
  `approverSignature` = (map, can be empty)
- Authenticated: on, UID = APPROVER_UID
- Run → expect **Allow**

**5b.** Same as 5a, but change Firebase UID to REVIEWER_UID (the same person who
reviewed it).
- Run → expect **Deny** (nobody approves their own review)

**5c.** Same as 5a, but set `approvedBy` to REVIEWER_UID while staying logged in
as APPROVER_UID.
- Run → expect **Deny**

### Group 6 — Creating a revision (correcting a mistake)

Create a fresh scratch document:
1. **Add document**, ID `rec_to_supersede`.
2. Fields: `status` = `committed`, `createdBy` = TECH_UID.

**6a.**
- Simulation type: `update`
- Location: `/records/rec_to_supersede`
- Data: `status` = `superseded`, `supersededBy` = `some-fake-id-123`
- Authenticated: on, UID = TECH_UID
- Run → expect **Allow**

**6b.** Same as 6a, but use a UID that has no matching `users/` document (like
`nobody123` again).
- Run → expect **Deny**

**6c.** First edit `rec_to_supersede` in the Data tab to set
`status` = `superseded`, then repeat the same update.
- Run → expect **Deny**. Set it back to `committed` afterward.

**6d.** Edit `rec_to_supersede` to `status` = `draft`, then repeat the update.
- Run → expect **Deny**

### Group 7 — Nothing can ever be deleted

**7a.**
- Simulation type: `delete`
- Location: `/records/rec_committed` (or any of your scratch docs)
- Authenticated: on, UID = REVIEWER_UID (or even an admin — doesn't matter who)
- Run → expect **Deny**, always, no matter who's logged in

### Group 8 — The most important group: what happens if a role is missing

This is the specific behavior we changed and most need to confirm. **Read each
step carefully — you'll be temporarily editing real data and must put it back.**

> **⚠ Correction (2026-08-04).** An earlier version of 8a said to run as TECH.
> That was wrong: Step 3 gives TECH the `staff` role, and deleting `roles/admin`
> has no effect on a `staff` user — `roles/staff` would still grant permission, so
> the test would return **Allow** and prove nothing. The test only means something
> if the user being tested actually has the `admin` role. Steps below are corrected.

**8a.**
1. Go to Firestore Data tab → `users` collection → open TECH's document.
   **Note its current `role` value (`staff`)**, then temporarily change `role` to
   `admin`. This is what makes the test meaningful — we need a user who genuinely
   depends on `roles/admin` existing.
2. Go to `roles` collection → open the `admin` document.
   **Write down its current `permissions` list somewhere safe** — you'll restore it.
3. Temporarily delete the `admin` document (deleting and recreating is simpler than
   renaming).
4. In the Playground: `update` on `/records/rec_draft` (set its status back to
   `draft` in the Data tab first if needed), data `status` = `committed` (+ the
   other fields from test 3a), Authenticated on, UID = TECH_UID.
5. Run → expect **Deny** — because TECH's role now says `admin`, but there is no
   `roles/admin` document to grant anything. That is the fail-closed behaviour.
6. **Immediately recreate `roles/admin`** with its original `permissions` list from
   step 2. Don't skip this — leaving it deleted breaks the real app.
7. **Set TECH's `role` field back to `staff`** (from step 1). If you leave it as
   `admin`, that person holds admin rights in the live system.

**8b.**
1. Open `roles/admin` again. Temporarily remove just `records.commit` from its
   `permissions` list (keep everything else).
2. Run the same test as 8a.
3. Run → expect **Deny**
4. **Restore the full original `permissions` list** immediately after.

**8c.**
1. Pick any UID that has a `users/` document, and temporarily set its `role` field
   to a made-up value like `ghost-role` (something with no matching `roles/`
   document).
2. In the Playground: `update` on `/records/rec_committed` (status `committed`),
   data `status` = `reviewed` (+ fields from test 4a), Authenticated on, UID = that
   same user.
3. Run → expect **Deny**
4. **Set that user's `role` field back** to what it was.

**8d.** (Sanity check that the fix didn't overcorrect)
- With `roles/admin` fully restored and correct, repeat 8a's request one more time.
- Run → expect **Allow**

---

## Part 5 — Clean-up

Once every test above matches its expected result:

1. Delete every scratch document you created: `rec_draft`, `rec_committed`,
   `rec_reviewed`, `rec_to_supersede`, `scratch1` (if it still exists).
2. Double-check `roles/admin` and `roles/staff` both exist with their full,
   correct `permissions` lists.
3. Double-check every real user you plan to actually use has a `users/{uid}`
   document with an explicit `role` field set — a missing field denies that
   person everything, silently.

---

## If something doesn't match "Expected"

Stop. Don't keep going and don't publish the rules. Write down: which numbered
case, what you set for Simulation type / Location / Data / UID, and what result
you got instead. Bring that back here and we'll work out whether it's the rules
or the test setup.

## What these tests do NOT check

Even with all of the above passing, one thing is still not protected by the rules
(this is a known, accepted limitation — see ADR-008): a person with permission to
commit a record could, in principle, type in a fake record number instead of
letting the system generate the real one. Fixing that needs a different kind of
server-side code (a "Cloud Function"), which is a separate piece of work, not part
of this test.
