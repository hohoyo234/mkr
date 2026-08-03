import { desc } from "drizzle-orm";
import { getDb } from "../../../db";
import { activityRecords } from "../../../db/schema";

export async function GET() {
  try {
    const records = await getDb()
      .select()
      .from(activityRecords)
      .orderBy(desc(activityRecords.createdAt), desc(activityRecords.id))
      .limit(100);
    return Response.json({ records });
  } catch {
    return Response.json({ records: [] });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      zone?: string;
      title?: string;
      detail?: string;
      amountCents?: number | null;
    };
    if (!body.zone?.trim() || !body.title?.trim()) {
      return Response.json({ error: "zone and title are required" }, { status: 400 });
    }
    const [record] = await getDb()
      .insert(activityRecords)
      .values({
        zone: body.zone.trim(),
        title: body.title.trim(),
        detail: body.detail?.trim() || "",
        amountCents: body.amountCents ?? null,
        createdAt: Date.now(),
      })
      .returning();
    return Response.json({ record }, { status: 201 });
  } catch {
    return Response.json({ error: "Unable to save record" }, { status: 500 });
  }
}
