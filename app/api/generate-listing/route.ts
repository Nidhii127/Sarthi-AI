import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { runListingPipeline } from "@/lib/pipeline/generate";

export const maxDuration = 60;

// ─── Server-side upload limits ────────────────────────────────────────────────
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;  // 4 MB (safe for Vercel 4.5 MB request body limit)
const MAX_AUDIO_BYTES = 4 * 1024 * 1024;  // 4 MB (safe for Vercel 4.5 MB request body limit)
const MAX_TEXT_CHARS  = 5_000;

export async function POST(request: Request) {
  try {
    // ── 1. Authenticate via Firebase session cookie (same pattern as save-listing) ──
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get("__session")?.value;
    let uid: string | null = null;

    if (sessionCookie) {
      try {
        const decoded = await adminAuth.verifySessionCookie(sessionCookie, true);
        uid = decoded.uid;
      } catch (err) {
        console.warn("[generate-listing] Invalid session cookie:", err);
      }
    }

    if (!uid) {
      // Fallback: Authorization: Bearer <idToken>
      const authHeader = request.headers.get("authorization");
      if (authHeader?.startsWith("Bearer ")) {
        try {
          const decoded = await adminAuth.verifyIdToken(authHeader.substring(7));
          uid = decoded.uid;
        } catch (err) {
          console.warn("[generate-listing] Invalid Bearer token:", err);
        }
      }
    }

    if (!uid) {
      return NextResponse.json(
        { error: "Unauthorized / अनधिकृत (Please login again / कृपया पुनः लॉगिन करें)" },
        { status: 401 }
      );
    }

    // ── 2. Parse multipart form ───────────────────────────────────────────────
    const formData = await request.formData();
    const image = formData.get("image") as File | null;
    const audio = formData.get("audio") as File | null;
    const text  = formData.get("text")  as string | null;

    // ── 3. Input validation ───────────────────────────────────────────────────
    if (!image) {
      return NextResponse.json(
        { error: "Product photo is required / फोटो अपलोड करना आवश्यक है।" },
        { status: 400 }
      );
    }

    if (image.size > MAX_IMAGE_BYTES) {
      return NextResponse.json(
        { error: `Image is too large (max 4 MB) / फोटो बहुत बड़ी है (अधिकतम 4 MB)` },
        { status: 413 }
      );
    }

    const hasAudio = audio && audio.size > 0;
    const hasText  = text && text.trim().length > 0;

    if (hasAudio && audio.size > MAX_AUDIO_BYTES) {
      return NextResponse.json(
        { error: `Audio recording is too large (max 4 MB) / रिकॉर्डिंग बहुत बड़ी है (अधिकतम 4 MB)` },
        { status: 413 }
      );
    }

    if (hasText && text!.trim().length > MAX_TEXT_CHARS) {
      return NextResponse.json(
        { error: `Description is too long (max ${MAX_TEXT_CHARS} characters) / विवरण बहुत लंबा है (अधिकतम ${MAX_TEXT_CHARS} अक्षर)` },
        { status: 400 }
      );
    }

    if (!hasAudio && !hasText) {
      return NextResponse.json(
        { error: "Please record your voice or type a description / कृपया आवाज़ रिकॉर्ड करें या विवरण टाइप करें।" },
        { status: 400 }
      );
    }

    // ── 4. Convert to buffers ─────────────────────────────────────────────────
    const imageBuffer   = Buffer.from(await image.arrayBuffer());
    const imageMimeType = image.type;

    let audioBuffer: Buffer | undefined;
    let audioMimeType: string | undefined;
    if (hasAudio) {
      audioBuffer   = Buffer.from(await audio.arrayBuffer());
      audioMimeType = audio.type;
    }

    // ── 5. Run pipeline with retry-once (AGENTS.md §11) ──────────────────────
    let result = null;
    let attempts = 0;
    const maxAttempts = 2;
    let lastError: unknown = null;

    while (attempts < maxAttempts) {
      try {
        attempts++;
        result = await runListingPipeline({
          imageBuffer,
          imageMimeType,
          audioBuffer,
          audioMimeType,
          text: text || undefined,
        });
        break;
      } catch (err) {
        lastError = err;
        console.warn(`[generate-listing] Attempt ${attempts} failed: ${(err as Error).message}`);
        if (attempts >= maxAttempts) break;
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    if (!result) {
      const isRateLimit = lastError instanceof Error && lastError.message.includes("429");
      const userMessage = isRateLimit
        ? "Too many requests. Please wait a minute and try again / बहुत सारे अनुरोध। कृपया कुछ समय बाद प्रयास करें।"
        : "AI listing generation failed. Please check inputs and try again / लिस्टिंग बनाने में त्रुटि हुई। कृपया दोबारा प्रयास करें।";

      return NextResponse.json(
        {
          error: userMessage,
          details: lastError instanceof Error ? lastError.message : String(lastError),
        },
        { status: 500 }
      );
    }

    // ── 6. Write Firestore draft (trust anchor) ─────────────────────────────
    //
    // This draft proves that the listing came from an authenticated generate
    // call for this specific uid. save-listing will verify and delete it.
    // We never store image/audio bytes here — only the JSON payload.
    let draftId: string | null = null;
    const _tDraft = Date.now();
    try {
      const draftRef = adminDb
        .collection("users")
        .doc(uid)
        .collection("drafts")
        .doc(); // auto-generated ID

      await draftRef.set({
        uid,
        listing: result,
        createdAt: FieldValue.serverTimestamp(),
        status: "draft",
      });
      draftId = draftRef.id;
      console.log(`[timing] Firestore draft write: ${Date.now() - _tDraft}ms → draftId=${draftId}`);
    } catch (draftErr) {
      // Draft write failure is non-fatal for generation — log and continue.
      // save-listing will reject without a valid draft, but generation itself
      // succeeding is the primary concern here.
      console.log(`[timing] Firestore draft write FAILED: ${Date.now() - _tDraft}ms`);
      console.error("[generate-listing] Failed to write Firestore draft:", draftErr);
    }

    return NextResponse.json({ ...result, draftId });
  } catch (err) {
    console.error("[generate-listing] Unexpected error:", err);
    return NextResponse.json(
      {
        error: "An unexpected server error occurred / सर्वर में त्रुटि हुई।",
        details: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}
