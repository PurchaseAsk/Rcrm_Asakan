-- normalize_phone: strip non-digits, convert +66/66 prefix → 0 for Thai numbers
CREATE OR REPLACE FUNCTION public.normalize_phone(p text)
RETURNS text LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  d text;
BEGIN
  IF p IS NULL OR trim(p) = '' THEN RETURN NULL; END IF;
  d := regexp_replace(p, '[^0-9]', '', 'g');
  IF length(d) = 0 THEN RETURN NULL; END IF;
  -- +66812345678 or 66812345678 → 0812345678
  IF length(d) = 11 AND d ~ '^66' THEN
    RETURN '0' || substring(d FROM 3);
  END IF;
  RETURN d;
END;
$$;

-- Unique constraint: no two leads may share the same normalized phone.
-- Partial: NULL phones and un-normalizable strings are excluded.
CREATE UNIQUE INDEX IF NOT EXISTS leads_phone_norm_unique_idx
  ON public.leads (normalize_phone(phone))
  WHERE phone IS NOT NULL AND normalize_phone(phone) IS NOT NULL;

-- SECURITY DEFINER so RLS is bypassed: we want to check ALL leads,
-- not just those visible to the calling user (staff would miss other teams' leads).
CREATE OR REPLACE FUNCTION public.find_lead_by_phone(p_phone text)
RETURNS TABLE (id uuid, customer_name text)
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, customer_name
  FROM public.leads
  WHERE normalize_phone(phone) = normalize_phone(p_phone)
    AND normalize_phone(p_phone) IS NOT NULL
  LIMIT 1;
$$;
