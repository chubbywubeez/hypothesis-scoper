# Stripe Setup Guide for Advanced Mode Paywall

This guide will help you set up Stripe for the Advanced Mode subscription paywall.

## Step 1: Get Your Stripe Keys

1. Go to [Stripe Dashboard](https://dashboard.stripe.com)
2. Navigate to **Developers** → **API keys**
3. Copy your **Secret key** (starts with `sk_test_...` for test mode or `sk_live_...` for production)
4. Keep this page open - you'll need it for webhooks too

## Step 2: Get Your Product ID

From your Stripe dashboard:
1. Go to **Products** → Find your "Advanced Mode Subscription" product
2. Copy the **Product ID** (starts with `prod_...`)
   - This is shown in the product details page
   - You can also see it in the URL: `dashboard.stripe.com/products/prod_...`

**Alternative:** If you only have a Price ID (starts with `price_...`), that works too!

## Step 3: Set Up Webhook

### 3a. Determine Your Webhook URL

Your webhook URL depends on where your app is deployed:

**If deployed on Railway:**
- Go to your Railway project dashboard
- Click on your service
- Go to **Settings** → **Networking**
- Copy your **Public Domain** (e.g., `your-app.railway.app`)
- Your webhook URL will be: `https://your-app.railway.app/api/stripe/webhook`

**If using ngrok for local testing:**
- Your ngrok URL (e.g., `https://xxxx-xx-xx-xx-xx.ngrok-free.app`)
- Your webhook URL will be: `https://xxxx-xx-xx-xx-xx.ngrok-free.app/api/stripe/webhook`

**If you have a custom domain:**
- Your webhook URL will be: `https://yourdomain.com/api/stripe/webhook`

### 3b. Create Webhook Endpoint in Stripe

1. In Stripe Dashboard, go to **Developers** → **Webhooks**
2. Click **"Add endpoint"** (or **"Add an event destination"**)
3. **Endpoint URL:** Enter your webhook URL from step 3a
4. **Description:** "Advanced Mode Subscription Updates" (optional)
5. **Events to send:** Click **"Select events"** and choose:
   - ✅ `checkout.session.completed` - When user completes payment
   - ✅ `customer.subscription.updated` - When subscription status changes
   - ✅ `customer.subscription.deleted` - When subscription is canceled
6. Click **"Add endpoint"**
7. **Copy the Signing secret** (starts with `whsec_...`) - you'll need this!

## Step 4: Add Environment Variables

Add these to your Railway environment variables (or `.env` for local):

```env
# Stripe Configuration
STRIPE_SECRET_KEY=sk_test_... (or sk_live_... for production)
STRIPE_PRODUCT_ID=prod_... (your product ID)
STRIPE_WEBHOOK_SECRET=whsec_... (from webhook setup)
BASE_URL=https://your-app.railway.app (your app's public URL)
```

**Important Notes:**
- Use `STRIPE_PRODUCT_ID` if you have a product ID (recommended)
- OR use `STRIPE_PRICE_ID` if you only have a price ID
- `BASE_URL` should be your public Railway URL (or ngrok URL for testing)
- Don't include a trailing slash in `BASE_URL`

## Step 5: Test the Integration

1. **Test Checkout:**
   - Log in as a customer (not internal user)
   - Click "Advanced Mode 🔒"
   - Should see payment modal
   - Click "Upgrade Now"
   - Should redirect to Stripe Checkout

2. **Test Webhook (after payment):**
   - Complete a test payment in Stripe Checkout
   - Check Stripe Dashboard → **Developers** → **Webhooks** → Your endpoint
   - Should see successful webhook calls
   - User's subscription status should update automatically

3. **Verify Subscription:**
   - After payment, try clicking "Advanced Mode" again
   - Should open Advanced Mode (no paywall)
   - Check "My Scopes" or user profile to verify subscription status

## Troubleshooting

**"Stripe not configured" error:**
- Check that `STRIPE_SECRET_KEY` is set correctly
- Verify the key starts with `sk_test_` or `sk_live_`

**"Stripe product/price ID not configured" error:**
- Make sure either `STRIPE_PRODUCT_ID` or `STRIPE_PRICE_ID` is set
- Verify the ID starts with `prod_` or `price_`

**Webhook not receiving events:**
- Check that `STRIPE_WEBHOOK_SECRET` is set correctly
- Verify webhook URL is accessible (try visiting it in browser - should return an error, but confirms it's reachable)
- Check Stripe Dashboard → Webhooks → Your endpoint → "Recent events" for delivery status
- Make sure you selected the correct events in webhook configuration

**Subscription not updating after payment:**
- Check Railway logs for webhook errors
- Verify webhook secret matches in both Stripe and your environment variables
- Check that the webhook endpoint is receiving events in Stripe dashboard

## Production Checklist

Before going live:
- [ ] Switch to **Live mode** in Stripe Dashboard
- [ ] Update `STRIPE_SECRET_KEY` to live key (starts with `sk_live_...`)
- [ ] Update `BASE_URL` to your production domain
- [ ] Create production webhook endpoint with live mode enabled
- [ ] Test a real payment in test mode first
- [ ] Verify webhook events are being received
