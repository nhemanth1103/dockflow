# DockFlow test users

Create test accounts in Supabase Dashboard → Authentication → Users using
temporary email addresses and passwords you choose. Do not store credentials in
this repository.

After creating each Auth user, insert its matching profile in the SQL editor.
Replace the placeholder Auth user UUID with the value from Authentication.

```sql
-- Captain assigned to boat B-003
INSERT INTO public.profiles (id, role, boat_id)
SELECT
  'AUTH_USER_UUID'::uuid,
  'CAPTAIN',
  id
FROM public.boats
WHERE boat_code = 'B-003';

-- Depot operator assigned to Harbor Ice Depot A
INSERT INTO public.profiles (id, role, depot_id)
SELECT
  'AUTH_USER_UUID'::uuid,
  'DEPOT',
  id
FROM public.depots
WHERE name = 'Harbor Ice Depot A';
```

Run `012_auth_profiles_rls.sql` before creating profile rows. Email
confirmation behavior is controlled by your Supabase Authentication settings.
