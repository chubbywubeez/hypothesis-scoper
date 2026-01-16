# Admin Dashboard Setup

This guide will help you set up the admin dashboard for internal users to view analytics and manage users.

## Step 1: Create Database Tables for Tracking

Run these SQL commands in your Supabase SQL Editor (Dashboard → SQL Editor):

```sql
-- Create login_events table to track user logins
CREATE TABLE IF NOT EXISTS login_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  login_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  ip_address TEXT,
  user_agent TEXT
);

-- Create generation_events table to track AI generations
CREATE TABLE IF NOT EXISTS generation_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  generation_type TEXT NOT NULL CHECK (generation_type IN ('hypothesis', 'scope', 'quick_scope', 'advanced_conversation', 'advanced_hypothesis')),
  tokens_used INTEGER,
  input_length INTEGER,
  output_length INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE login_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE generation_events ENABLE ROW LEVEL SECURITY;

-- Policy: Service role can do anything (for backend operations)
CREATE POLICY "Service role full access login_events" ON login_events
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access generation_events" ON generation_events
  FOR ALL USING (auth.role() = 'service_role');

-- Policy: Users can view their own events (optional, for transparency)
CREATE POLICY "Users can view own login events" ON login_events
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can view own generation events" ON generation_events
  FOR SELECT USING (auth.uid() = user_id);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS login_events_user_id_idx ON login_events(user_id);
CREATE INDEX IF NOT EXISTS login_events_login_at_idx ON login_events(login_at);
CREATE INDEX IF NOT EXISTS generation_events_user_id_idx ON generation_events(user_id);
CREATE INDEX IF NOT EXISTS generation_events_created_at_idx ON generation_events(created_at);
CREATE INDEX IF NOT EXISTS generation_events_type_idx ON generation_events(generation_type);
```

## Step 2: Access the Admin Dashboard

Once the tables are created and the code is deployed:

1. Log in as an internal user
2. You'll see an "Admin Dashboard" button in the header
3. Click it to view analytics and user management

## Features

### Analytics Dashboard
- Total users
- Active subscriptions
- Total generations
- Total tokens used
- Login statistics
- Usage trends over time

### User Management
- View all users
- Filter by subscription status
- See user details:
  - Email
  - Role
  - Subscription status
  - Subscription date
  - Login count
  - Total generations
  - Total tokens used
  - Last login date
- Edit user roles (internal/customer)
- View user's saved scopes

## Security

- Only users with `role = 'internal'` can access the admin dashboard
- All admin endpoints verify the user's role server-side
- Row Level Security (RLS) policies protect the tracking tables
