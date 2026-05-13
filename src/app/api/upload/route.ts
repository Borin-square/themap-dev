import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";

const BUCKET = "brand-assets";
let bucketReady = false;

async function ensureBucket() {
  if (bucketReady) return;
  const sb = createServiceClient();
  const { error } = await sb.storage.createBucket(BUCKET, { public: true });
  if (error && !error.message.includes("already exists")) {
    console.error("Bucket creation:", error.message);
  }
  bucketReady = true;
}

export async function POST(req: NextRequest) {
  try {
    await ensureBucket();

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const company = formData.get("company") as string | null;

    if (!file || !company) {
      return NextResponse.json({ error: "File e company richiesti" }, { status: 400 });
    }

    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "File troppo grande (max 10MB)" }, { status: 400 });
    }

    const ext = file.name.split(".").pop() || "bin";
    const path = `${company}/${crypto.randomUUID()}.${ext}`;

    const sb = createServiceClient();
    const { error } = await sb.storage.from(BUCKET).upload(path, file, {
      contentType: file.type,
      upsert: false,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const { data: { publicUrl } } = sb.storage.from(BUCKET).getPublicUrl(path);

    return NextResponse.json({ url: publicUrl, name: file.name });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
