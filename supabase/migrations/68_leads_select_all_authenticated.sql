-- Allow all authenticated users to read all leads
-- Role-based visibility is now handled in the frontend only
DROP POLICY IF EXISTS "leads: select" ON leads;

CREATE POLICY "leads: select"
ON leads FOR SELECT
USING (auth.uid() IS NOT NULL);
