# Phase 34 Result — Permission model audit (read-only)

Prompt: `docs/PHASE_34_PROMPT_PERMISSION_MODEL_AUDIT.md`.
Nothing in this phase changed a source file, a rule, or a deployment.

---

## 0. Two deviations from the prompt, declared up front

### 0a. `Expected branch: master` is WRONG. Audited `feature/trace-ui` instead.

The prompt's pre-work says `Expected branch: master`. The repository is on
`feature/trace-ui`. The prompt's own stop condition says to halt on a branch
mismatch, so this was resolved with evidence rather than assumption:

    git diff master..feature/trace-ui --stat -- <the audited files>
     firestore.rules                                   | 288 +++++++-
     src/components/JobModal.tsx                       | 382 ++++++++++-
     src/services/certificateNumberGeneratorService.ts |  67 +-
     src/services/roleService.ts                       |  23 +-
     src/types/index.ts                                | 783 +++++++++++++++++++++-
     5 files changed, 1488 insertions(+), 55 deletions(-)

The mismatch is **material** — `firestore.rules` alone differs by 288 lines, so
the two branches would produce different audits.

**Which branch did the prompt actually describe?** Every anchor in the Verified
facts resolves exactly on `feature/trace-ui`: fact 1 lands on
`firestore.rules:161-165`, fact 5 lands on `JobModal.tsx:3106-3112` with the
disable expression on line 3109 exactly as quoted. On `master` those files are
different. **The prompt was written from `feature/trace-ui`; the
`Expected branch: master` line is the error.**

The dev server also runs from this directory on this branch, so this is the code
the owner is actually using. Audit conducted on `feature/trace-ui`. No branch was
switched — doing so would have put the uncommitted Phase 31A/32/33 work at risk.

### 0b. Task 6 item 7 cannot be satisfied as written.

It requires `git status` to prove `docs/PHASE_34_RESULT.md` is the only changed
file. Three files were already modified before this phase began, from the
dependency-upgrade session earlier the same day, plus one untracked doc:

    M package-lock.json
    M package.json
    M src/App.tsx
    ?? docs/PROJECT_INSTRUCTION.md

None were touched by this phase. The honest form of that requirement — *this
phase added exactly one file and modified nothing* — is met, and is shown in
section 7.

---

## 1. Pre-work (CLAUDE.md RULE 3/4/8)

    Repository path:  C:\Users\seela\Desktop\LIMS-New
    Branch:           feature/trace-ui        (prompt expected master — see 0a)
    Worktrees:        C:/Users/seela/Desktop/LIMS-New  0305d35 [feature/trace-ui]
                      — exactly one
    git status:        M package-lock.json
                       M package.json
                       M src/App.tsx
                       ?? docs/PROJECT_INSTRUCTION.md
    node processes:   PID 33532  npm run dev
                      PID 6176   C:\Users\seela\Desktop\LIMS-New\node_modules\.bin\..\vite\bin\vite.js
                      PID 8780, 23308, 20548, 26632 — @modelcontextprotocol/server-pdf, unrelated

**Nothing runs from `LIMS-New-Backup`.** Confirmed: the only vite process is
serving `C:\Users\seela\Desktop\LIMS-New`.

**On CLAUDE.md line 145.** It names
`C:\Users\seela\OneDrive\Desktop\LIMS-New` as the dev-server directory. That path
is stale — the real working copy is `C:\Users\seela\Desktop\LIMS-New` (no
OneDrive). This is already recorded as stale in `PHASE_PROMPTS.md` and
`PHASE_33_RESULT.md`, but CLAUDE.md itself was never corrected, so this same
false stop will fire on every future phase until someone fixes line 145.

---

## 2. Task 1 — the gate. All eight facts CONFIRMED.

| # | Fact | Verdict |
|---|---|---|
| 1 | `firestore.rules:161-165` certificate_number_configs read/write | **CONFIRMED** |
| 2 | `firestore.rules:155-160` comment, and that it is false | **CONFIRMED** |
| 3 | `certificateNumberGeneratorService.ts` allocation is a write | **CONFIRMED** |
| 4 | `AuthContext.tsx:96` isAdmin derivation | **CONFIRMED** |
| 5 | `JobModal.tsx` has no permission gate on Generate | **CONFIRMED** |
| 6 | `PermissionContext.tsx` model, `user.role` overloaded | **CONFIRMED** |
| 7 | `roleService.ts` 59 permissions / 14 categories / 39 standard | **CONFIRMED** |
| 8 | Firestore rules cannot be executed on this machine | **CONFIRMED** |

**Fact 1** — `firestore.rules:161-165` reads exactly:

    match /certificate_number_configs/{configId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null &&
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
    }

**Fact 2** — the comment at 155-160 does assert *"The UI gates on isAdmin directly
(not a granular permission) so it can never offer an action this rule will
refuse."* Fact 5 disproves it. The comment is false and should be deleted when
this area is next touched.

**Fact 3** — `generateCertificateNumber(configId)` at line 65; `configRef =
doc(db, 'certificate_number_configs', configId)` at line 67; `transaction.update(
configRef, {...})` at line 132. `generateCertificateNumberForEquipment` at line
240, delegating at line 245. Allocation **is** a write to the path guarded by
fact 1.

**Fact 4** — `AuthContext.tsx:96`: `const isAdmin = currentUser?.role?.toLowerCase() === 'admin';`

**Fact 5** — line 12 imports `generateCertificateNumberForEquipment`. Lines
129-132 call `usePermission` for `jobs.edit`, `jobs.create`, `jobs.generatePdf`,
`jobs.delete`. A grep for `usePermission(` across the whole 3706-line file
returns **only those four lines**. The button at 3106-3112 is disabled on line
3109 by exactly:

    !currentJob || generatingCertificateForRow === index || Boolean(String(eq.certificateNumber ?? '').trim())

No admin check. No permission check. Confirmed.

### Fact 5's flagged unknown — RESOLVED

The prompt flagged a second certificate-number render site near lines 2674-2693 as
*unverified*. It exists, at **`JobModal.tsx:2681-2699`** (the prompt's estimate was
seven lines early). It **does** expose a Generate control — same
`handleGenerateCertificateNumberForItem(index)` handler — but with a different
disable expression at 2684-2689:

    formDisabled || !currentJob || generatingCertificateForRow === index || Boolean(String(eq.certificateNumber ?? '').trim())

`formDisabled` is defined at `JobModal.tsx:1371` as `!canSave || permLoading`,
and `canSave` at 1370 as `currentJob ? hasEditJobPermission : hasCreateJobPermission`.

**So the second site is gated — but by `jobs.edit`, not by any
`certificateNumbers.*` permission.** Both sites therefore still offer allocation
to a non-admin: site 1 (3106) to anyone who can open the modal, site 2 (2681) to
anyone holding `jobs.edit`. Both writes hit the admin-only rule. The bug is
present at both render sites; the second is merely narrower.

**Fact 6** — `roleId = currentUser.role` (57), `doc(db, 'roles', roleId)` (64),
`setPermissions(new Set(perms))` (71), and `can()` at 88-91:

    const can = (permission: PermissionAction): boolean => {
      if (isAdmin) return true;
      return permissions.has(permission as string);
    };

The overloading of `user.role` is confirmed and is the root cause of the whole
mismatch class — see section 4.

**Fact 7** — `ALL_PERMISSIONS` spans `roleService.ts:23-110`, contains **59**
entries across **14** categories. `DEFAULT_ROLE_PERMISSIONS.standardUser`
(118-139) excludes `users.*` (6), `roles.*` (4), `equipmentTypes.*` (2),
`recorderTemplates.*` (3), `records.review`, `records.approve`,
`settings.jobIdConfig`, `settings.customerIdConfig`, `settings.companyInfo` — 20
excluded, **39 granted**. Computed directly from the file, matching the owner's
"39 selected" screenshot. `certificateNumbers.view` and `certificateNumbers.edit`
are both in the standard-user set. Confirmed.

**Fact 8** — `firebase.json` contains no `emulators` key (grep count: 0). `java`
is not on PATH. `JAVA_HOME` is unset. `@firebase/rules-unit-testing` is not
installed. `src/services/__tests__/fakeFirestore.ts` exists (11 KB) and is a
permissive in-memory mock. **Firestore rules cannot be executed on this machine.**
Confirmed on every clause.

---

## 3. A ninth finding: the prompt's row set of 59 is incomplete

Not one of the eight facts, but it changes the audit's scope, so it is reported
rather than silently absorbed.

`PermissionAction` in `src/types/index.ts:3-25` declares **70** permission
strings. `ALL_PERMISSIONS` lists **59**. The 11 missing are all
`equipmentControl.*` (9) and `staffTraining.*` (2).

Eight of the eleven are dead — zero references anywhere in `src/`. **Three are
live and consulted at runtime:**

    src/pages/equipment/EquipmentDetailPage.tsx:2560  usePermission('equipmentControl.deleteDocuments')
    src/pages/StaffPage.tsx:855                       usePermission('staffTraining.view')
    src/pages/StaffPage.tsx:856                       usePermission('staffTraining.manage')

Because the Roles screen is built from `ALL_PERMISSIONS` (`roleService.ts:599`)
and `DEFAULT_ROLE_PERMISSIONS.standardUser` derives from the same array, these
three can never appear in any non-admin's permission set. `can()` returns `true`
for admins via the short-circuit and `false` for everyone else, permanently.

**In plain terms:** a non-admin can never see the training records on the Staff
page, and can never delete an equipment document — and no one can change that
from the Roles screen, because those three switches are not on it. Whether that is
the intent is the owner's call; the point is that it is invisible.

They are listed as rows 60-62 in section 4, outside the 59.

---

## 4. The permission → rule join

### The structural fact underneath every row

`firestore.rules` reads `users/{uid}.role` and compares it to the literal string
`'admin'`. `PermissionContext` reads `roles/{roleId}.permissions`. These are two
different documents. **With one exception, no rule in the file can see a custom
role's permission array at all.**

The exception is the `records` collection (`firestore.rules:282-418`), which
defines `callerHasPermission(action)` at 291-295 — it reads
`roles/{role}.permissions` and tests membership. It is used at lines 328
(`records.commit`), 336 (`records.review`), 354 (`records.approve`) and 366
(`records.revise`). **Those four permissions are the only ones in the system that
are enforced end to end.** Everything else is either admin-only in the rules
(where the checkbox cannot help) or open to any signed-in user (where the checkbox
is the only barrier and is trivially bypassed).

### Rule classes referenced in the table

| Path | Lines | Read | Write | Class |
|---|---|---|---|---|
| `users/{userId}` | 7-32 | authed | create/update/delete admin; self-update limited to 5 safe fields (16-19) | MIXED |
| `customers/{customerId}` | 53-56 | **`if true` — public, unauthenticated** | authed | OPEN |
| `settings/{settingId}` | 59-61 | authed | authed | OPEN |
| `system/companyInfo` | 65-68 | **`if true` — public** | admin | ADMIN |
| `system/{document}` | 70-74 | authed | admin | ADMIN |
| `document_index/{docId}` | 123-126 | authed | authed | OPEN |
| `certificate_number_configs/{configId}` | 161-165 | authed | **admin** | ADMIN |
| `equipment_types/{id}` | 172-176 | authed | admin | ADMIN (retired, ADR-012) |
| `recorderTemplates/{id}` | 215-219 | authed | admin | ADMIN |
| `recorderTemplateVersions/{id}` | 242-250 | authed | create admin; update `false`; delete admin | ADMIN |
| `records/{recordId}` | 282-418 | authed | permission-aware; void/restore admin; delete `false` | **PERMISSION-AWARE** |
| `equipment/{id}` | 447-450 | authed | authed | OPEN |
| `equipmentControl/{id}` + subs | 454-476 | authed | authed | OPEN |
| `serviceRequests/{id}` | 481-486 | authed | **create `if true` — public**; r/u/d authed | OPEN |
| `roles/{roleId}` | 489-493 | authed | admin | ADMIN |
| `templates/{id}` | 498-542 | authed | create authed; update/delete owner-or-admin | MIXED |
| `jobs/{jobId}` + all subs | 595-641 | authed | authed | OPEN |
| `pdf_templates/{id}` | 644-672 | authed | create authed; update/delete owner-or-admin | MIXED |
| `spreadsheet_templates/{id}` | 675-701 | authed | create authed; update/delete owner-or-admin | MIXED |
| `jobLogs/{logId}` | 703-706 | authed | create authed | OPEN |
| `staffLogs/{staffId}/actions/{id}` | 708-719 | **self or admin** | create authed | MIXED |
| `staffDocuments/{docId}` | 761-765 | authed | authed | OPEN |
| `trainingRecords/{recordId}` | 768-772 | authed | authed | OPEN |
| `{document=**}` catch-all | 774-776 | `false` | `false` | CLOSED |
| **Storage** — all job/customer/template/equipment/staff paths | storage.rules 6-69 | authed | authed | OPEN |
| **Storage** — `users/**`, `avatars/**` | storage.rules 37-49 | owner only | owner only | OWNER |
| **Storage** — catch-all | storage.rules 72-74 | `false` | `false` | CLOSED |

### The 59 rows

`useSettingsAccess.tsx:16-26` holds nine permissions in an OR-list that decides
only whether the **Settings menu item appears**. It never gates an individual
action. Rows marked *(module gate only)* are consulted there and nowhere else.

| # | Permission | Category | UI call sites | Path | Rule lines | Class | Verdict |
|---|---|---|---|---|---|---|---|
| 1 | serviceRequests.view | Service Requests | none | serviceRequests | 481-486 | OPEN | NO_CALL_SITE |
| 2 | serviceRequests.convert | Service Requests | none | serviceRequests→jobs | 481-486, 595-599 | OPEN | NO_CALL_SITE |
| 3 | serviceRequests.cancel | Service Requests | none | serviceRequests | 481-486 | OPEN | NO_CALL_SITE |
| 4 | serviceRequests.delete | Service Requests | none | serviceRequests | 481-486 | OPEN | NO_CALL_SITE |
| 5 | jobs.view | Jobs | none | jobs | 595-599 | OPEN | NO_CALL_SITE |
| 6 | jobs.create | Jobs | JobModal.tsx:130 | jobs | 595-599 | OPEN | RULE_OPEN_UI_ONLY |
| 7 | jobs.edit | Jobs | JobModal.tsx:129 | jobs | 595-599 | OPEN | RULE_OPEN_UI_ONLY |
| 8 | jobs.delete | Jobs | JobModal.tsx:132 | jobs | 595-599 | OPEN | RULE_OPEN_UI_ONLY |
| 9 | jobs.assign | Jobs | none | jobs | 595-599 | OPEN | NO_CALL_SITE |
| 10 | jobs.changeStatus | Jobs | none | jobs | 595-599 | OPEN | NO_CALL_SITE |
| 11 | jobs.export | Jobs | none (only doc-comments in permissionDiscoveryService.ts:28,258,263) | n/a — client-side | — | — | NO_CALL_SITE |
| 12 | jobs.import | Jobs | none | jobs | 595-599 | OPEN | NO_CALL_SITE |
| 13 | jobs.generatePdf | Jobs | JobModal.tsx:131 | reads pdf_templates | 644-672 | MIXED | RULE_OPEN_UI_ONLY |
| 14 | jobs.viewDeleted | Jobs | none | jobs | 595-599 | OPEN | NO_CALL_SITE |
| 15 | customers.view | Customers | none | customers | 53-56 | OPEN (**read public**) | NO_CALL_SITE |
| 16 | customers.create | Customers | none | customers | 53-56 | OPEN | NO_CALL_SITE |
| 17 | customers.edit | Customers | none | customers | 53-56 | OPEN | NO_CALL_SITE |
| 18 | customers.delete | Customers | none | customers | 53-56 | OPEN | NO_CALL_SITE |
| 19 | customers.export | Customers | none | n/a — client-side | — | — | NO_CALL_SITE |
| 20 | documentIndex.view | Documents | none | document_index | 123-126 | OPEN | NO_CALL_SITE |
| 21 | documentIndex.manage | Documents | DocumentIndexEditorModal.tsx:96; DocumentIndexManagerModal.tsx:19; DocumentIndexPage.tsx:36 | document_index | 123-126 | OPEN | RULE_OPEN_UI_ONLY |
| 22 | spreadsheetTemplates.view | Spreadsheet Templates | useSettingsAccess.tsx:23; spreadsheetTemplateService.ts:139 | spreadsheet_templates, templates | 675-701, 498-542 | MIXED | RULE_OPEN_UI_ONLY |
| 23 | spreadsheetTemplates.create | Spreadsheet Templates | none | spreadsheet_templates | 675-701 | MIXED | NO_CALL_SITE |
| 24 | spreadsheetTemplates.edit | Spreadsheet Templates | none | spreadsheet_templates | 675-701 | MIXED | NO_CALL_SITE |
| 25 | spreadsheetTemplates.delete | Spreadsheet Templates | none | spreadsheet_templates | 675-701 | MIXED | NO_CALL_SITE |
| 26 | spreadsheetTemplates.duplicate | Spreadsheet Templates | none | spreadsheet_templates | 675-701 | MIXED | NO_CALL_SITE |
| 27 | pdfTemplates.view | PDF Templates | useSettingsAccess.tsx:24 *(module gate only)* | pdf_templates | 644-672 | MIXED | RULE_OPEN_UI_ONLY |
| 28 | pdfTemplates.create | PDF Templates | none | pdf_templates | 644-672 | MIXED | NO_CALL_SITE |
| 29 | pdfTemplates.edit | PDF Templates | none | pdf_templates | 644-672 | MIXED | NO_CALL_SITE |
| 30 | pdfTemplates.delete | PDF Templates | none | pdf_templates | 644-672 | MIXED | NO_CALL_SITE |
| 31 | pdfTemplates.duplicate | PDF Templates | none | pdf_templates | 644-672 | MIXED | NO_CALL_SITE |
| 32 | users.view | Users | useSettingsAccess.tsx:21 *(module gate only)* | users | 7-32 | MIXED (read open) | RULE_OPEN_UI_ONLY |
| 33 | users.create | Users | none | users | 31 | ADMIN | NO_CALL_SITE |
| 34 | users.edit | Users | none | users | 31 | ADMIN | NO_CALL_SITE |
| 35 | users.delete | Users | none | users | 31 | ADMIN | NO_CALL_SITE |
| 36 | users.activate | Users | none | users | 31 | ADMIN | NO_CALL_SITE |
| 37 | users.deactivate | Users | none | users | 31 | ADMIN | NO_CALL_SITE |
| 38 | roles.view | Roles | useSettingsAccess.tsx:22 *(module gate only)* | roles | 489-493 | ADMIN (read open) | RULE_OPEN_UI_ONLY |
| 39 | roles.create | Roles | none | roles | 491 | ADMIN | NO_CALL_SITE |
| 40 | roles.edit | Roles | none | roles | 491 | ADMIN | NO_CALL_SITE |
| 41 | roles.delete | Roles | none | roles | 491 | ADMIN | NO_CALL_SITE |
| 42 | settings.view | Settings | Layout.tsx:205; useSettingsAccess.tsx:17 | settings | 59-61 | OPEN | RULE_OPEN_UI_ONLY |
| 43 | settings.jobIdConfig | Settings | useSettingsAccess.tsx:18 *(module gate only)* | settings | 59-61 | OPEN | RULE_OPEN_UI_ONLY |
| 44 | settings.customerIdConfig | Settings | useSettingsAccess.tsx:19 *(module gate only)* | settings | 59-61 | OPEN | RULE_OPEN_UI_ONLY |
| 45 | settings.companyInfo | Settings | useSettingsAccess.tsx:20 *(module gate only)* | system/companyInfo | 65-68 | ADMIN | **UI_OFFERS_RULE_DENIES** |
| 46 | certificateNumbers.view | Certificate Numbers | useSettingsAccess.tsx:25 *(module gate only)* | certificate_number_configs | 161-165 | ADMIN (read open) | RULE_OPEN_UI_ONLY |
| 47 | **certificateNumbers.edit** | Certificate Numbers | **none** — but JobModal.tsx:3106-3112 and :2681-2699 expose Generate ungated | certificate_number_configs, written at certificateNumberGeneratorService.ts:132 | **161-165** | **ADMIN** | **UI_OFFERS_RULE_DENIES** |
| 48 | equipmentTypes.view | Equipment Types | none | certificate_number_configs | 161-165 | ADMIN | NO_CALL_SITE |
| 49 | equipmentTypes.edit | Equipment Types | none | certificate_number_configs | 161-165 | ADMIN | NO_CALL_SITE |
| 50 | recorderTemplates.view | Recorder Templates | none | recorderTemplates | 215-219 | ADMIN | NO_CALL_SITE |
| 51 | recorderTemplates.edit | Recorder Templates | RecorderTemplateBuilderPage.tsx:480; RecorderTemplatesListPage.tsx:25 | recorderTemplates | 215-219 | ADMIN | **UI_OFFERS_RULE_DENIES** |
| 52 | recorderTemplates.publish | Recorder Templates | RecorderTemplateBuilderPage.tsx:481 | recorderTemplateVersions, recorderTemplateActiveLocks | 242-250, 254-258 | ADMIN | **UI_OFFERS_RULE_DENIES** |
| 53 | records.commit | Calibration Records | RecordEntryPage.tsx:123 | records | 316-330 (check at 328) | PERMISSION-AWARE | **WORKS** |
| 54 | records.review | Calibration Records | RecordEntryPage.tsx:124 | records | 332-345 (check at 336) | PERMISSION-AWARE | **WORKS** |
| 55 | records.approve | Calibration Records | RecordEntryPage.tsx:125 | records | 350-359 (check at 354) | PERMISSION-AWARE | **WORKS** |
| 56 | records.revise | Calibration Records | RecordEntryPage.tsx:126 | records | 362-369 (check at 366) | PERMISSION-AWARE | **WORKS** |
| 57 | staffPerformance.view | Staff Performance | StaffPage.tsx:853; StaffPerformanceDashboard.tsx:11 | staffLogs/{staffId}/actions | 708-719 | MIXED (self or admin) | **UI_OFFERS_RULE_DENIES** (for other staff) |
| 58 | staffPerformance.viewOwn | Staff Performance | none | staffLogs/{staffId}/actions | 714-716 | MIXED | NO_CALL_SITE |
| 59 | staffPerformance.exportLogs | Staff Performance | StaffPage.tsx:854 | staffLogs/{staffId}/actions | 714-716 | MIXED (self or admin) | **UI_OFFERS_RULE_DENIES** (for other staff) |

### Rows 60-62 — live, but not in `ALL_PERMISSIONS` (see section 3)

| # | Permission | UI call sites | Path | Rule lines | Class | Verdict |
|---|---|---|---|---|---|---|
| 60 | equipmentControl.deleteDocuments | EquipmentDetailPage.tsx:2560 | equipmentControl/{id}/documents + Storage | 465-467; storage 62-64 | OPEN | UNGRANTABLE — permanently false for every non-admin |
| 61 | staffTraining.view | StaffPage.tsx:855 | trainingRecords | 768-772 | OPEN | UNGRANTABLE — permanently false for every non-admin |
| 62 | staffTraining.manage | StaffPage.tsx:856 | trainingRecords | 768-772 | OPEN | UNGRANTABLE — permanently false for every non-admin |

### Verdict tally (of the 59)

| Verdict | Count |
|---|---|
| WORKS | 4 |
| UI_OFFERS_RULE_DENIES | 6 |
| RULE_OPEN_UI_ONLY | 12 |
| NO_CALL_SITE | 37 |
| RULE_ALLOWS_UI_HIDES | 0 |
| UNDETERMINED | 0 |

---

## 5. Mismatch summary, in plain English

### UI_OFFERS_RULE_DENIES — the app offers it, the database refuses it (6)

These produce a visible error. The person presses a button and gets
`Missing or insufficient permissions.`

- **certificateNumbers.edit** — A Standard user opens a job, presses Generate on
  an item's certificate number, and the save is refused. This is the bug that
  started this phase. Worse than the ticked box failing: the box is not even
  consulted — the button has no permission check at all, so it is offered to
  every user who can open a job, whether or not the box is ticked.
- **settings.companyInfo** — A Standard user with this box ticked can reach the
  company information screen, type changes, and press save. The save is refused.
- **recorderTemplates.edit** — A user with this box ticked can open the recorder
  template builder and edit, but cannot save. Note this box is *not* in the
  Standard user default set, so today only an admin would have it.
- **recorderTemplates.publish** — Same: the publish button works, the write is
  refused.
- **staffPerformance.view** — A user with this box ticked sees the performance
  page, but can only load *their own* activity. Opening another member of staff's
  performance returns nothing and errors. Only an admin can see other people's.
- **staffPerformance.exportLogs** — Same restriction: the export silently covers
  only the user's own logs unless they are an admin.

### RULE_OPEN_UI_ONLY — the tick box is the only lock, and it is advisory (12)

For these, the database accepts the write from **any signed-in user**. Hiding the
button stops an ordinary person using the app normally. It does not stop anyone
who opens the browser console, or any script signed in with the same account.

`jobs.create`, `jobs.edit`, `jobs.delete`, `jobs.generatePdf`,
`documentIndex.manage`, `spreadsheetTemplates.view`, `pdfTemplates.view`,
`users.view`, `roles.view`, `settings.view`, `settings.jobIdConfig`,
`settings.customerIdConfig`.

Most of this is low-risk — a lab technician with an account is trusted to edit
jobs. Two are worth a second look:

- **`jobs.delete`** — deleting a job is accepted by the rules from any signed-in
  user. The only thing preventing it is a hidden button.
- **Customers are readable by the public.** `customers` read is `if true`
  (`firestore.rules:54`) — no sign-in required at all. So is
  `system/companyInfo` (line 66) and `serviceRequests` create (line 483). Those
  three are deliberate (the public service-request form needs them), but the
  customer list being world-readable is worth confirming is intended.

### NO_CALL_SITE — ticking it changes nothing at all (37)

Thirty-seven of the fifty-nine switches in the Roles screen are wired to nothing.
Ticking or clearing them has no effect anywhere in the application. Whole
categories are affected:

- **Service Requests** — all 4.
- **Customers** — all 5. Any signed-in user can create, edit and delete customers
  regardless.
- **Users** — 5 of 6 (`users.create/edit/delete/activate/deactivate`). These are
  *safe* despite being unwired, because the rules independently require admin.
- **Roles** — 3 of 4. Also protected by an admin-only rule.
- **PDF Templates** — 4 of 5. **Spreadsheet Templates** — 4 of 5.
- **Equipment Types** — both.
- Plus `jobs.view/assign/changeStatus/export/import/viewDeleted`,
  `documentIndex.view`, `recorderTemplates.view`, `staffPerformance.viewOwn`.

The practical consequence: the Roles screen presents 59 controls, of which 37 are
ornamental, 12 are advisory-only, 6 promise something the database will refuse,
and **4 do exactly what they say**.

---

## 6. Task 5 — the certificate-number path

### 5a. Every code path that writes to `certificate_number_configs`

| Path | Kind | Reached from |
|---|---|---|
| `certificateNumberGeneratorService.ts:132-141` (`transaction.update` inside `generateCertificateNumber`, line 65) | **allocate** | `JobModal.tsx:3106-3112` Generate button (ungated) and `JobModal.tsx:2681-2699` Generate button (gated on `jobs.edit` via `formDisabled`), both via `handleGenerateCertificateNumberForItem` → `generateCertificateNumberForEquipment` (line 240 → 245) |
| `certificateNumberConfigService.ts` create/update/delete | **configure** | Certificate Number Manager in Settings (`CertificateNumberManagerModal.tsx`) |

Both kinds hit the same document and therefore the same admin-only rule at
`firestore.rules:163-164`.

### 5b. Does the vocabulary distinguish allocation from configuration?

**No.** `roleService.ts` describes `certificateNumbers.edit` as *"Create and edit
certificate number configurations"* — configuration language. There is no
permission anywhere in `ALL_PERMISSIONS` (59) or in the wider `PermissionAction`
union (70) that means *"may allocate a number"*.

**A new permission would have to be introduced.** Suggested:
`certificateNumbers.allocate`, added to `PermissionAction` in
`src/types/index.ts`, to `ALL_PERMISSIONS` in `roleService.ts` under the existing
"Certificate Numbers" category, and — to match the owner's decision that a
Standard user *should* be able to allocate — left in the standard-user default
set while `certificateNumbers.edit` is excluded from it.

### 5c. Candidate rule — PROPOSAL ONLY, not applied

The exact field set an allocation writes, from
`certificateNumberGeneratorService.ts:132-141`:

    currentNumber, currentSequence, currentYear, lastAllocatedAt
    + lastResetAt   — written ONLY when shouldReset is true (yearly reset)

It deliberately never writes `updatedAt` (that field means "a human edited this
equipment type", per ADR-012) — which is what makes the two capabilities
separable by field set at all.

    match /certificate_number_configs/{configId} {
      function callerRole() {
        return get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role;
      }
      function callerHasPermission(action) {
        let role = callerRole();
        return exists(/databases/$(database)/documents/roles/$(role)) &&
          action in get(/databases/$(database)/documents/roles/$(role)).data.permissions;
      }

      allow read: if request.auth != null;

      // Creating or deleting an equipment type stays admin-only.
      allow create, delete: if request.auth != null && callerRole() == 'admin';

      allow update: if request.auth != null && (
        // Configuration edit — admin only, unchanged from today.
        callerRole() == 'admin' ||

        // Allocation only. Exactly the field set written by
        // certificateNumberGeneratorService.ts:132-141 and nothing else.
        (
          callerHasPermission('certificateNumbers.allocate') &&
          request.resource.data.diff(resource.data).affectedKeys().hasOnly(
            ['currentNumber', 'currentSequence', 'currentYear', 'lastAllocatedAt', 'lastResetAt']
          ) &&
          request.resource.data.currentNumber is int &&
          request.resource.data.currentSequence is int &&
          (
            // Same year: the counter must move forward, never backward.
            (request.resource.data.currentYear == resource.data.currentYear &&
             request.resource.data.currentNumber > resource.data.currentNumber)
            ||
            // Yearly reset: the year advances and the counter legitimately
            // returns to 1. Without this branch a monotonic check would
            // block the first allocation of every new year.
            (request.resource.data.currentYear > resource.data.currentYear &&
             request.resource.data.currentNumber == 1)
          )
        )
      );
    }

Three things a reviewer must check before this is ever deployed, all of which are
reasons it is a proposal and not a change:

1. `hasOnly` permits a **subset**, so listing `lastResetAt` is safe on the
   ordinary (non-reset) write where that field is absent. Verify that reading is
   right before relying on it.
2. The monotonic guard assumes `currentYear` is stored as a number. **This was not
   verified** — the field's type was not established in this phase. If it is a
   string the comparison operators behave differently and the reset branch must be
   rewritten. UNDETERMINED; needs checking against a real document.
3. `callerHasPermission` is currently defined *inside* the `records` match block
   (`firestore.rules:291-295`). The version above is a copy scoped to this block.
   Whether to hoist one shared definition to the top of the file is a separate
   decision, and hoisting touches the records rules, which are the only ones
   currently proven to work.

**`firestore.rules` was not edited. Nothing was deployed.**

### 5d. Can that rule be verified on this machine?

**No, it cannot be executed.** Per fact 8, confirmed independently in this
session: no `java` on PATH, `JAVA_HOME` unset, no `emulators` block in
`firebase.json`, `@firebase/rules-unit-testing` not installed. The Firestore
emulator cannot run, so no automated test can evaluate this rule.
`fakeFirestore.ts` does not evaluate `firestore.rules` at all and must never be
cited as coverage of it.

Manual verification procedure, in the style of
`docs/PHASE_5C_RULES_MANUAL_VERIFICATION.md`, to be run against a **staging**
project — never production:

1. Create role `test-allocator` with `certificateNumbers.allocate` ticked and
   `certificateNumbers.edit` **cleared**. Create user A with
   `users/{uid}.role = 'test-allocator'`.
2. Note the config's current `currentNumber` and `currentYear`.
3. As user A, open a job and press Generate on an item. **Expect: succeeds.**
   Confirm `currentNumber` incremented by exactly 1 and `updatedAt` is unchanged.
4. As user A, open Settings ▸ Certificate Number Manager, change the prefix, save.
   **Expect: refused with `permission-denied`.**
5. As user A, in the browser console, attempt a direct write setting
   `prefix` and `currentNumber` together. **Expect: refused** — this is the case
   the `hasOnly` clause exists to stop, and step 4 alone does not prove it.
6. As user A, attempt a direct write lowering `currentNumber`.
   **Expect: refused** by the monotonic clause.
7. Set the config's `currentYear` to the previous year, then allocate as user A.
   **Expect: succeeds**, `currentNumber` becomes 1, `lastResetAt` written. This is
   the branch most likely to be wrong.
8. As an admin, repeat step 4. **Expect: succeeds.**
9. Record each result with a screenshot in the phase's result document.

Steps 5, 6 and 7 are the ones that actually test the new logic. A procedure that
only performs steps 3 and 4 proves nothing beyond what admin-only already did.

**No rule in this document is claimed to be verified. It has been read, not run.**

---

## 7. Evidence of no change

### Test counts

Before (13:33):

     Test Files  81 passed (81)
          Tests  1716 passed (1716)

After (13:37):

     Test Files  81 passed (81)
          Tests  1716 passed (1716)

Identical, as required — this phase changed no source file.

### git status at end of session

     M package-lock.json
     M package.json
     M src/App.tsx
     ?? docs/PHASE_34_PROMPT_PERMISSION_MODEL_AUDIT.md
     ?? docs/PHASE_34_RESULT.md
     ?? docs/PROJECT_INSTRUCTION.md

The three modified files, `PROJECT_INSTRUCTION.md`, and the Phase 34 prompt file
(added by the owner immediately before this phase) all pre-date this phase (see
section 0b) and were not touched by it. **This phase added exactly one file:
`docs/PHASE_34_RESULT.md`.** No rule file, no file under `src/`, no CLAUDE.md, no
deployment.

---

## 8. What the next phase has to decide

Not part of this audit's remit; listed so the findings are not lost.

1. **The certificate-number fix.** Introduce `certificateNumbers.allocate`, apply
   the 5c rule, and gate both Generate render sites on it. Resolve the
   `currentYear` type question (5c note 2) first.
2. **The 37 dead switches.** Either wire them up or remove them from the Roles
   screen. Leaving them is the more dangerous option, because they read as
   protection that does not exist.
3. **The 3 ungrantable permissions** (rows 60-62) — add them to `ALL_PERMISSIONS`
   or remove the checks.
4. **The false comment** at `firestore.rules:155-160`, now disproved.
5. **CLAUDE.md line 145**, still naming a OneDrive path that does not exist.
6. **Confirm the public reads are intended** — `customers` (line 54) is readable
   with no sign-in at all.
