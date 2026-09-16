CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  assigned_by UUID NOT NULL REFERENCES profiles(id),
  assigned_to UUID NOT NULL REFERENCES profiles(id),
  entity_type TEXT CHECK (entity_type IN ('lead', 'case', 'conversation')),
  entity_id UUID,
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done')),
  due_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  completion_note TEXT
);

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tasks: select" ON tasks FOR SELECT USING (
  auth.uid() = assigned_to OR auth.uid() = assigned_by OR my_role() = 'admin'
);

CREATE POLICY "tasks: insert" ON tasks FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "tasks: update" ON tasks FOR UPDATE USING (
  auth.uid() = assigned_to OR auth.uid() = assigned_by OR my_role() = 'admin'
);

CREATE POLICY "tasks: delete" ON tasks FOR DELETE USING (
  auth.uid() = assigned_by OR my_role() = 'admin'
);
