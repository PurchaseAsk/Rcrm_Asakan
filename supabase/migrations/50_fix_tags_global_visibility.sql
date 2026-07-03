-- Migration 50: Allow all roles to see global tags (type = 'global')
-- Previous policy only allowed type = 'system', but the app uses 'global' for shared tags.

DROP POLICY IF EXISTS "tags: select" ON tags;

CREATE POLICY "tags: select" ON tags
  FOR SELECT USING (
    type IN ('system', 'global')
    OR created_by = auth.uid()
    OR my_role() = 'admin'
  );
