export type Role = "admin" | "team_lead" | "staff";

export type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  role: Role;
  sales_suffix: string | null;
};

export type Stage = {
  id: string;
  name: string;
  position: number;
  color: string;
  is_unfollow: boolean;
  is_voucher_stage: boolean;
  pipeline_id: string | null;
  capi_event: string | null;
};

export type CapiEvent = "Lead" | "QualifiedLead" | "Schedule";

export type Pipeline = {
  id: string;
  name: string;
  description: string | null;
  color: string;
  is_active: boolean;
  created_by: string | null;
  gas_webhook_url: string | null;
  gas_project_key: string | null;
  pipeline_teams?: { team_id: string; teams?: { name: string } | null }[];
  pipeline_users?: { user_id: string; profiles?: Profile | null }[];
};

export type Page = {
  id: string;
  page_id: string;
  name: string;
  is_active: boolean;
  pixel_id: string | null;
  capi_token: string | null;
};

export type LeadMeta = {
  ad_id?: string | null;
  ad_name?: string | null;
  adset_id?: string | null;
  adset_name?: string | null;
  campaign_id?: string | null;
  campaign_name?: string | null;
  form_id?: string | null;
  form_name?: string | null;
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
  stage_entered_at: string | null;
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
  attachment_url: string | null;
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

export type TeamReminder = {
  id: string;
  title: string;
  body: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  profiles?: { id: string; full_name: string | null; email: string } | null;
};

export type Conversation = {
  id: string;
  page_id: string;
  sender_psid: string;
  sender_name: string | null;
  picture_url: string | null;
  last_message_at: string;
  lead_id: string | null;
  ad_id: string | null;
  ad_name: string | null;
  last_read_at: string | null;
  customer_read_at: string | null;
  last_message_text: string | null;
  last_message_direction: "inbound" | "outbound" | null;
  is_pinned: boolean;
  created_at: string;
  facebook_pages?: { id: string; name: string; page_id: string; token: string } | null;
  leads?: { id: string; customer_name: string } | null;
  conversation_tags?: { tag_id: string; tags?: { id: string; name: string; color: string } | null }[];
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
  reply_to_message_id: string | null;
  profiles?: { id: string; full_name: string | null; email: string } | null;
};

export type LineOaAccount = {
  id: string;
  name: string;
  channel_id: string;
  is_active: boolean;
  bot_user_id: string | null;
};

export type LineConversation = {
  id: string;
  line_oa_id: string;
  sender_line_id: string;
  display_name: string | null;
  picture_url: string | null;
  last_message_text: string | null;
  last_message_at: string;
  last_message_direction: "inbound" | "outbound" | null;
  last_read_at: string | null;
  is_pinned: boolean;
  lead_id: string | null;
  created_at: string;
  line_oa_accounts?: { name: string } | null;
};

export type LineMessage = {
  id: string;
  conversation_id: string;
  direction: "inbound" | "outbound";
  content: string | null;
  attachment_type: string | null;
  attachment_url: string | null;
  line_message_id: string | null;
  sent_by: string | null;
  created_at: string;
  profiles?: { id: string; full_name: string | null; email: string } | null;
};

export type PageComment = {
  id: string;
  page_id: string;
  fb_comment_id: string;
  fb_post_id: string;
  from_user_id: string | null;
  from_user_name: string | null;
  message: string | null;
  fb_created_time: string | null;
  status: "active" | "archived";
  archive_reason: "chat" | "done" | null;
  private_reply_sent: boolean;
  created_at: string;
  page?: { id: string; page_id: string; name: string } | null;
  replies?: PageCommentReply[];
};

export type PageCommentReply = {
  id: string;
  comment_id: string;
  message: string;
  fb_reply_id: string | null;
  created_by: string | null;
  created_at: string;
};
