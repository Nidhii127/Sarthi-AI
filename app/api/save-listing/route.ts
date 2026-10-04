import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { ListingSchema } from "@/lib/schema/listing";

// Draft lifetime — reject saves for generations older than this
const DRAFT_TTL_MS = 60 * 60 * 1000; // 1 hour

export async function POST(request: Request) {
  try {
    // 1. Authenticate user using Firebase Admin SDK (same pattern as before)
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get("__session")?.value;
    let user: { uid: string; email?: string } | null = null;

    if (sessionCookie) {
      try {
        const decoded = await adminAuth.verifySessionCookie(sessionCookie, true);
        user = { uid: decoded.uid, email: decoded.email };
      } catch (err) {
        console.warn("[save-listing] Invalid session cookie:", err);
      }
    }

    if (!user) {
      // Fallback: check Authorization: Bearer <idToken>
      const authHeader = request.headers.get("authorization");
      if (authHeader?.startsWith("Bearer ")) {
        try {
          const idToken = authHeader.substring(7);
          const decoded = await adminAuth.verifyIdToken(idToken);
          user = { uid: decoded.uid, email: decoded.email };
        } catch (err) {
          console.warn("[save-listing] Invalid Bearer token:", err);
        }
      }
    }

    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized / अनधिकृत (Please login again / कृपया पुनः लॉगिन करें)" },
        { status: 401 }
      );
    }

    // 2. Parse the request body — now expects { listing, draftId }
    const body = await request.json();
    const { listing: listingBody, draftId } = body ?? {};

    // 3. Require draftId — the trust anchor linking this save to a real generate call
    if (!draftId || typeof draftId !== "string" || draftId.trim() === "") {
      console.warn("[save-listing] Missing draftId for uid:", user.uid);
      return NextResponse.json(
        {
          error:
            "Invalid request: listing session not found. Please generate a new listing / लिस्टिंग सेशन नहीं मिला। कृपया नई लिस्टिंग बनाएं।",
        },
        { status: 400 }
      );
    }

    // 4. Verify the draft belongs to the authenticated user.
    //    The Firestore path /users/{uid}/drafts/{draftId} is scoped to the
    //    server-verified uid — a user cannot read or use another user's drafts.
    //    We never trust a uid supplied by the client.
    const draftRef = adminDb
      .collection("users")
      .doc(user.uid) // server-side uid from verified token only
      .collection("drafts")
      .doc(draftId.trim());

    const draftSnap = await draftRef.get();

    if (!draftSnap.exists) {
      console.warn("[save-listing] Draft not found:", draftId, "uid:", user.uid);
      return NextResponse.json(
        {
          error:
            "Listing session expired or not found. Please generate a new listing / लिस्टिंग सेशन एक्सपायर हो गया। कृपया नई लिस्टिंग बनाएं।",
        },
        { status: 403 }
      );
    }

    // 5. Reject expired drafts
    const draftData = draftSnap.data()!;
    const createdAt = draftData.createdAt as FirebaseFirestore.Timestamp | undefined;
    if (createdAt) {
      const ageMs = Date.now() - createdAt.toMillis();
      if (ageMs > DRAFT_TTL_MS) {
        console.warn("[save-listing] Draft expired:", draftId, "age (ms):", ageMs);
        // Clean up the stale draft — best-effort, non-blocking
        await draftRef.delete().catch(() => {});
        return NextResponse.json(
          {
            error:
              "Listing session expired (over 1 hour). Please generate a new listing / लिस्टिंग सेशन एक्सपायर हो गया (1 घंटे से अधिक)। कृपया नई लिस्टिंग बनाएं।",
          },
          { status: 403 }
        );
      }
    }

    // 6. Validate the FINAL seller-edited listing against the Zod schema.
    //    The confirmation page is the source of truth for field values.
    //    We NEVER overwrite seller edits with the original draft values.
    const parseResult = ListingSchema.safeParse(listingBody);
    if (!parseResult.success) {
      console.error("[save-listing] Validation error:", parseResult.error.format());
      return NextResponse.json(
        {
          error: "Invalid listing data / अवैध लिस्टिंग डेटा",
          details: parseResult.error.issues
            .map((e) => `${e.path.join(".")}: ${e.message}`)
            .join(", "),
        },
        { status: 400 }
      );
    }

    const listing = parseResult.data;

    // 7. Atomically: write final listing + delete draft in one Firestore batch.
    //    If the batch fails nothing is persisted, preventing orphaned drafts.
    const listingsCollection = adminDb
      .collection("users")
      .doc(user.uid)
      .collection("listings");

    const newListingDoc = listingsCollection.doc();

    const listingData = {
      category: listing.category,
      sub_category: listing.sub_category ?? null,
      title: listing.title,
      description: listing.description ?? null,
      attributes: listing.attributes ?? {},
      size_chart: listing.size_chart ?? [],
      variants: listing.variants ?? [],
      pricing_inputs: listing.pricing_inputs ?? {},
      title_seo_keywords: listing.title_seo_keywords ?? [],
      source_log: listing.source_log ?? {},
      confidence_flags: listing.confidence_flags ?? [],
      status: "live",
      created_at: FieldValue.serverTimestamp(),
    };

    const batch = adminDb.batch();
    batch.set(newListingDoc, listingData); // save final seller-reviewed listing
    batch.delete(draftRef);               // remove draft — one-time use
    await batch.commit();

    return NextResponse.json({ id: newListingDoc.id }, { status: 200 });
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
