# Refactoring Guide for Recomendo Ads Portal

This guide identifies improvements to align with clean code principles. Only meaningful changes are included—nothing is suggested just for the sake of change.

---

## High Priority

These should be addressed soon as they affect security or cause real problems.

### 1. Delete the secrets file

**File to delete:** `apis-and-urls.txt`

This file contains live API keys in plain text. Even though they're also stored securely in Cloudflare, having them in a file risks accidental exposure.

**Action:** Delete the file and regenerate any keys that were exposed.

---

### 2. Delete unused files

**Files to delete:**

| File | Reason |
|------|--------|
| `recomendo-ad-portal.html` | This is an old prompt/spec file, not a functional page |
| `sample-ad-preview.ai` | 1.8MB Illustrator source file—not needed in deployed code |

These files add clutter and increase deployment size for no benefit.

---

### 3. Update the Stripe publishable key to live

**File:** `checkout.html` (around line 681)

The checkout is using a test publishable key (`pk_test_...`). This should be the live key (`pk_live_...`) to match your live secret key.

```javascript
// Current (test)
stripePublicKey: 'pk_test_51SN9TJ8bKnIf7MRSbZxy3cRwKLidqjXX87DvZlHDkSyHDFMRaNAclay75vFcZslpZVb7EuZQassNEBoeSfatI8dU00NJrlzitp',

// Should be (live)
stripePublicKey: 'pk_live_51SN9TJ8bKnIf7MRSbZxy3cRwKLidqjXX87DvZlHDkSyHDFMRaNAclay75vFcZslpZVb7EuZQassNEBoeSfatI8dU00NJrlzitp',
```

---

### 4. Consolidate the worker URL into one place

The worker URL `https://recomendo-ads-checkout.markfrauenfelder.workers.dev` is hardcoded in 4+ files. If you ever change domains, you'd need to update all of them.

**Current state:**
- `advertise.html` - line 710
- `booking.html` - line 623
- `checkout.html` - line 684
- `admin.html` - line 748

**Recommendation:** This is acceptable for now since all files need to be deployed together anyway. But if you add more pages, consider a shared config approach.

---

## Medium Priority

These improve maintainability but aren't urgent.

### 5. Consolidate email addresses

Two different emails are used inconsistently:
- `editor@cool-tools.org` (in worker notifications)
- `editor@kk.org` (in some templates)

**Recommendation:** Pick one and use it everywhere, or make sure the `NOTIFICATION_EMAIL` environment variable is used consistently in the worker.

---

### 6. Rename confusing date fields

The codebase uses multiple names for the same concept:

| Current | Used For | Suggestion |
|---------|----------|------------|
| `dateStr` | ISO date like "2026-02-01" | Keep as `dateStr` |
| `issueDate` | Same thing | Rename to `dateStr` for consistency |
| `dateFormatted` | Human readable like "Sunday, February 1" | Keep as `dateFormatted` |

This only matters if you're making other changes to these files—not worth a standalone fix.

---

### 7. The ad copy formatting function is duplicated 3 times

The same `formatAdCopy()` function exists in:
- `checkout.html` (for preview)
- `success.html` (for confirmation)
- `worker/checkout-worker.js` (for emails)

**Current impact:** If you change the formatting rules, you need to update 3 places.

**Recommendation:** Accept this duplication for now. Extracting it into a shared module would require a build step, which adds complexity for minimal benefit in a project this size.

---

### 8. Remove debug endpoint

**File:** `worker/checkout-worker.js` (lines 80-89)

There's a `/admin/edits` endpoint that was added for debugging. It's not used by the admin interface.

```javascript
if (url.pathname === '/admin/edits' && request.method === 'GET') {
  // Debug endpoint to check edited ads
  ...
}
```

**Action:** Can be removed, but low priority—it's protected by auth so it's not a security risk.

---

## Lower Priority

Nice to have, but fine to leave as-is.

### 9. localStorage keys could be more consistent

Current keys:
- `recomendo_cart`
- `recomendo_hold_start`
- `recomendo_pending_order`
- `adminPass`

The `adminPass` key doesn't follow the `recomendo_` prefix pattern. This is cosmetic—only fix if you're already editing the auth code.

---

### 10. Some config values are hardcoded that could be dynamic

These values are hardcoded but rarely change:

| Value | Location | Notes |
|-------|----------|-------|
| `startingIssueNumber: 542` | booking.html | Needs manual update if issue numbers change |
| `weeksToShow: 52` | booking.html | Shows 1 year of dates |
| `holdTimeMinutes: 15` | checkout.html | Cart hold timer |
| `slotsPerIssue: { premium: 1, unclassified: 10 }` | booking.html | Inventory limits |

**Recommendation:** Leave as-is. These change so rarely that the complexity of making them configurable isn't worth it.

---

### 11. CORS is wide open

The worker allows requests from any origin:

```javascript
'Access-Control-Allow-Origin': '*'
```

This is fine for a public booking API. The admin endpoints are protected by password, so the open CORS isn't a security issue in practice.

---

## Files Overview

### Keep as-is (no changes needed)
- `README.md` - Comprehensive and well-written
- `SETUP.md` - Good deployment guide
- `TESTING-GUIDE.md` - Useful reference
- `terms.html` - Legal content, rarely changes
- `config.json` - Clean structure
- `wrangler.toml` - Standard config
- `.gitignore` - Appropriate rules

### Delete
- `apis-and-urls.txt` - Security risk
- `recomendo-ad-portal.html` - Unused spec file
- `sample-ad-preview.ai` - Source file not needed in deployment

### Review but likely keep
- `backup-sync.sh` - Useful for backups, but verify it still works

---

## Summary

| Priority | Items | Effort |
|----------|-------|--------|
| **High** | Delete secrets file, delete unused files, fix Stripe key | 10 minutes |
| **Medium** | Consolidate emails, remove debug endpoint | 30 minutes |
| **Lower** | Naming consistency, config extraction | Hours (skip unless doing other work) |

The codebase is generally well-structured for its size. The main issues are the exposed secrets file and the test Stripe key—fix those and the rest can wait.
