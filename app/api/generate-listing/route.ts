import { NextResponse } from "next/server";
import { runListingPipeline } from "@/lib/pipeline/generate";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const image = formData.get("image") as File | null;
    const audio = formData.get("audio") as File | null;
    const text = formData.get("text") as string | null;

    if (!image) {
      return NextResponse.json(
        { error: "Product photo is required / फोटो अपलोड करना आवश्यक है।" },
        { status: 400 }
      );
    }

    const hasAudio = audio && audio.size > 0;
    const hasText = text && text.trim().length > 0;

    if (!hasAudio && !hasText) {
      return NextResponse.json(
        { error: "Please record your voice or type a description / कृपया आवाज़ रिकॉर्ड करें या विवरण टाइप करें।" },
        { status: 400 }
      );
    }

    // Convert image to buffer
    const imageBuffer = Buffer.from(await image.arrayBuffer());
    const imageMimeType = image.type;

    // Convert audio to buffer if present
    let audioBuffer: Buffer | undefined;
    let audioMimeType: string | undefined;
    if (hasAudio) {
      audioBuffer = Buffer.from(await audio.arrayBuffer());
      audioMimeType = audio.type;
    }

    // Implement a retry-once loop for Gemini API calls / general pipeline errors per AGENTS.md §11
    let result = null;
    let attempts = 0;
    const maxAttempts = 2;
    let lastError: any = null;

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
        break; // Succeeded! Break loop.
      } catch (err) {
        lastError = err;
        console.warn(`[API Route] generate-listing attempt ${attempts} failed: ${(err as Error).message}`);
        if (attempts >= maxAttempts) {
          break;
        }
        // Brief sleep before retrying
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

    return NextResponse.json(result);
  } catch (err) {
    console.error("[API Route] Unexpected generate-listing error:", err);
    return NextResponse.json(
      {
        error: "An unexpected server error occurred / सर्वर में त्रुटि हुई।",
        details: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}
