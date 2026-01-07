# Recomendo Advertising Portal - Setup Guide

## Files Created

```
recomendo-tools/
├── advertise.html      # Main landing page with pricing
├── booking.html        # Calendar for selecting ad slots
├── checkout.html       # Cart & ad copy entry form
├── success.html        # Post-payment confirmation
├── worker/
│   ├── checkout-worker.js   # Cloudflare Worker for Stripe + email
│   └── wrangler.toml        # Worker deployment config
└── SETUP.md            # This file
```

## Quick Start

### 1. Deploy Static Pages

Host these files on any static hosting (Cloudflare Pages, Netlify, Vercel, etc.):
- `advertise.html`
- `booking.html`
- `checkout.html`
- `success.html`
- `reco-logo.jpg` (your logo)

### 2. Set Up Stripe

1. **Create Stripe Products** (Dashboard → Products):
   - **Premium Sponsorship**: $500, one-time payment
   - **Unclassified Ad**: $200, one-time payment

2. **Copy Price IDs** and update `worker/checkout-worker.js`:
   ```javascript
   const STRIPE_PRICES = {
     premium: 'price_XXXXXXXXXXXXX',      // Your $500 price ID
     unclassified: 'price_XXXXXXXXXXXXX'  // Your $200 price ID
   };
   ```

3. **Get your Stripe Secret Key** (Dashboard → Developers → API Keys)

### 3. Set Up Resend (for email notifications)

1. Sign up at [resend.com](https://resend.com)
2. Add and verify your domain
3. Get your API key

### 4. Deploy Cloudflare Worker

1. **Install Wrangler** (if not installed):
   ```bash
   npm install -g wrangler
   wrangler login
   ```

2. **Deploy the worker**:
   ```bash
   cd worker
   wrangler deploy
   ```

3. **Set secrets**:
   ```bash
   wrangler secret put STRIPE_SECRET_KEY
   # Enter your sk_live_xxx or sk_test_xxx

   wrangler secret put STRIPE_WEBHOOK_SECRET
   # Enter whsec_xxx (from step 5)

   wrangler secret put RESEND_API_KEY
   # Enter your Resend API key
   ```

4. **Set environment variables** (in Cloudflare Dashboard):
   - `NOTIFICATION_EMAIL`: `editor@cool-tools.org`

5. **Configure Stripe Webhook**:
   - Go to Stripe Dashboard → Developers → Webhooks
   - Add endpoint: `https://your-worker.workers.dev/webhook`
   - Select event: `checkout.session.completed`
   - Copy signing secret to `STRIPE_WEBHOOK_SECRET`

### 5. Update Frontend Config

In `checkout.html`, update the CONFIG:
```javascript
const CONFIG = {
  stripePublicKey: 'pk_live_XXXXXXXXXXXXX',  // Your publishable key
  checkoutApiUrl: 'https://your-worker.workers.dev/create-checkout',
  // ...
};
```

In `worker/checkout-worker.js`, update the URLs:
```javascript
const SITE_CONFIG = {
  successUrl: 'https://yourdomain.com/success.html',
  cancelUrl: 'https://yourdomain.com/checkout.html',
};
```

## How It Works

1. **Advertiser visits** `advertise.html` → sees pricing
2. **Clicks "Book"** → goes to `booking.html`
3. **Selects slots** → calendar shows availability, adds to cart
4. **Clicks "Checkout"** → goes to `checkout.html`
5. **Enters ad copy** (280 chars max) and URL for each ad
6. **Clicks "Pay"** → Worker creates Stripe Checkout session
7. **Completes payment** on Stripe
8. **Stripe webhook fires** → Worker sends email to `editor@cool-tools.org`
9. **Redirected to** `success.html` with confirmation

## Managing Availability

In `booking.html`, edit the `SOLD_OUT` object to mark slots as sold:

```javascript
const SOLD_OUT = {
  '2025-01-26': { premium: true, unclassified: 3 },  // Premium sold, 3 unclassifieds sold
  '2025-02-02': { premium: true, unclassified: 10 }, // Fully sold out
};
```

## Email Notifications

When payment succeeds, `editor@cool-tools.org` receives:
- Customer name, email, company
- Each ad's copy (280 chars) and destination URL
- Issue number and publish date
- Payment amount and Stripe link

The customer also gets a confirmation email.

## Testing

1. Use Stripe test mode (`sk_test_xxx`)
2. Use test card: `4242 4242 4242 4242`
3. Check Stripe Dashboard → Events for webhook delivery
4. Check your email for notifications

## Customization

- **Prices**: Update in `booking.html` CONFIG and Stripe
- **Colors**: Edit CSS variables in each HTML file
- **Hold timer**: Change `holdTimeMinutes` in `checkout.html`
- **Weeks shown**: Change `weeksToShow` in `booking.html`
- **Email template**: Edit `sendNotificationEmail()` in worker
