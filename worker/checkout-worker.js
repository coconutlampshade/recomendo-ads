/**
 * Recomendo Advertising Checkout Worker
 *
 * This Cloudflare Worker handles:
 * 1. Creating Stripe Checkout sessions
 * 2. Processing Stripe webhooks for successful payments
 * 3. Sending email notifications with ad copy
 *
 * SETUP INSTRUCTIONS:
 *
 * 1. Create a Cloudflare Worker and paste this code
 *
 * 2. Set these environment variables in Cloudflare:
 *    - STRIPE_SECRET_KEY: Your Stripe secret key (sk_live_xxx or sk_test_xxx)
 *    - STRIPE_WEBHOOK_SECRET: Your Stripe webhook signing secret (whsec_xxx)
 *    - RESEND_API_KEY: Your Resend.com API key for sending emails
 *    - NOTIFICATION_EMAIL: editor@cool-tools.org
 *
 * 3. Create Stripe Products and Prices:
 *    - Premium Sponsorship: $500 (save the price ID)
 *    - Unclassified Ad: $200 (save the price ID)
 *    Update STRIPE_PRICES below with these IDs
 *
 * 4. Set up Stripe Webhook:
 *    - Go to Stripe Dashboard → Developers → Webhooks
 *    - Add endpoint: https://your-worker.workers.dev/webhook
 *    - Select event: checkout.session.completed
 *    - Copy the signing secret to STRIPE_WEBHOOK_SECRET
 *
 * 5. Update your checkout.html CONFIG with:
 *    - checkoutApiUrl: 'https://your-worker.workers.dev/create-checkout'
 */

// Stripe Price IDs (update these with your actual Stripe Price IDs)
const STRIPE_PRICES = {
  premium: 'price_1Si0nA8bKnIf7MRSVevFoTtZ',      // $500 Premium Sponsorship
  unclassified: 'price_1Si0nt8bKnIf7MRSupMjUBNB'  // $200 Unclassified Ad
};

// Your site URLs
const SITE_CONFIG = {
  successUrl: 'https://recomendo-ads.pages.dev/success.html',
  cancelUrl: 'https://recomendo-ads.pages.dev/checkout.html',
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return handleCors();
    }

    // Route requests
    if (url.pathname === '/create-checkout' && request.method === 'POST') {
      return handleCreateCheckout(request, env);
    }

    if (url.pathname === '/webhook' && request.method === 'POST') {
      return handleWebhook(request, env);
    }

    if (url.pathname === '/admin/orders') {
      return handleAdminOrders(request, env);
    }

    if (url.pathname === '/inventory') {
      return handleInventory(request, env);
    }

    if (url.pathname === '/admin/delete' && request.method === 'POST') {
      return handleDeleteAd(request, env);
    }

    return new Response('Not Found', { status: 404 });
  }
};

// CORS headers
function handleCors() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    }
  });
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };
}

/**
 * Create Stripe Checkout Session
 */
async function handleCreateCheckout(request, env) {
  try {
    const body = await request.json();
    const { name, email, company, items } = body;

    // Validate required fields
    if (!name || !email || !items || items.length === 0) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: corsHeaders()
      });
    }

    // Validate all items have ad copy and URL
    for (const item of items) {
      if (!item.adCopy || !item.adUrl) {
        return new Response(JSON.stringify({ error: 'All ads must have copy and URL' }), {
          status: 400,
          headers: corsHeaders()
        });
      }
      if (item.adCopy.length > 280) {
        return new Response(JSON.stringify({ error: 'Ad copy must be 280 characters or less' }), {
          status: 400,
          headers: corsHeaders()
        });
      }
    }

    // Build line items for Stripe
    const lineItems = items.map(item => ({
      price: item.type === 'premium' ? STRIPE_PRICES.premium : STRIPE_PRICES.unclassified,
      quantity: 1,
    }));

    // Store order details in metadata (Stripe limits metadata to 500 chars per value)
    // We'll store a summary and send full details via webhook
    const orderSummary = items.map(item =>
      `${item.type === 'premium' ? 'Premium' : 'Unclassified'} - Issue #${item.issueNumber} (${item.dateFormatted})`
    ).join('; ');

    // Create Stripe Checkout Session
    const session = await createStripeCheckoutSession(env.STRIPE_SECRET_KEY, {
      mode: 'payment',
      customer_email: email,
      line_items: lineItems,
      success_url: `${SITE_CONFIG.successUrl}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: SITE_CONFIG.cancelUrl,
      metadata: {
        customer_name: name,
        customer_email: email,
        company: company || '',
        order_summary: orderSummary.substring(0, 500),
        // Store full order as JSON (will be truncated if too long)
        order_data: JSON.stringify(items).substring(0, 500),
      },
      // Store full order data in payment intent metadata too
      payment_intent_data: {
        metadata: {
          full_order: JSON.stringify({ name, email, company, items }),
        }
      }
    });

    // Also store full order in KV if available (for webhook retrieval)
    if (env.ORDERS_KV) {
      await env.ORDERS_KV.put(`order_${session.id}`, JSON.stringify({ name, email, company, items }), {
        expirationTtl: 86400 // 24 hours
      });
    }

    return new Response(JSON.stringify({ checkoutUrl: session.url }), {
      headers: corsHeaders()
    });

  } catch (error) {
    console.error('Checkout error:', error);
    return new Response(JSON.stringify({ error: 'Failed to create checkout session' }), {
      status: 500,
      headers: corsHeaders()
    });
  }
}

/**
 * Handle Stripe Webhook
 */
async function handleWebhook(request, env) {
  const signature = request.headers.get('stripe-signature');
  const body = await request.text();

  // Verify webhook signature
  let event;
  try {
    event = await verifyStripeWebhook(body, signature, env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature verification failed:', err);
    return new Response('Invalid signature', { status: 400 });
  }

  // Handle checkout.session.completed event
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;

    try {
      // Try to get full order data from KV
      let orderData;
      if (env.ORDERS_KV) {
        const stored = await env.ORDERS_KV.get(`order_${session.id}`);
        if (stored) {
          orderData = JSON.parse(stored);
        }
      }

      // Fallback to metadata if KV not available
      if (!orderData) {
        orderData = {
          name: session.metadata.customer_name,
          email: session.metadata.customer_email,
          company: session.metadata.company,
          items: JSON.parse(session.metadata.order_data || '[]')
        };
      }

      // Send notification email
      await sendNotificationEmail(env, orderData, session);

      // Clean up KV
      if (env.ORDERS_KV) {
        await env.ORDERS_KV.delete(`order_${session.id}`);
      }

    } catch (error) {
      console.error('Error processing webhook:', error);
      // Don't return error - we don't want Stripe to retry
    }
  }

  return new Response('OK', { status: 200 });
}

/**
 * Create Stripe Checkout Session via API
 */
async function createStripeCheckoutSession(secretKey, params) {
  const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${secretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: encodeStripeParams(params)
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Stripe API error: ${error}`);
  }

  return response.json();
}

/**
 * Encode params for Stripe API (handles nested objects)
 */
function encodeStripeParams(params, prefix = '') {
  const parts = [];

  for (const [key, value] of Object.entries(params)) {
    const fullKey = prefix ? `${prefix}[${key}]` : key;

    if (value === null || value === undefined) {
      continue;
    } else if (Array.isArray(value)) {
      value.forEach((item, index) => {
        if (typeof item === 'object') {
          parts.push(encodeStripeParams(item, `${fullKey}[${index}]`));
        } else {
          parts.push(`${fullKey}[${index}]=${encodeURIComponent(item)}`);
        }
      });
    } else if (typeof value === 'object') {
      parts.push(encodeStripeParams(value, fullKey));
    } else {
      parts.push(`${fullKey}=${encodeURIComponent(value)}`);
    }
  }

  return parts.filter(p => p).join('&');
}

/**
 * Verify Stripe webhook signature
 */
async function verifyStripeWebhook(payload, signature, secret) {
  const parts = signature.split(',').reduce((acc, part) => {
    const [key, value] = part.split('=');
    acc[key] = value;
    return acc;
  }, {});

  const timestamp = parts['t'];
  const expectedSig = parts['v1'];

  // Check timestamp is within tolerance (5 minutes)
  const currentTime = Math.floor(Date.now() / 1000);
  if (Math.abs(currentTime - parseInt(timestamp)) > 300) {
    throw new Error('Timestamp outside tolerance');
  }

  // Compute expected signature
  const signedPayload = `${timestamp}.${payload}`;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signatureBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(signedPayload));
  const computedSig = Array.from(new Uint8Array(signatureBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  if (computedSig !== expectedSig) {
    throw new Error('Signature mismatch');
  }

  return JSON.parse(payload);
}

/**
 * Send notification email via Resend
 */
async function sendNotificationEmail(env, orderData, session) {
  const { name, email, company, items } = orderData;

  // Format ad details
  const adDetails = items.map(item => `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${item.type === 'premium' ? '🌟 PREMIUM SPONSORSHIP' : '📝 UNCLASSIFIED AD'}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📅 Issue: #${item.issueNumber} — ${item.dateFormatted}
💰 Price: $${item.price}

📝 AD COPY:
${item.adCopy}

🔗 URL: ${item.adUrl}
`).join('\n');

  const total = items.reduce((sum, item) => sum + item.price, 0);

  const emailBody = `
NEW ADVERTISING ORDER — RECOMENDO
==================================

💳 Payment Received: $${total}
📧 Stripe Session: ${session.id}

CUSTOMER DETAILS
----------------
Name: ${name}
Email: ${email}
Company: ${company || 'Not provided'}

AD BOOKINGS
-----------
${adDetails}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Total Paid: $${total}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

View in Stripe Dashboard:
https://dashboard.stripe.com/payments/${session.payment_intent}
`;

  // Send via Resend
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Recomendo Ads <ads@recommendo.org>',
      to: env.NOTIFICATION_EMAIL || 'editor@cool-tools.org',
      reply_to: email,
      subject: `New Ad Order: ${items.length} slot${items.length > 1 ? 's' : ''} — $${total}`,
      text: emailBody,
    })
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('Email send failed:', error);
    throw new Error(`Failed to send email: ${error}`);
  }

  // Build detailed receipt for customer
  const customerAdDetails = items.map(item => `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${item.type === 'premium' ? 'PREMIUM SPONSORSHIP' : 'UNCLASSIFIED AD'}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Issue: #${item.issueNumber} — ${item.dateFormatted}
Price: $${item.price}

AD COPY:
${item.adCopy}

URL: ${item.adUrl}
`).join('\n');

  // Send confirmation to customer
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Recomendo <ads@recommendo.org>',
      to: email,
      reply_to: env.NOTIFICATION_EMAIL || 'editor@kk.org',
      subject: `Your Recomendo Ad Booking Confirmation — $${total}`,
      text: `
RECOMENDO ADVERTISING
=====================
Order Receipt

Hi ${name},

Thanks for booking advertising with Recomendo! Your payment has been received.

ORDER DETAILS
-------------
${company ? `Company: ${company}\n` : ''}Email: ${email}
Date: ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}

YOUR AD BOOKINGS
----------------
${customerAdDetails}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL PAID: $${total}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

WHAT HAPPENS NEXT
-----------------
• We'll review your ad copy to ensure it meets our guidelines.
• Your ad will be published on the scheduled date.
• You'll receive performance stats after your ad runs.

If you have any questions, just reply to this email.

Best,
The Recomendo Team
`
    })
  });
}

/**
 * Admin endpoint to view all orders
 */
async function handleAdminOrders(request, env) {
  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return handleCors();
  }

  // Check authorization
  const authHeader = request.headers.get('Authorization');
  const password = authHeader?.replace('Bearer ', '');

  if (!password || password !== env.ADMIN_PASSWORD) {
    return new Response('Unauthorized', {
      status: 401,
      headers: corsHeaders()
    });
  }

  try {
    // Fetch recent checkout sessions from Stripe
    const response = await fetch(
      'https://api.stripe.com/v1/checkout/sessions?limit=100&status=complete',
      {
        headers: {
          'Authorization': `Bearer ${env.STRIPE_SECRET_KEY}`,
        }
      }
    );

    if (!response.ok) {
      throw new Error('Failed to fetch from Stripe');
    }

    const data = await response.json();
    const orders = [];
    let totalRevenue = 0;

    // Get cancelled ads list
    const cancelledAds = await getCancelledAds(env);

    for (const session of data.data) {
      if (session.payment_status !== 'paid') continue;

      const meta = session.metadata || {};
      totalRevenue += (session.amount_total || 0) / 100;

      // Parse order data from metadata
      let items = [];
      try {
        items = JSON.parse(meta.order_data || '[]');
      } catch (e) {
        // If we can't parse items, create a basic entry from summary
        if (meta.order_summary) {
          items = [{
            type: 'unknown',
            issueNumber: '?',
            dateFormatted: meta.order_summary,
            adCopy: 'See email for details',
            adUrl: '',
            price: (session.amount_total || 0) / 100
          }];
        }
      }

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        // Create unique ID for this ad
        const adId = `${session.id}_${i}_${item.dateStr || item.issueNumber}`;

        // Skip cancelled ads
        if (cancelledAds.includes(adId)) continue;

        orders.push({
          adId,
          sessionId: session.id,
          customerName: meta.customer_name || 'Unknown',
          customerEmail: meta.customer_email || session.customer_email || '',
          company: meta.company || '',
          type: item.type || 'unclassified',
          issueNumber: item.issueNumber || '?',
          dateFormatted: item.dateFormatted || '',
          issueDate: item.dateStr || item.date || '',
          adCopy: item.adCopy || '',
          adUrl: item.adUrl || '',
          price: item.price || 0,
          paidAt: new Date(session.created * 1000).toISOString()
        });
      }
    }

    // Filter to only future/upcoming ads (or all if date parsing fails)
    const now = new Date();
    const upcomingOrders = orders.filter(o => {
      if (!o.issueDate) return true;
      try {
        return new Date(o.issueDate) >= now;
      } catch {
        return true;
      }
    });

    return new Response(JSON.stringify({
      orders: upcomingOrders,
      stats: {
        totalOrders: data.data.length,
        totalRevenue: totalRevenue,
        upcomingAds: upcomingOrders.length
      }
    }), {
      headers: corsHeaders()
    });

  } catch (error) {
    console.error('Admin orders error:', error);
    return new Response(JSON.stringify({ error: 'Failed to fetch orders' }), {
      status: 500,
      headers: corsHeaders()
    });
  }
}

/**
 * Public endpoint to get sold inventory per issue date
 * Returns: { "2025-01-05": { premium: true, unclassified: 3 }, ... }
 */
async function handleInventory(request, env) {
  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return handleCors();
  }

  try {
    // Fetch recent checkout sessions from Stripe
    const response = await fetch(
      'https://api.stripe.com/v1/checkout/sessions?limit=100&status=complete',
      {
        headers: {
          'Authorization': `Bearer ${env.STRIPE_SECRET_KEY}`,
        }
      }
    );

    if (!response.ok) {
      throw new Error('Failed to fetch from Stripe');
    }

    const data = await response.json();
    const inventory = {};

    // Get cancelled ads list
    const cancelledAds = await getCancelledAds(env);

    for (const session of data.data) {
      if (session.payment_status !== 'paid') continue;

      const meta = session.metadata || {};

      // Parse order data from metadata
      let items = [];
      try {
        items = JSON.parse(meta.order_data || '[]');
      } catch (e) {
        continue;
      }

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        // Create unique ID for this ad (same as in handleAdminOrders)
        const adId = `${session.id}_${i}_${item.dateStr || item.issueNumber}`;

        // Skip cancelled ads
        if (cancelledAds.includes(adId)) continue;

        // Check for dateStr (from cart) or date field
        const dateStr = item.dateStr || item.date;
        if (!dateStr) continue;
        if (!inventory[dateStr]) {
          inventory[dateStr] = { premium: false, unclassified: 0 };
        }

        if (item.type === 'premium') {
          inventory[dateStr].premium = true;
        } else if (item.type === 'unclassified') {
          inventory[dateStr].unclassified++;
        }
      }
    }

    return new Response(JSON.stringify(inventory), {
      headers: corsHeaders()
    });

  } catch (error) {
    console.error('Inventory error:', error);
    return new Response(JSON.stringify({}), {
      headers: corsHeaders()
    });
  }
}

/**
 * Delete/cancel an ad from the schedule
 */
async function handleDeleteAd(request, env) {
  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return handleCors();
  }

  // Check authorization
  const authHeader = request.headers.get('Authorization');
  const password = authHeader?.replace('Bearer ', '');

  if (!password || password !== env.ADMIN_PASSWORD) {
    return new Response('Unauthorized', {
      status: 401,
      headers: corsHeaders()
    });
  }

  try {
    const { adId } = await request.json();

    if (!adId) {
      return new Response(JSON.stringify({ error: 'Missing adId' }), {
        status: 400,
        headers: corsHeaders()
      });
    }

    // Store cancelled ad ID in KV
    if (env.ORDERS_KV) {
      // Get existing cancelled list
      const cancelledJson = await env.ORDERS_KV.get('cancelled_ads');
      const cancelled = cancelledJson ? JSON.parse(cancelledJson) : [];

      // Add new ID if not already there
      if (!cancelled.includes(adId)) {
        cancelled.push(adId);
        await env.ORDERS_KV.put('cancelled_ads', JSON.stringify(cancelled));
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: corsHeaders()
    });

  } catch (error) {
    console.error('Delete error:', error);
    return new Response(JSON.stringify({ error: 'Failed to delete ad' }), {
      status: 500,
      headers: corsHeaders()
    });
  }
}

/**
 * Get list of cancelled ad IDs
 */
async function getCancelledAds(env) {
  if (!env.ORDERS_KV) return [];
  const cancelledJson = await env.ORDERS_KV.get('cancelled_ads');
  return cancelledJson ? JSON.parse(cancelledJson) : [];
}
