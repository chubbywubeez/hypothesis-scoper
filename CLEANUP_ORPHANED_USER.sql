-- Clean up orphaned auth user (user exists in auth.users but not in profiles)
-- Run this to delete the auth user that was created but profile failed

-- First, check if the user exists in auth.users but not in profiles
SELECT 
  au.id,
  au.email,
  CASE WHEN p.id IS NULL THEN 'Missing profile' ELSE 'Profile exists' END as profile_status
FROM auth.users au
LEFT JOIN profiles p ON au.id = p.id
WHERE au.email = 'asdflkjsf@gmail.com';

-- If the above shows "Missing profile", delete the auth user:
-- (Uncomment the line below to actually delete)
-- DELETE FROM auth.users WHERE email = 'asdflkjsf@gmail.com';

-- Or, manually create the profile for the existing user:
-- (Uncomment and adjust the UUID if needed)
-- INSERT INTO profiles (id, email, role, terms_accepted, terms_accepted_at)
-- SELECT 
--   id,
--   email,
--   'customer',
--   true,
--   NOW()
-- FROM auth.users
-- WHERE email = 'asdflkjsf@gmail.com'
-- AND id NOT IN (SELECT id FROM profiles);
