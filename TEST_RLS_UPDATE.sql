-- Test if service role can update profiles
-- Run this in Supabase SQL Editor to verify RLS policies work

-- First, let's test if we can update directly (this should work from SQL editor)
-- since SQL editor runs with service role privileges
UPDATE profiles 
SET 
  subscription_status = 'active',
  subscription_id = 'test_sub_123',
  subscription_updated_at = NOW()
WHERE id = '0072470a-2826-4975-84cb-f5c050351a94';

-- Check if the update worked
SELECT id, email, subscription_status, subscription_id, subscription_updated_at
FROM profiles
WHERE id = '0072470a-2826-4975-84cb-f5c050351a94';

-- If the above works, the policies are correct
-- The issue might be with how the Supabase JS client is using the service role key

-- Let's also check what auth.role() returns in different contexts
SELECT 
  auth.role() as current_role,
  current_setting('request.jwt.claims', true)::json->>'role' as jwt_role,
  auth.uid() as current_uid;
