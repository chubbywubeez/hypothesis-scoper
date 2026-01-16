# Stripe Webhook Debugging Guide

If subscriptions aren't updating after payment, the webhook likely isn't reaching your server. Follow these steps:

## Step 1: Verify Webhook Endpoint is Accessible

1. **Get your Railway public URL:**
   - Go to Railway Dashboard → Your Service → Settings → Networking
   - Copy your **Public Domain** (e.g., `your-app.railway.app`)

2. **Test the webhook endpoint:**
   - Open your browser and visit: `https://your-app.railway.app/api/stripe/webhook`
   - You should see a JSON response saying the endpoint is accessible
   - If you get an error, the endpoint isn't reachable

## Step 2: Check Stripe Webhook Configuration

1. **Go to Stripe Dashboard:**
   - Navigate to **Developers** → **Webhooks**
   - Look for your webhook endpoint

2. **Verify the webhook URL:**
   - The URL should be: `https://your-app.railway.app/api/stripe/webhook`
   - **Important:** Make sure it's using `https://` (not `http://`)
   - Make sure there's NO trailing slash at the end
   - Make sure you're using the correct mode (Test mode vs Live mode)

3. **Check which events are enabled:**
   - Click on your webhook endpoint
   - Under "Events to send", you should see:
     - ✅ `checkout.session.completed`
     - ✅ `customer.subscription.updated`
     - ✅ `customer.subscription.deleted`
   - If any are missing, click "Edit" and add them

4. **Check recent webhook attempts:**
   - In the webhook details page, scroll to "Recent events"
   - Look for recent `checkout.session.completed` events
   - Check the status:
     - ✅ **Success (200)** = Webhook delivered successfully
     - ❌ **Failed** = Click to see error details
     - ⏳ **Pending** = Still trying to deliver

## Step 3: Verify Webhook Secret

1. **Get your webhook signing secret:**
   - In Stripe Dashboard → Developers → Webhooks
   - Click on your webhook endpoint
   - Click "Reveal" next to "Signing secret"
   - Copy the secret (starts with `whsec_...`)

2. **Verify it matches your environment variable:**
   - In Railway Dashboard → Your Service → Variables
   - Check that `STRIPE_WEBHOOK_SECRET` matches the secret from Stripe
   - **Important:** Make sure you're using the secret from the correct mode (Test vs Live)

## Step 4: Check Server Logs

After making a test payment, check your Railway logs:

1. **Go to Railway Dashboard:**
   - Click on your service
   - Go to the "Deployments" tab
   - Click on the latest deployment
   - Click "View Logs"

2. **Look for webhook logs:**
   - You should see: `=== STRIPE WEBHOOK RECEIVED ===`
   - If you don't see this, the webhook isn't reaching your server
   - If you see errors, they'll be logged with ❌ symbols

## Step 5: Test Webhook Manually

You can manually trigger a webhook event from Stripe:

1. **In Stripe Dashboard:**
   - Go to **Developers** → **Webhooks**
   - Click on your webhook endpoint
   - Click "Send test webhook"
   - Select event type: `checkout.session.completed`
   - Click "Send test webhook"

2. **Check your logs:**
   - You should see the webhook received in your Railway logs
   - If not, there's a connectivity issue

## Common Issues

### Issue: "Webhook secret not configured"
**Solution:** Make sure `STRIPE_WEBHOOK_SECRET` is set in Railway environment variables

### Issue: "Webhook signature verification failed"
**Solution:** 
- The webhook secret in Railway doesn't match the one in Stripe
- Make sure you're using the correct secret for Test vs Live mode
- Regenerate the webhook secret in Stripe and update Railway

### Issue: No webhook events in logs
**Possible causes:**
1. Webhook URL is wrong in Stripe dashboard
2. Webhook endpoint isn't accessible (firewall, wrong URL)
3. Wrong Stripe mode (Test vs Live)
4. Webhook events aren't enabled

**Solution:**
- Double-check the webhook URL matches your Railway domain exactly
- Make sure you're testing in the same mode (Test/Live) as your webhook
- Verify the webhook endpoint is accessible (Step 1)

### Issue: Webhook received but subscription not updating
**Check logs for:**
- `❌ Error updating profile:` - Database error
- `⚠️ Missing userId` - User ID not in checkout session metadata
- `⚠️ No user found with subscription ID` - Subscription ID mismatch

**Solution:**
- Check that the user ID is being passed correctly in checkout session metadata
- Verify the subscription ID matches between Stripe and your database

## Quick Checklist

- [ ] Webhook URL is correct: `https://your-app.railway.app/api/stripe/webhook`
- [ ] Webhook is accessible (test in browser)
- [ ] All 3 events are enabled in Stripe
- [ ] `STRIPE_WEBHOOK_SECRET` matches Stripe signing secret
- [ ] Using correct mode (Test vs Live) in both Stripe and Railway
- [ ] Webhook events appear in Stripe "Recent events"
- [ ] Webhook logs appear in Railway logs after payment

## Still Not Working?

1. **Check Stripe Dashboard → Webhooks → Recent Events:**
   - Look for failed deliveries
   - Click on failed events to see error details
   - Common errors:
     - `404 Not Found` = Wrong webhook URL
     - `401 Unauthorized` = Webhook secret mismatch
     - `500 Internal Server Error` = Server-side error (check logs)

2. **Verify BASE_URL:**
   - Make sure `BASE_URL` in Railway matches your Railway domain
   - Should be: `https://your-app.railway.app` (no trailing slash)

3. **Test with Stripe CLI (advanced):**
   - Install Stripe CLI
   - Run: `stripe listen --forward-to https://your-app.railway.app/api/stripe/webhook`
   - This will show you real-time webhook events
