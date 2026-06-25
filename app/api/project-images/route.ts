import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

const ALLOWED = ["wela", "elysium"] as const;

export async function GET(request: NextRequest) {
  const project = request.nextUrl.searchParams.get("project");
  const folder = request.nextUrl.searchParams.get("folder") ?? null;

  if (!project || !(ALLOWED as readonly string[]).includes(project)) {
    return NextResponse.json({ error: "Invalid project" }, { status: 400 });
  }

  const supabase = adminSupabase();
  const prefix = folder ? `${project}/${folder}` : project;

  const { data, error } = await supabase.storage
    .from("project-images")
    .list(prefix, { sortBy: { column: "name", order: "asc" } });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const folders: string[] = [];
  const images: { name: string; url: string }[] = [];

  for (const item of data ?? []) {
    if (item.name === ".emptyFolderPlaceholder") continue;
    if (item.id === null) {
      folders.push(item.name);
    } else {
      const { data: urlData } = supabase.storage
        .from("project-images")
        .getPublicUrl(`${prefix}/${item.name}`);
      images.push({ name: item.name, url: urlData.publicUrl });
    }
  }

  return NextResponse.json({ folders, images });
}
