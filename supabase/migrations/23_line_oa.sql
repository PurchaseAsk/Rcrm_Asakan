CREATE TABLE line_oa_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  channel_id text UNIQUE NOT NULL,
  channel_secret text NOT NULL,
  channel_access_token text NOT NULL,
  bot_user_id text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE line_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  line_oa_id uuid REFERENCES line_oa_accounts(id) ON DELETE CASCADE NOT NULL,
  sender_line_id text NOT NULL,
  display_name text,
  picture_url text,
  last_message_text text,
  last_message_at timestamptz DEFAULT now(),
  last_message_direction text CHECK (last_message_direction IN ('inbound', 'outbound')),
  last_read_at timestamptz,
  is_pinned boolean DEFAULT false,
  lead_id uuid REFERENCES leads(id),
  created_at timestamptz DEFAULT now(),
  UNIQUE (line_oa_id, sender_line_id)
);

CREATE TABLE line_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid REFERENCES line_conversations(id) ON DELETE CASCADE NOT NULL,
  direction text NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  content text,
  attachment_type text,
  line_message_id text UNIQUE,
  sent_by uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE line_oa_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE line_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE line_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "line_oa_admin_all" ON line_oa_accounts FOR ALL TO authenticated USING (my_role() = 'admin');
CREATE POLICY "line_oa_auth_read" ON line_oa_accounts FOR SELECT TO authenticated USING (true);
CREATE POLICY "line_conv_auth_all" ON line_conversations FOR ALL TO authenticated USING (true);
CREATE POLICY "line_msg_auth_all" ON line_messages FOR ALL TO authenticated USING (true);
