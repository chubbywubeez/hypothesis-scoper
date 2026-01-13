# Complete .env File Guide

This document shows exactly what should be in your `.env` file for local development.

## Required Environment Variables

### Core Application
```env
# OpenAI API Key (Required)
OPENAI_API_KEY=sk-proj-...

# Server Port (Optional - defaults to 3000)
PORT=3000
```

### Supabase Authentication (Required for login/save features)
```env
SUPABASE_URL=https://dknnmknfegjwgfvqmndf.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sb_secret_dMPhXGIhKA357bujnYemPQ_t1LM27lC
```

### Stripe Paywall (Required for Advanced Mode)
```env
# Stripe Secret Key (from Stripe Dashboard → Developers → API keys)
STRIPE_SECRET_KEY=sk_test_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx (or sk_live_... for production)

# Product ID (preferred) OR Price ID (alternative)
# You only need ONE of these, not both!
STRIPE_PRODUCT_ID=prod_TmYDmXSIAmQ6Hw

# Webhook Signing Secret (from Stripe Dashboard → Developers → Webhooks)
# Use the "Signing secret" (standard one), NOT snapshot or thin
STRIPE_WEBHOOK_SECRET=whsec_...

# Base URL for redirects and webhooks
# For local testing with ngrok: https://your-ngrok-url.ngrok-free.app
# For Railway production: https://your-app.railway.app
BASE_URL=https://your-railway-url.railway.app
```

### Optional: Confluence Export (for internal users only)
```env
CONFLUENCE_DOMAIN=yourcompany.atlassian.net
CONFLUENCE_EMAIL=your.email@company.com
CONFLUENCE_API_TOKEN=your_confluence_api_token
CONFLUENCE_SPACE_KEY=YOUR_SPACE_KEY
```

### Optional: Beehiiv Newsletter
```env
BEEHIV_API_KEY=your_beehiiv_api_key
BEEHIV_PUBLICATION_ID=pub_...
```

## Complete Example .env File

```env
# ============================================
# REQUIRED - Core Application
# ============================================
OPENAI_API_KEY=sk-proj-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# ============================================
# REQUIRED - Supabase Authentication
# ============================================
SUPABASE_URL=https://dknnmknfegjwgfvqmndf.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sb_secret_dMPhXGIhKA357bujnYemPQ_t1LM27lC

# ============================================
# REQUIRED - Stripe Paywall
# ============================================
STRIPE_SECRET_KEY=sk_test_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
STRIPE_PRODUCT_ID=prod_TmYDmXSIAmQ6Hw
STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
BASE_URL=https://your-app.railway.app

# ============================================
# OPTIONAL - Confluence Export (internal users)
# ============================================
# CONFLUENCE_DOMAIN=yourcompany.atlassian.net
# CONFLUENCE_EMAIL=your.email@company.com
# CONFLUENCE_API_TOKEN=your_token
# CONFLUENCE_SPACE_KEY=YOUR_SPACE

# ============================================
# OPTIONAL - Beehiiv Newsletter
# ============================================
# BEEHIV_API_KEY=your_key
# BEEHIV_PUBLICATION_ID=pub_...
```

## Important Notes

1. **Product ID vs Price ID:**
   - If you have `STRIPE_PRODUCT_ID`, you do NOT need `STRIPE_PRICE_ID`
   - The code will automatically fetch your product's default price
   - Only use `STRIPE_PRICE_ID` if you don't have a product ID

2. **Webhook Secret:**
   - Use the standard **"Signing secret"** (starts with `whsec_`)
   - Do NOT use "Snapshot signing secret" or "Thin signing secret"
   - Only ONE webhook endpoint should point to your URL (delete duplicates)

3. **BASE_URL:**
   - For Railway: Your Railway public domain (e.g., `https://hypothesis-scoper-production.up.railway.app`)
   - For local testing: Your ngrok URL (e.g., `https://xxxx-xx-xx-xx-xx.ngrok-free.app`)
   - NO trailing slash at the end!

4. **Never commit .env file:**
   - The `.env` file is already in `.gitignore`
   - Never push it to GitHub
   - Add these same variables to Railway's environment variables for production
