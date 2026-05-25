# CLAUDE CRITICAL RULES — READ THIS BEFORE DOING ANYTHING

> This file exists because Claude made catastrophic mistakes on this project — multiple times.
> These are not suggestions. These are hard rules. Violating them risks destroying the user's work.

---

## RULE 1: NEVER GUESS. NEVER CONFIRM WHAT YOU HAVE NOT VERIFIED.

**What happened:** Claude said "the worktrees contain no unique work" without running a single diff.
That was a lie based on a guess. It was catastrophically wrong. 367 files were almost permanently lost.

**The rule:**
- If you have not run `git diff`, you do not know what is different.
- If you have not read the file, you do not know what is in it.
- If you have not checked the branch, you do not know which branch is ahead.
- **NEVER say "X has everything" or "Y is safe to delete" without proof.**
- If unsure → say "I don't know yet, let me check first." Then check. Then report what you found.

---

## RULE 2: BEFORE DELETING ANYTHING — DIFF IT FIRST.

**What happened:** Claude recommended deleting two worktrees without checking their content.
The worktree was the real, full, working codebase. Master was the old incomplete version.

**The rule:**
Before recommending or executing ANY deletion (worktree, branch, file, folder):
1. Run `git diff <branch1>...<branch2> --stat` and READ the output.
2. Run `git log --oneline <branch>` and READ the output.
3. Only after confirming the content is truly redundant, ask the user for explicit permission.
4. Show the user the diff summary BEFORE asking them to confirm deletion.

```bash
# Always run this before deleting a branch or worktree:
git diff master...<branch-to-delete> --stat
git log --oneline <branch-to-delete> | head -20
```

---

## RULE 3: ALWAYS CHECK WHERE THE DEV SERVER IS RUNNING FROM.

**What happened:** Claude made edits to `master` for an entire session while the dev server was
running from a worktree. The user saw zero changes. Claude confirmed "your app should show changes"
— another guess, another lie.

**The rule:**
At the START of every session, before making any file edits:
```bash
# 1. Find the dev server process
netstat -ano | grep ":5173"

# 2. Find which directory it is running from
(Get-CimInstance Win32_Process -Filter "ProcessId=<PID>").CommandLine

# 3. List all worktrees
git worktree list
```
If the dev server is NOT running from the main project directory → STOP and tell the user before editing anything.

---

## RULE 4: ALWAYS CONFIRM WHICH BRANCH YOU ARE EDITING BEFORE STARTING WORK.

**The rule:**
```bash
git branch          # which branch is active
git worktree list   # are there other worktrees?
git status          # any uncommitted changes?
```
Do this at the start of every session. Report the result to the user if anything looks unexpected.

---

## RULE 5: DO NOT SAY "MASTER HAS EVERYTHING" WITHOUT A DIFF.

This specific mistake happened and nearly destroyed the project.

The correct question is: **"Is master ahead of, behind, or diverged from the other branch?"**
```bash
git merge-base --is-ancestor master <other-branch> && echo "master is behind" || echo "diverged"
git diff master...<other-branch> --stat
```
Only after reading this output can you say anything about what master contains.

---

## RULE 6: DO NOT CLEAN UP WORKTREES UNLESS THE USER EXPLICITLY REQUESTS IT AND YOU HAVE VERIFIED THE DIFF.

Worktrees created by Claude sessions may contain uncommitted work that is NOT in any committed branch.
Deleting a worktree deletes its uncommitted working directory changes — permanently and immediately.

**The rule:**
- Never suggest deleting a worktree proactively.
- If the user asks to delete worktrees, first run the diff, show them the result, and warn them about uncommitted changes.
- Check for uncommitted changes inside the worktree:
```bash
git -C <worktree-path> status
git -C <worktree-path> diff --stat
```

---

## RULE 7: IF YOU ARE NOT SURE, SAY SO. DO NOT FILL THE GAP WITH A GUESS.

**The pattern that keeps happening:**
1. Claude does not know something.
2. Claude guesses.
3. Claude states the guess as a fact.
4. The guess is wrong.
5. The user's project is damaged.

**The correct behavior:**
- "I'm not sure — let me check." → check → report the actual result.
- "I don't have enough information to confirm that safely." → ask the user.
- NEVER: "This should be fine." / "Master has everything." / "It's safe to delete."
  unless you have run the commands that prove it.

---

## RULE 8: KEEP TRACK OF WHERE YOUR EDITS ARE GOING.

Every time you edit a file, confirm:
- Which branch is checked out? (`git branch`)
- Which worktree are you in? (`git worktree list`)
- Is the dev server watching this directory? (check the process command line)

If the edit goes to a different location than where the dev server is serving → tell the user immediately.

---

## QUICK PRE-WORK CHECKLIST (run at start of every session)

```bash
git branch
git worktree list
git status
netstat -ano | grep ":5173"
(Get-CimInstance Win32_Process -Filter "ProcessId=<PID>").CommandLine
```

Expected healthy state:
- Only ONE worktree: the main project directory on `master`
- Dev server running from: `C:\Users\seela\OneDrive\Desktop\LIMS-New`
- No unexpected branches like `claude/*`

---

## SUMMARY OF MISTAKES THAT ALREADY HAPPENED ON THIS PROJECT

| # | Mistake | Consequence |
|---|---------|-------------|
| 1 | Edited `master` while dev server ran from worktree | User saw no changes for entire session |
| 2 | Said "master has everything" without diffing | User agreed to delete worktrees |
| 3 | Deleted worktrees without checking diff or uncommitted changes | 367 files nearly permanently lost |
| 4 | Confirmed "changes are visible" without checking which directory the server serves | Multiple wasted sessions |

**Do not let this list grow.**
