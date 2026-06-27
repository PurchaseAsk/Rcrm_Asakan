-- Migration 38: Fix phone deduplication to be pipeline-scoped and active-only.
-- Old index was global (any pipeline, any status) which blocked legitimate cases:
--   - same phone in different pipeline (different project) → should be allowed
--   - re-registering after being unfollowed → should be allowed

DROP INDEX IF EXISTS public.leads_phone_norm_unique_idx;

CREATE UNIQUE INDEX leads_phone_norm_pipeline_active_unique_idx
  ON public.leads (
    normalize_phone(phone),
    COALESCE(pipeline_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  WHERE phone IS NOT NULL
    AND normalize_phone(phone) IS NOT NULL
    AND status = 'active';

-- Update find_lead_by_phone to be pipeline-scoped and active-only.
CREATE OR REPLACE FUNCTION public.find_lead_by_phone(
  p_phone      text,
  p_pipeline_id uuid DEFAULT NULL
)
RETURNS TABLE (id uuid, customer_name text)
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, customer_name
  FROM public.leads
  WHERE normalize_phone(phone) = normalize_phone(p_phone)
    AND normalize_phone(p_phone) IS NOT NULL
    AND status = 'active'
    AND COALESCE(pipeline_id, '00000000-0000-0000-0000-000000000000'::uuid)
        = COALESCE(p_pipeline_id, '00000000-0000-0000-0000-000000000000'::uuid)
  ORDER BY last_activity_at DESC
  LIMIT 1;
$$;
