-- Fix my_role() to return 'staff' when no profile row exists for the current user.
-- Without this, the function returns NULL and RLS policies that call my_role()
-- silently exclude all rows instead of treating the user as the lowest privilege.

CREATE OR REPLACE FUNCTION public.my_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT role FROM public.profiles WHERE id = auth.uid()),
    'staff'
  );
$$;
