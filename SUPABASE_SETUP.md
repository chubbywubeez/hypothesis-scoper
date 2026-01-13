# Supabase Setup Instructions

## Your Supabase Configuration

Based on your project, here are your credentials:

### Your Supabase Project URL:
```
https://dknnmknfegjwgfvqmndf.supabase.co
```

### Your Service Role Key:
```
sb_secret_dMPhXGIhKA357bujnYemPQ_t1LM27lC
```

**Note:** The service role key is for backend use only - never expose it in frontend code.

### How to Verify Your URL:

1. Go to your [Supabase Dashboard](https://supabase.com/dashboard/project/dknnmknfegjwgfvqmndf)
2. Go to **Settings** → **API**
3. Verify the **Project URL** matches: `https://dknnmknfegjwgfvqmndf.supabase.co`

## Step 1: Create Database Tables

Run these SQL commands in your Supabase SQL Editor (Dashboard → SQL Editor):

```sql
-- Create profiles table for user roles and subscriptions
CREATE TABLE IF NOT EXISTS profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email TEXT,
  role TEXT DEFAULT 'customer' CHECK (role IN ('customer', 'internal')),
  subscription_status TEXT DEFAULT 'inactive' CHECK (subscription_status IN ('active', 'inactive', 'canceled')),
  subscription_id TEXT,
  subscription_started_at TIMESTAMP WITH TIME ZONE,
  subscription_updated_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Policy: Users can read their own profile
CREATE POLICY "Users can view own profile" ON profiles
  FOR SELECT USING (auth.uid() = id);

-- Policy: Service role can do anything (for backend operations)
CREATE POLICY "Service role full access" ON profiles
  FOR ALL USING (auth.role() = 'service_role');

-- Create saved_scopes table
CREATE TABLE IF NOT EXISTS saved_scopes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  content_type TEXT DEFAULT 'hypothesis',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE saved_scopes ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own scopes
CREATE POLICY "Users can view own scopes" ON saved_scopes
  FOR SELECT USING (auth.uid() = user_id);

-- Policy: Users can insert their own scopes
CREATE POLICY "Users can insert own scopes" ON saved_scopes
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own scopes
CREATE POLICY "Users can update own scopes" ON saved_scopes
  FOR UPDATE USING (auth.uid() = user_id);

-- Policy: Users can delete their own scopes
CREATE POLICY "Users can delete own scopes" ON saved_scopes
  FOR DELETE USING (auth.uid() = user_id);

-- Policy: Service role can do anything (for backend operations)
CREATE POLICY "Service role full access" ON saved_scopes
  FOR ALL USING (auth.role() = 'service_role');

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS saved_scopes_user_id_idx ON saved_scopes(user_id);
CREATE INDEX IF NOT EXISTS saved_scopes_created_at_idx ON saved_scopes(created_at);
CREATE INDEX IF NOT EXISTS profiles_subscription_status_idx ON profiles(subscription_status);
CREATE INDEX IF NOT EXISTS profiles_subscription_id_idx ON profiles(subscription_id);
```

**If you already have the profiles table, run this migration to add subscription fields:**

```sql
-- Add subscription fields to existing profiles table
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'inactive' CHECK (subscription_status IN ('active', 'inactive', 'canceled')),
ADD COLUMN IF NOT EXISTS subscription_id TEXT,
ADD COLUMN IF NOT EXISTS subscription_started_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS subscription_updated_at TIMESTAMP WITH TIME ZONE;

-- Create indexes for subscription queries
CREATE INDEX IF NOT EXISTS profiles_subscription_status_idx ON profiles(subscription_status);
CREATE INDEX IF NOT EXISTS profiles_subscription_id_idx ON profiles(subscription_id);
```

## Step 2: Set Environment Variables in Railway

Add these to your Railway environment variables:

**Required:**
```
SUPABASE_URL=https://dknnmknfegjwgfvqmndf.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sb_secret_dMPhXGIhKA357bujnYemPQ_t1LM27lC
```

**For Stripe (Advanced Mode Paywall):**
```
STRIPE_SECRET_KEY=sk_test_... (or sk_live_... for production)
STRIPE_PRODUCT_ID=prod_... (your subscription product ID - preferred)
OR
STRIPE_PRICE_ID=price_... (your subscription price ID - alternative)
STRIPE_WEBHOOK_SECRET=whsec_... (your webhook signing secret)
BASE_URL=https://your-domain.com (for Stripe redirect URLs and webhooks)
```

**Note:** You can use either `STRIPE_PRODUCT_ID` or `STRIPE_PRICE_ID`. If you use Product ID, the system will automatically use the product's default price.

**Important:** 
- Copy these EXACTLY as shown above
- The service_role key is for backend use only - never expose it in frontend code
- Railway will automatically redeploy when you add these variables
- After adding, your deployment should restart and Supabase will be connected

## Step 3: Create Your First Internal User

After setting up, you can create an internal user in two ways:

### Option A: Via API (after first customer signup)
1. Sign up a user normally (they'll be a customer by default)
2. In Supabase SQL Editor, run:
```sql
UPDATE profiles 
SET role = 'internal' 
WHERE email = 'your-email@example.com';
```

### Option B: Via Signup API with role
When calling `/api/auth/signup`, include `role: 'internal'` in the request body (though the backend will default to 'customer' for security - you'll need to update it in the database).

## Step 5: Test the Setup

1. **Test Signup:**
   - Click "Login" → "Sign Up" tab
   - Create a new account
   - Should automatically log you in

2. **Test Save (Customer):**
   - Generate a hypothesis
   - Click "Save Hypothesis" (should appear for customers)
   - Should save successfully

3. **Test My Scopes:**
   - Click "My Scopes" button in header
   - Should show your saved scopes

4. **Test Internal User:**
   - Create an internal user (update role in database)
   - Login as internal user
   - Should see "Export to Confluence" buttons instead of "Save"

## Features Implemented

✅ User authentication (login/signup)
✅ Role-based access (customer vs internal)
✅ Save scopes to database (customers)
✅ Export to Confluence (internal users only)
✅ "My Scopes" dashboard
✅ Automatic title generation
✅ Token-based authentication
✅ Persistent login (token saved in localStorage)

## Troubleshooting

**"Supabase not configured" error:**
- Check that SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set in Railway
- Make sure the URL doesn't have a trailing slash
- Verify the service role key is correct

**"Authentication failed" error:**
- Check that the database tables are created
- Verify RLS policies are set up correctly
- Check Supabase logs for errors

**"Failed to save scope" error:**
- Verify the saved_scopes table exists
- Check that RLS policies allow inserts
- Verify user is authenticated (check token in localStorage)
