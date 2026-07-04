import type {
  Activity,
  DistributionRule,
  Lead,
  LineOaAccount,
  Page,
  Pipeline,
  Profile,
  RecallRule,
  Reminder,
  Stage,
  StageRule,
  Tag,
  Team,
} from "@/types/crm";

export type AppData = {
  leads: Lead[];
  stages: Stage[];
  pipelines: Pipeline[];
  pages: Page[];
  teams: Team[];
  profiles: Profile[];
  rules: DistributionRule[];
  recallRules: RecallRule[];
  tags: Tag[];
  lineOaAccounts: LineOaAccount[];
  stageRules: StageRule[];
};

export const emptyData: AppData = {
  leads: [],
  stages: [],
  pipelines: [],
  pages: [],
  teams: [],
  profiles: [],
  rules: [],
  recallRules: [],
  tags: [],
  lineOaAccounts: [],
  stageRules: [],
};

export type LeadDetail = {
  activities: Activity[];
  reminders: Reminder[];
};

export type StageNoteRequest = {
  stageName: string;
  stageRule: StageRule | null;
  resolve: (note: string | null) => void;
};

export type RuleForm = {
  page_id: string;
  pipeline_id: string;
  assign_type: string;
  team_id: string;
  user_id: string;
  method: string;
};

export type TabId =
  | "dashboard"
  | "leads"
  | "funnel"
  | "inbox"
  | "reminders"
  | "teams"
  | "pipelines"
  | "stages"
  | "rules"
  | "recall"
  | "tags"
  | "my-tags"
  | "pages"
  | "customers"
  | "website"
  | "line"
  | "line-oa"
  | "users";
