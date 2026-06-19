export type Role = "admin" | "team_lead" | "staff";

export type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  role: Role;
};

export type Stage = {
  id: string;
  name: string;
  position: number;
  color: string;
  is_unfollow: boolean;
  pipeline_id: string | null;
};

export type Pipeline = {
  id: string;
  name: string;
  description: string | null;
  color: string;
  is_active: boolean;
  created_by: string | null;
  pipeline_teams?: { team_id: string; teams?: { name: string } | null }[];
  pipeline_users?: { user_id: string; profiles?: Profile | null }[];
};

export type Page = {
  id: string;
  page_id: string;
  name: string;
  is_active: boolean;
};

export type LeadMeta = {
  ad_id?: string | null;
  ad_name?: string | null;
  adset_id?: string | null;
  adset_name?: string | null;
  campaign_id?: string | null;
  campaign_name?: string | null;
  form_id?: string | null;
};

export type Lead = {
  id: string;
  customer_name: string;
  facebook_id: string | null;
  facebook_lead_id: string | null;
  phone: string | null;
  email: string | null;
  value: number | null;
  page_id: string | null;
  stage_id: string | null;
  pipeline_id: string | null;
  assigned_to: string | null;
  status: "active" | "unfollowed";
  source: string | null;
  metadata: LeadMeta | null;
  last_activity_at: string;
  created_at: string;
  stage?: Stage | null;
  page?: Page | null;
  assigned?: Profile | null;
  lead_tags?: { tag_id: string; tags?: Tag | null }[];
};

export type Team = {
  id: string;
  name: string;
  team_members?: { user_id: string; is_lead: boolean; profiles?: Profile | null }[];
};

export type DistributionRule = {
  id: string;
  page_id: string | null;
  team_id: string | null;
  pipeline_id: string | null;
  method: "round_robin" | "random" | "weighted";
  config: { user_ids?: string[]; last_index?: number } | null;
  is_active: boolean;
  teams?: { name: string } | null;
  facebook_pages?: { name: string } | null;
  pipelines?: { name: string; color: string } | null;
};

export type Tag = {
  id: string;
  name: string;
  color: string;
  type: "global" | "personal";
  created_by: string | null;
};

export type RecallRule = {
  id: string;
  stage_id: string;
  inactive_days: number;
  recall_to: "pool" | "admin" | "team";
  is_active: boolean;
  funnel_stages?: { name: string } | null;
};

export type Activity = {
  id: string;
  lead_id: string;
  type: string;
  content: string | null;
  created_by: string | null;
  created_at: string;
};

export type Reminder = {
  id: string;
  lead_id: string;
  remind_at: string;
  note: string | null;
  created_by: string | null;
  is_done: boolean;
  leads?: { customer_name: string } | null;
};

export type Conversation = {
  id: string;
  page_id: string;
  sender_psid: string;
  sender_name: string | null;
  last_message_at: string;
  lead_id: string | null;
  created_at: string;
  facebook_pages?: { id: string; name: string; page_id: string; token: string } | null;
  leads?: { id: string; customer_name: string } | null;
};

export type Message = {
  id: string;
  conversation_id: string;
  direction: "inbound" | "outbound";
  content: string | null;
  fb_message_id: string | null;
  created_at: string;
  sent_by: string | null;
  attachment_url: string | null;
  attachment_type: string | null;
  profiles?: { id: string; full_name: string | null; email: string } | null;
};
