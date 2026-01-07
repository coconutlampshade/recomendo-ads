# Recomendo Ads Portal

A self-serve advertising booking system for the Recomendo newsletter. Advertisers can browse available dates, book ad slots, and pay via Stripe. Admins can manage orders, add legacy bookings, edit ad copy, and send performance reports.

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Pages](#pages)
- [Admin Dashboard](#admin-dashboard)
- [Adding Legacy Orders](#adding-legacy-orders)
- [Ad Copy Formatting](#ad-copy-formatting)
- [Configuration](#configuration)
- [API Endpoints](#api-endpoints)
- [Deployment](#deployment)
- [Pricing Reference](#pricing-reference)

---

## Overview

The system consists of:

1. **Public booking site** - Where advertisers browse dates and purchase ad slots
2. **Stripe checkout** - Handles payments securely
3. **Cloudflare Worker** - Backend API for orders, inventory, and admin functions
4. **Cloudflare KV** - Stores legacy orders, edits, cancellations, and config
5. **Admin dashboard** - Manage all orders, edit ads, send reports

---

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Public Pages   │────▶│ Cloudflare Worker│────▶│   Stripe API    │
│  (CF Pages)     │     │   (Backend)      │     │   (Payments)    │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                               │
                               ▼
                        ┌──────────────────┐
                        │  Cloudflare KV   │
                        │  (Data Store)    │
                        └──────────────────┘
```

**Data Flow:**
- New orders go through Stripe, stored in Stripe's system
- Legacy orders (Typeform, Paved, direct) stored in KV as `legacy_orders`
- Edits stored in KV as `edited_ads`
- Cancellations stored in KV as `cancelled_ads`
- Admin dashboard merges Stripe + legacy orders for unified view

---

## Pages

| Page | URL | Purpose |
|------|-----|---------|
| Landing | `/advertise` | Marketing page with stats and testimonials |
| Booking | `/booking` | Browse available dates, add to cart |
| Checkout | `/checkout` | Enter ad copy, pay via Stripe |
| Success | `/success` | Order confirmation |
| Admin | `/admin` | Manage all orders (password protected) |

---

## Admin Dashboard

### Login
- Password is saved to localStorage after first login
- Auto-login on subsequent visits
- Click "Logout" to clear saved password

### Features

**View Orders**
- **Upcoming** tab: Ads scheduled for future issues
- **Past** tab: Ads that have already run
- **Needs Report** tab: Past ads awaiting performance reports

**For Each Ad:**
- **Copy** - Copy formatted ad text to clipboard
- **Edit** - Modify ad copy, URL, or add notes
- **Email** - Open email to advertiser
- **Delete** - Cancel/remove the ad (refund handled separately)

**Send Reports**
- Click on past ads to send performance reports
- Enter clicks and open rate
- Advertiser receives formatted email with stats

**Settings**
- Update subscriber count (updates landing page headline + stats)
- Update open rate
- Manage testimonials

---

## Adding Legacy Orders

For ads paid outside of Stripe (Typeform, Paved, direct invoices), use the API:

### Via curl

```bash
curl -X POST "https://recomendo-ads-checkout.markfrauenfelder.workers.dev/admin/add-legacy" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ADMIN_PASSWORD" \
  -d '{
    "customerName": "John Smith",
    "customerEmail": "john@example.com",
    "company": "Acme Inc",
    "type": "unclassified",
    "issueNumber": 545,
    "dateStr": "2026-02-01",
    "dateFormatted": "Sunday, February 1, 2026",
    "adCopy": "**Your headline here** and body text with [[linked text]]",
    "adUrl": "https://example.com",
    "price": 200,
    "paidAt": "2026-01-04T00:00:00Z",
    "paymentMethod": "Typeform"
  }'
```

### Required Fields

| Field | Description |
|-------|-------------|
| `customerEmail` | Advertiser's email |
| `type` | `"premium"` or `"unclassified"` |
| `issueNumber` | Newsletter issue number (see below) |
| `adCopy` | Formatted ad text |
| `adUrl` | Destination URL |

### Optional Fields

| Field | Default |
|-------|---------|
| `customerName` | "Unknown" |
| `company` | "" |
| `dateStr` | "" |
| `dateFormatted` | "" |
| `price` | $500 for premium, $200 for unclassified |
| `paidAt` | Current timestamp |
| `paymentMethod` | "legacy" |

### Calculating Issue Numbers

Issue numbers increment by 1 each week (Sunday). Reference point:

- **Issue #542** = Sunday, January 11, 2026

To calculate any issue number:
```
Issue # = 542 + (weeks since Jan 11, 2026)
```

Examples:
- Jan 18, 2026 = #543
- Jan 25, 2026 = #544
- Feb 1, 2026 = #545
- Feb 8, 2026 = #546

---

## Ad Copy Formatting

### Syntax

| Format | Syntax | Renders As |
|--------|--------|------------|
| Bold | `**text**` | **text** |
| Link | `[[text]]` | Clickable link to adUrl |

### Example

**Input:**
```
**Liberate yourself from self-doubt** with an innovative 10-minute method. [[Learn more]]
```

**Renders as:**
> **Liberate yourself from self-doubt** with an innovative 10-minute method. [Learn more](https://example.com)

### Converting from Typeform Format

Typeform uses single asterisks and brackets. Convert:
- `*text*` → `**text**`
- `[text]` → `[[text]]`

---

## Configuration

### Update via Admin Dashboard

1. Go to Admin → Settings (gear icon)
2. Update subscriber count, open rate, or testimonials
3. Click Save

### Update via API

```bash
curl -X PUT "https://recomendo-ads-checkout.markfrauenfelder.workers.dev/admin/config" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ADMIN_PASSWORD" \
  -d '{
    "stats": {
      "subscribers": "125,000+",
      "openRate": "46%"
    },
    "testimonials": [...]
  }'
```

The landing page headline ("Reach X Curious Minds") and stats bar automatically pull from this config.

---

## API Endpoints

### Public Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/config` | GET | Get site config (stats, testimonials) |
| `/inventory` | GET | Get sold slots by issue number |
| `/create-checkout` | POST | Create Stripe checkout session |
| `/webhook` | POST | Stripe webhook handler |

### Admin Endpoints (require `Authorization: Bearer PASSWORD`)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/admin/orders` | GET | Get all orders (Stripe + legacy) |
| `/admin/add-legacy` | POST | Add a legacy/manual order |
| `/admin/legacy-orders` | GET | Get only legacy orders |
| `/admin/edit` | POST | Edit an ad's copy/URL/notes |
| `/admin/delete` | POST | Cancel an ad |
| `/admin/send-report` | POST | Send performance report email |
| `/admin/config` | GET/PUT | Get or update site config |
| `/admin/backup` | GET | Export all data as JSON |

---

## Deployment

### Deploy Worker (Backend)

```bash
cd reco-ad-portal/worker
npx wrangler deploy
```

### Deploy Pages (Frontend)

```bash
cd reco-ad-portal
npx wrangler pages deploy . --project-name=recomendo-ads
```

### Environment Variables (Worker)

Set these in Cloudflare Dashboard → Workers → Settings → Variables:

| Variable | Description |
|----------|-------------|
| `STRIPE_SECRET_KEY` | Stripe secret key (sk_live_xxx) |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret |
| `RESEND_API_KEY` | Resend.com API key for emails |
| `NOTIFICATION_EMAIL` | Admin email for order notifications |
| `ADMIN_PASSWORD` | Password for admin dashboard |

### KV Namespace

Bind a KV namespace called `ORDERS_KV` to the worker for data persistence.

---

## Pricing Reference

### Standard Pricing (via Stripe checkout)

| Type | Price | Description |
|------|-------|-------------|
| Premium Sponsorship | $500 | Top placement, 1 per issue |
| Unclassified Ad | $200 | Lower section, up to 10 per issue |

### Legacy/Partner Pricing

| Source | Type | Price |
|--------|------|-------|
| Paved | Unclassified | $140 |
| Typeform | Unclassified | $200 |
| Direct/Custom | Varies | As negotiated |

---

## Common Tasks

### Add a Paved Ad

```bash
curl -X POST "https://recomendo-ads-checkout.markfrauenfelder.workers.dev/admin/add-legacy" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_PASSWORD" \
  -d '{
    "customerName": "Paved Advertiser",
    "customerEmail": "adops@paved.com",
    "company": "Paved",
    "type": "unclassified",
    "issueNumber": 547,
    "dateStr": "2026-02-15",
    "dateFormatted": "Sunday, February 15, 2026",
    "adCopy": "**Headline here** Body text goes here. [[Learn more]]",
    "adUrl": "https://paved-redirect-url.com",
    "price": 140,
    "paymentMethod": "Paved"
  }'
```

### Reserve Slots (Placeholder Copy)

For advance bookings where ad copy will be provided later:

```bash
curl -X POST ".../admin/add-legacy" \
  -d '{
    ...
    "adCopy": "[Ad copy to be provided]",
    "adUrl": "https://example.com",
    ...
  }'
```

Then edit via admin dashboard when copy arrives.

### Bulk Delete Test Orders

```bash
# Get order IDs first
curl -s ".../admin/orders" -H "Authorization: Bearer PASSWORD" | jq '.orders[].adId'

# Delete each one
curl -X POST ".../admin/delete" \
  -H "Authorization: Bearer PASSWORD" \
  -d '{"adId": "ORDER_ID_HERE"}'
```

---

## Troubleshooting

### Stats show wrong numbers
- Stats are calculated from actual non-cancelled orders
- Deleted Stripe test orders may still be in Stripe but filtered out
- Check `/admin/orders` to see what's actually being counted

### Inventory shows wrong availability
- Inventory = total slots minus (Stripe orders + legacy orders - cancelled)
- Legacy orders are included in inventory calculation
- Use admin delete to cancel unwanted bookings

### Ad copy not formatting correctly
- Ensure using `**double asterisks**` for bold
- Ensure using `[[double brackets]]` for links
- Single `*asterisks*` or `[brackets]` won't render

### Password not saving
- Check browser allows localStorage
- Use the Logout button (not just closing tab) to clear password
- Re-login to re-save

---

## Support

For issues with this codebase, contact the development team or check the git history for recent changes.
