import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

const maxBytes = 4 * 1024 * 1024;

async function detectImageType(file: File): Promise<"image/jpeg" | "image/png" | "image/webp" | null> {
  if (file.size === 0 || file.size > maxBytes) return null;
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return "image/png";
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return "image/webp";
  return null;
}

export async function POST(request: Request) {
  const supabase = await getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "Profile photo storage is unavailable." }, { status: 503 });
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Sign in to upload a profile photo." }, { status: 401 });

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Choose an image file." }, { status: 400 });
  const contentType = await detectImageType(file);
  if (!contentType) return NextResponse.json({ error: "Choose a valid JPG, PNG, or WebP image under 4 MB." }, { status: 400 });

  const extension = contentType === "image/jpeg" ? "jpg" : contentType === "image/png" ? "png" : "webp";
  const path = `${user.id}/${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage.from("quatre-avatars").upload(path, file, { contentType, upsert: false });
  if (error) return NextResponse.json({ error: "The photo could not be uploaded. Please try again." }, { status: 400 });
  return NextResponse.json({ path }, { status: 201 });
}
