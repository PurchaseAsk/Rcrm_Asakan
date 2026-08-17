-- Update find_lead_by_phone to also return the assigned user's name
-- so the UI can show "เบอร์นี้มีลีดอยู่แล้ว — อยู่กับ [ชื่อ]" on duplicate
CREATE OR REPLACE FUNCTION public.find_lead_by_phone(
  p_phone       text,
  p_pipeline_id uuid DEFAULT NULL
)
RETURNS TABLE (id uuid, customer_name text, assigned_to uuid, assigned_name text)
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    l.id,
    l.customer_name,
    l.assigned_to,
    p.full_name AS assigned_name
  FROM public.leads l
  LEFT JOIN public.profiles p ON p.id = l.assigned_to
  WHERE normalize_phone(l.phone) = normalize_phone(p_phone)
    AND normalize_phone(p_phone) IS NOT NULL
    AND l.status = 'active'
    AND COALESCE(l.pipeline_id, '00000000-0000-0000-0000-000000000000'::uuid)
        = COALESCE(p_pipeline_id, '00000000-0000-0000-0000-000000000000'::uuid)
  LIMIT 1;
$$;
