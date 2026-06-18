"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { createBrowserSupabase } from "@/lib/supabase";
import type { Profile, Team } from "@/types/crm";
import { deleteRow, removeTeamMember, toggleTeamLead } from "@/lib/helpers";
import { Field } from "@/components/ui/Field";
import { IconButton } from "@/components/ui/IconButton";
import { InlineCreate } from "@/components/ui/InlineCreate";

const supabase = createBrowserSupabase();

export function TeamsPanel({
  teams,
  profiles,
  userId,
  reload,
  toast,
}: {
  teams: Team[];
  profiles: Profile[];
  userId: string;
  reload: () => Promise<void>;
  toast: (message: string) => void;
}) {
  const [name, setName] = useState("");
  const [memberByTeam, setMemberByTeam] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function createTeam() {
    if (!name.trim()) return toast("Team name is required");
    setBusy(true);
    try {
      const { data, error } = await supabase
        .from("teams")
        .insert({ name: name.trim(), created_by: userId })
        .select("id,name")
        .single();
      if (error) {
        toast(`Create team failed: ${error.message}`);
        return;
      }
      const memberResult = await supabase
        .from("team_members")
        .insert({ team_id: data.id, user_id: userId, is_lead: true });
      setName("");
      await reload();
      toast(
        memberResult.error
          ? `Team created, but owner was not added: ${memberResult.error.message}`
          : "Team created",
      );
    } catch (reloadError) {
      toast(reloadError instanceof Error ? reloadError.message : "Team created, but reload failed");
    } finally {
      setBusy(false);
    }
  }

  async function addMember(teamId: string) {
    const userIdToAdd = memberByTeam[teamId];
    if (!userIdToAdd) return;
    const { error } = await supabase
      .from("team_members")
      .insert({ team_id: teamId, user_id: userIdToAdd, is_lead: false });
    if (error) return toast(error.message);
    setMemberByTeam((current) => ({ ...current, [teamId]: "" }));
    await reload();
  }

  return (
    <div className="space-y-4">
      <InlineCreate
        title="Create team"
        fields={<Field label="Team name" value={name} onChange={setName} />}
        onSubmit={createTeam}
        disabled={busy}
      />
      <div className="grid gap-3 md:grid-cols-2">
        {teams.map((team) => (
          <section key={team.id} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-slate-950">{team.name}</h2>
              <IconButton
                label="Delete team"
                icon={Trash2}
                onClick={async () => deleteRow("teams", team.id, reload, toast)}
              />
            </div>
            <div className="mt-3 space-y-2">
              {(team.team_members || []).map((member) => (
                <div
                  key={member.user_id}
                  className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-2"
                >
                  <span className="text-sm text-slate-700">
                    {member.profiles?.full_name || member.profiles?.email || member.user_id}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      className="text-xs font-medium text-brand-700"
                      onClick={() => toggleTeamLead(team.id, member.user_id, member.is_lead, reload, toast)}
                    >
                      {member.is_lead ? "Lead" : "Make lead"}
                    </button>
                    <button
                      className="text-xs text-rose-600"
                      onClick={() => removeTeamMember(team.id, member.user_id, reload, toast)}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 flex gap-2">
              <select
                className="h-10 flex-1 rounded-lg border border-slate-200 px-3 text-sm"
                value={memberByTeam[team.id] || ""}
                onChange={(event) =>
                  setMemberByTeam((current) => ({ ...current, [team.id]: event.target.value }))
                }
              >
                <option value="">Add member</option>
                {profiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.full_name || profile.email}
                  </option>
                ))}
              </select>
              <button
                className="rounded-lg bg-brand-700 px-3 text-sm font-medium text-white"
                onClick={() => addMember(team.id)}
              >
                Add
              </button>
            </div>
          </section>
        ))}
        {!teams.length ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500 md:col-span-2">
            No teams yet. Create the first team above.
          </div>
        ) : null}
      </div>
    </div>
  );
}
