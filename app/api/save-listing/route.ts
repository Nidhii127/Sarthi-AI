import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase";
import { ListingSchema } from "@/lib/schema/listing";

export async function POST(request: Request) {
  try {
    // 1. Get the authenticated session/user using Supabase server client
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized / अनधिकृत (Please login again / कृपया पुनः लॉगिन करें)" },
        { status: 401 }
      );
    }

    // 2. Parse the request body
    const body = await request.json();

    // 3. Validate against Zod schema
    const parseResult = ListingSchema.safeParse(body);
    if (!parseResult.success) {
      console.error("[API Route] save-listing validation error:", parseResult.error.format());
      return NextResponse.json(
        {
          error: "Invalid listing data / अवैध लिस्टिंग डेटा",
          details: parseResult.error.issues.map((e) => `${e.path.join(".")}: ${e.message}`).join(", "),
        },
        { status: 400 }
      );
    }

    const listing = parseResult.data;

    // 4. Insert into Supabase table
    const { data, error: insertError } = await supabase
      .from("listings")
      .insert({
        seller_id: user.id,
        category: listing.category,
        sub_category: listing.sub_category,
        title: listing.title,
        description: listing.description,
        attributes: listing.attributes,
        size_chart: listing.size_chart,
        variants: listing.variants,
        pricing_inputs: listing.pricing_inputs,
        title_seo_keywords: listing.title_seo_keywords,
        source_log: listing.source_log,
        confidence_flags: listing.confidence_flags,
        status: "live",
      })
      .select("id")
      .single();

    if (insertError) {
      console.error("[API Route] save-listing database insert error:", insertError.message);
      return NextResponse.json(
        {
          error: "Database error / डेटाबेस त्रुटि",
          details: insertError.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ id: data.id }, { status: 200 });
  } catch (err) {
    console.error("[API Route] Unexpected save-listing error:", err);
    return NextResponse.json(
      {
        error: "An unexpected server error occurred / सर्वर में त्रुटि हुई।",
        details: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}
