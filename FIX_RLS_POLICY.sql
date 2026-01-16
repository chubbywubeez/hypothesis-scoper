-- Fix RLS policy for profiles table to allow service role inserts
-- This fixes the "new row violates row-level security policy" error during signup

-- Drop the existing service role policy if it exists
DROP POLICY IF EXISTS "Service role full access" ON profiles;

-- Create a more permissive policy for service role
-- This policy allows all operations when the request is made with service role key
CREATE POLICY "Service role full access" ON profiles
  FOR ALL 
  USING (
    -- Check JWT claims for service_role
    COALESCE(current_setting('request.jwt.claims', true)::json->>'role', '') = 'service_role'
    OR auth.role() = 'service_role'
    -- Also allow if no user context (service role operations)
    OR auth.uid() IS NULL
  )
  WITH CHECK (
    COALESCE(current_setting('request.jwt.claims', true)::json->>'role', '') = 'service_role'
    OR auth.role() = 'service_role'
    OR auth.uid() IS NULL
  );

-- Also add a specific INSERT policy as a backup
CREATE POLICY "Service role can insert profiles" ON profiles
  FOR INSERT
  WITH CHECK (
    COALESCE(current_setting('request.jwt.claims', true)::json->>'role', '') = 'service_role'
    OR auth.role() = 'service_role'
    OR auth.uid() IS NULL
  );
