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
  if (!project || !(ALLOWED as readonly string[]).includes(project)) {
    return NextResponse.json({ error: "Invalid project" }, { status: 400 });
  }

  const supabase = adminSupabase();
  const { data, error } = await supabase.storage
    .from("project-images")
    .list(project, { sortBy: { column: "name", order: "asc" } });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const items = (data ?? []).filter(
    (f) => f.id !== null && f.name !== ".emptyFolderPlaceholder",
  );

  const images = items.map((item) => {
    const { data: urlData } = supabase.storage
      .from("project-images")
      .getPublicUrl(project + "/" + item.name);
    return { name: item.name, url: urlData.publicUrl };
  });

  return NextResponse.json({ images });
}
