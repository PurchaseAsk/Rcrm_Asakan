# Supabase Migration Notes

This project originally used manual SQL files named `001_*.sql` through `007_*.sql`.
Those files were moved to `supabase/legacy_manual_sql/` because Supabase CLI migrations
must use timestamp filenames such as `20260618024626_name.sql`.

## Active CLI migrations

Only files in `supabase/migrations/` should be pushed with Supabase CLI.

Current active migrations:

- `20260618023131_server_distribute_pipeline.sql`
- `20260618024626_harden_helpers_and_recall_team.sql`

## Legacy manual SQL

The old files are kept as reference only:

- `supabase/legacy_manual_sql/001_init.sql`
- `supabase/legacy_manual_sql/002_fix_profiles_policy.sql`
- `supabase/legacy_manual_sql/003_fix_trigger.sql`
- `supabase/legacy_manual_sql/004_add_reminders.sql`
- `supabase/legacy_manual_sql/005_add_pipelines.sql`
- `supabase/legacy_manual_sql/006_setup_admin.sql`
- `supabase/legacy_manual_sql/007_distribution_pipeline.sql`

Do not run `001_init.sql` against production unless you intentionally want a destructive
fresh start. It contains a `DROP EVERYTHING` section.

## Existing remote database

If the production database already has the legacy schema from manual SQL editor runs,
do not push the legacy files. Apply only the active timestamp migrations above.

If you want Supabase CLI migration history to match an existing remote database, use
`supabase migration repair` carefully after inspecting the remote migration table.
Do this per environment; do not guess migration state from local filenames.

## Admin setup

Do not put real emails in migrations. Promote admins with a one-off SQL command in the
Supabase SQL editor or an internal runbook, for example:

```sql
update profiles
set role = 'admin'
where email = '<admin-email>';
```
