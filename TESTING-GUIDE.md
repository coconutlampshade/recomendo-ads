# Recomendo Ads System — Testing Guide

Hey team! We've built a new self-service advertising booking system for Recomendo. Please help us test it and catch any bugs before we go live.

---

## The Pages

### 1. Advertise Landing Page
**URL:** https://recomendo-ads.pages.dev/advertise

This is the public-facing page that explains our ad offerings to potential advertisers. It includes:
- Pricing info ($500 Premium, $200 Unclassified)
- Testimonials from past advertisers
- Sample of what ads look like in the newsletter
- Newsletter stats and editor credentials

### 2. Booking Calendar
**URL:** https://recomendo-ads.pages.dev/booking.html

Where advertisers select which issue(s) they want to book. Shows:
- Available dates for the next 16 weeks
- Which slots are taken vs. available
- Cart functionality for booking multiple slots

### 3. Checkout Page
**URL:** https://recomendo-ads.pages.dev/checkout.html

Where advertisers enter their info and ad copy before paying:
- Contact details (name, email, company)
- Ad copy with live preview (supports **bold** and [[links]])
- Character counter (280 max)
- Stripe payment integration

### 4. Success Page
**URL:** https://recomendo-ads.pages.dev/success.html

Confirmation page shown after successful payment with receipt details.

### 5. Admin Dashboard
**URL:** https://recomendo-ads.pages.dev/admin.html

**Password:** `recomendo2024`

Where we manage incoming ad orders:
- View ads by issue (grouped by publish date)
- Copy individual ads or all ads for an issue
- Edit ad copy if needed
- Add internal notes
- Email customers directly
- Delete/cancel ads
- Toggle between Upcoming and Past ads

---

## How to Test

### Stripe Test Mode
The Stripe account is in **test mode**, so no real charges will occur.

**Test Credit Card:**
```
Card number: 4242 4242 4242 4242
Expiry: Any future date (e.g., 12/28)
CVC: Any 3 digits (e.g., 123)
ZIP: Any 5 digits (e.g., 12345)
```

### Suggested Test Scenarios

#### Basic Flow
1. Go to the booking page
2. Select a Premium slot for one issue
3. Add an Unclassified slot for a different issue
4. Proceed to checkout
5. Fill in test details and ad copy
6. Try the **bold** and [[link]] formatting in the preview
7. Complete payment with the test card
8. Verify you land on the success page with correct details

#### Admin Testing
1. Log into the admin dashboard
2. Find your test order
3. Try "Copy" on an individual ad — paste into a text editor
4. Try "Copy All" for an issue — verify formatting
5. Click "Edit" and modify the ad copy, then save
6. Add a note to an ad
7. Try the "Email" button
8. Switch between "Upcoming" and "Past" views
9. Try deleting a test ad

#### Edge Cases to Try
- [ ] Book the same slot twice (should show as unavailable)
- [ ] Try exceeding 280 characters in ad copy
- [ ] Leave required fields blank and try to proceed
- [ ] Test on mobile (especially the sticky "Book Your Ad" button)
- [ ] Try the "See a recent issue" link
- [ ] Refresh the page mid-checkout (does cart persist?)
- [ ] Book multiple slots (3+) in one order

#### Things to Look For
- Typos or unclear wording
- Broken links
- Confusing user experience
- Missing information
- Mobile display issues
- Anything that feels "off"

---

## Reporting Bugs & Suggestions

Please send any bugs or suggestions to Mark with:
1. What you were trying to do
2. What happened instead
3. Screenshot if possible
4. Device/browser you were using

---

## Quick Links

| Page | URL |
|------|-----|
| Advertise | https://recomendo-ads.pages.dev/advertise |
| Book | https://recomendo-ads.pages.dev/booking.html |
| Checkout | https://recomendo-ads.pages.dev/checkout.html |
| Admin | https://recomendo-ads.pages.dev/admin.html |

Thanks for helping test!
