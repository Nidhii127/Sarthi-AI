import { ai, GEMINI_MODEL } from "@/lib/gemini";
import { pc, INDEX_NAME, NAMESPACE, SEO_NAMESPACE } from "@/lib/pinecone";
import { ALLOWED_CATEGORIES, ListingSchema, type Listing } from "@/lib/schema/listing";
import { runSeoAgent, type SeoAgentResult } from "@/lib/pipeline/seo-agent";
import { Langfuse } from "langfuse";

// Initialize Langfuse conditionally to avoid crashing if credentials are missing
const langfuse =
  process.env.LANGFUSE_PUBLIC_KEY && process.env.LANGFUSE_SECRET_KEY
    ? new Langfuse({
        publicKey: process.env.LANGFUSE_PUBLIC_KEY,
        secretKey: process.env.LANGFUSE_SECRET_KEY,
        baseUrl: process.env.LANGFUSE_BASE_URL, // fix: was missing, causing 401s
      })
    : null;

export type RetrievedSchema = {
  category: string;
  attribute_group: string;
  size_chart_keys: string[];
  schema_json: string;
};

// ─── Step 1: Detect Category ──────────────────────────────────────────────────

async function detectCategory(
  imagePart: { inlineData: { mimeType: string; data: string } },
  audioPart: { inlineData: { mimeType: string; data: string } } | null,
  sellerText: string,
  parentTrace?: any
): Promise<typeof ALLOWED_CATEGORIES[number] | null> {
  const span = parentTrace ? parentTrace.span({ name: "detect-category" }) : null;

  const categoryPrompt = `You are a clothing category classifier.
Analyse the attached image of a clothing item.
Return ONLY this JSON object — nothing else, no markdown:
{ "category": "<one of the 9 strings listed below>" }

Allowed category strings (use EXACTLY one of these, character-for-character):
${ALLOWED_CATEGORIES.map((c) => `  "${c}"`).join("\n")}

The seller's description for context (do NOT trust it over the image for category):
"${sellerText}"`;

  try {
    const contentsParts: any[] = [imagePart];
    if (audioPart) contentsParts.push(audioPart);
    contentsParts.push({ text: categoryPrompt });

    const res = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: [
        {
          role: "user",
          parts: contentsParts,
        },
      ],
      config: {
        responseMimeType: "application/json",
        temperature: 0,
      },
    });

    const raw = (res.text ?? "").trim()
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    const parsed = JSON.parse(raw) as { category?: string };
    const detected = parsed.category?.trim() as typeof ALLOWED_CATEGORIES[number] | undefined;

    if (!detected || !ALLOWED_CATEGORIES.includes(detected)) {
      console.warn(`[detectCategory] Category "${detected}" is not in the allowed list.`);
      span?.end({ output: { detected, success: false } });
      return null;
    }

    span?.end({ output: { category: detected, success: true } });
    return detected;
  } catch (err) {
    console.error(`[detectCategory] Failed: ${(err as Error).message}`);
    span?.end({ output: { error: (err as Error).message } });
    return null;
  }
}

// ─── Step 2: Pinecone RAG Fetch ────────────────────────────────────────────────

async function fetchAttributeSchema(
  category: typeof ALLOWED_CATEGORIES[number],
  parentTrace?: any
): Promise<RetrievedSchema | null> {
  const span = parentTrace ? parentTrace.span({ name: "fetch-attribute-schema" }) : null;

  if (!pc) {
    console.warn("[fetchAttributeSchema] Pinecone not initialized — skipping schema lookup.");
    span?.end({ output: "skipped - Pinecone client not initialized" });
    return null;
  }

  try {
    const index = pc.index(INDEX_NAME).namespace(NAMESPACE);
    const result = await index.fetch({ ids: [category] });
    const record = result.records?.[category];

    if (!record || !record.metadata) {
      console.warn(`[fetchAttributeSchema] No schema record found for category "${category}".`);
      span?.end({ output: "not-found" });
      return null;
    }

    const meta = record.metadata as Record<string, unknown>;
    const retrieved: RetrievedSchema = {
      category: String(meta["category"] ?? category),
      attribute_group: String(meta["attribute_group"] ?? "unknown"),
      size_chart_keys: (meta["size_chart_keys"] as string[]) ?? [],
      schema_json: String(meta["schema_json"] ?? "{}"),
    };

    span?.end({ output: retrieved });
    return retrieved;
  } catch (err) {
    console.warn(`[fetchAttributeSchema] Pinecone fetch failed: ${(err as Error).message}`);
    span?.end({ output: { error: (err as Error).message } });
    return null;
  }
}

// ─── Step 2b: Pinecone RAG #2 — fetch SEO corpus patterns ────────────────────
//
// Queries the "seo-corpus" namespace with a Gemini text embedding of the
// category name, retrieves the top-3 nearest pattern documents, and returns
// their pattern_json fields joined by "---" for injection into the prompt.
// On failure: returns "" and the pipeline continues without RAG #2.

async function fetchSeoPatterns(
  category: string,
  parentTrace?: any // eslint-disable-line @typescript-eslint/no-explicit-any
): Promise<string> {
  const span = parentTrace ? parentTrace.span({ name: "fetch-seo-patterns" }) : null;

  if (!pc) {
    console.warn("[fetchSeoPatterns] Pinecone not initialized — skipping SEO corpus lookup.");
    span?.end({ output: "skipped - Pinecone client not initialized" });
    return "";
  }

  try {
    // Embed the category name to use as the query vector
    const embedResult = await ai.models.embedContent({
      model: "gemini-embedding-2",
      contents: `${category} clothing listing title description keywords India marketplace`,
      config: {
        outputDimensionality: 768,
      },
    });
    const queryVector = embedResult.embeddings?.[0]?.values;
    if (!queryVector || queryVector.length === 0) {
      console.warn(`[fetchSeoPatterns] Empty embedding returned for category "${category}".`);
      span?.end({ output: "empty-embedding" });
      return "";
    }

    const index = pc.index(INDEX_NAME).namespace(SEO_NAMESPACE);
    const queryResult = await index.query({
      vector: queryVector,
      topK: 3,
      includeMetadata: true,
    });

    if (!queryResult.matches || queryResult.matches.length === 0) {
      console.warn(`[fetchSeoPatterns] No matches found in seo-corpus for category "${category}".`);
      span?.end({ output: "no-matches" });
      return "";
    }

    const patterns = queryResult.matches
      .filter((m) => m.metadata?.pattern_json)
      .map((m) => String(m.metadata!.pattern_json))
      .join("\n---\n");

    span?.end({ output: { matchCount: queryResult.matches.length } });
    return patterns;
  } catch (err) {
    console.warn(`[fetchSeoPatterns] RAG #2 retrieval failed: ${(err as Error).message}`);
    span?.end({ output: { error: (err as Error).message } });
    return "";
  }
}

// ─── Step 3: Build System Prompt ──────────────────────────────────────────────

function buildSystemPrompt(
  retrievedSchema: RetrievedSchema | null,
  seoPatterns: string,
  seoAgent: SeoAgentResult | null
): string {
  const ragSection = retrievedSchema
    ? `=== RETRIEVED ATTRIBUTE SCHEMA (AGENTS.md §5c — RAG Collection #1) ===
The following schema was retrieved from the attribute database for category "${retrievedSchema.category}" (group: ${retrievedSchema.attribute_group}).
You MUST constrain all attribute values to the valid_values lists provided here.
Do not invent attribute values that are not in these lists.

${retrievedSchema.schema_json}

size_chart measurement keys for this category: [${retrievedSchema.size_chart_keys.join(", ")}]
Use ONLY these keys in measurements_cm. Do not add any other measurement keys.
`
    : `=== ATTRIBUTE SCHEMA (FALLBACK — RAG retrieval not available) ===
No schema was retrieved from the database. Use the attribute group rules in STEP 4 below.
Mark source_log.rag_schema as "rag_schema_failed" in your output.
`;

  // SEO guidance section — injected when either RAG #2 or the SEO agent produced output
  const hasSeoGuidance = seoPatterns.trim() || seoAgent;
  const seoSection = hasSeoGuidance
    ? `
=== SEO STYLE GUIDANCE (phrasing reference only — NOT content to copy) ===
The following patterns were retrieved from competitor listings and live search.
Use them ONLY to inform keyword placement, title structure, and description tone.
DO NOT copy any claim that isn't true of this specific product.
DO NOT add a keyword that contradicts the image analysis or seller's text.

${
  seoPatterns.trim()
    ? `RAG #2 corpus patterns:\n${seoPatterns}`
    : "(RAG #2 corpus not available)"
}

${
  seoAgent
    ? `Live SEO agent guidance (${seoAgent.searches_used} search(es) used):
Keyword themes: ${seoAgent.keyword_themes.join(", ")}
Title structure: ${seoAgent.title_structure_guidance}
Description tone: ${seoAgent.description_tone}`
    : "(SEO agent output not available)"
}
`
    : "";

  return `You are a product listing assistant for an Indian clothing marketplace.
You will receive:
  A) A photo of a clothing item.
  B) A short text description or voice transcript from a seller (may be in Hindi, Hinglish, or English).

Your job is to produce a single JSON object matching the schema at the bottom of this prompt.

${ragSection}
${seoSection}

=== SOURCE-OF-TRUTH PRIORITY RULES (AGENTS.md Section 7) ===
1. Analyze the image FIRST and independently, before reading the seller text/voice.
2. Category, color, pattern, visible construction details → PRIMARY SOURCE: image.
   If seller text contradicts the image on a visually-verifiable attribute, trust the image.
   Log the disagreement in confidence_flags with confidence "low".
3. Fabric composition, wash care, brand → PRIMARY SOURCE: seller text/voice ONLY.
   Never infer fabric from the image.
4. Size availability (which sizes exist) → seller text/voice.
5. Size measurements (inches primary, cm secondary) → PRIMARY SOURCE: seller text/voice (explicit numbers only).
   - If seller provides size labels (S/M/L/XL etc.) but no numeric measurements, auto-fill the size chart using the standard garment charts below, representing the values as strings like '30" (76cm)' in measurements_cm, and mark the size_measurements confidence flag as "medium" (reason: standard defaults used, seller must confirm).
   - If neither size labels nor numeric measurements are provided, use the standard garment charts for S/M/L/XL sizes and flag the confidence as "low" (requiring seller confirmation).
6. Weight, GST%, HSN code -> primary source is seller text/voice (explicit only).
   - Weight: If weight_grams is not explicitly stated by the seller, use these category-specific defaults and mark weight_grams confidence as "medium" (reason: default category weight assigned, seller must confirm):
     T-shirt: 200 | Shirt: 250 | Pant / Trouser: 400 | Shorts: 200 | Leggings: 150 | Dress: 300 | Maxi Dress: 400 | Kurti / Kurta: 300 | Saree: 500
   - GST: If seller_price is known, auto-calculate gst_percent: seller_price <= 2500 → gst_percent = 5, seller_price > 2500 → gst_percent = 18. Mark gst_percent confidence as "high" (reason: auto-derived from price). If seller_price is unknown, leave gst_percent as null and flag as "low" confidence.
   - HSN: Always auto-fill hsn_code from category and mark as "high" confidence (reason: auto-derived from category):
     T-shirt: 6109 | Shirt (men): 6205 | Shirt (women): 6206 | Pant/Trouser (men): 6203 | Pant/Trouser (women): 6204 | Shorts: 6203 | Leggings: 6104 | Dress (woven): 6204 | Dress (knit): 6104 | Maxi Dress: 6204 | Kurti / Kurta: 6211 | Saree (cotton): 5208 | Saree (synthetic): 5407 (Note: Determine gender for Shirt and Pant/Trouser from image/text, default to men's; determine fabric for Saree, default to cotton if unclear).
7. Stock qty, price, MRP → seller text/voice (explicit only). If not stated, set to null and flag as low confidence.

=== CONFIDENCE RULES (AGENTS.md Section 8) ===
- HIGH:   Both image and text agree, OR one unambiguous source exists.
- MEDIUM: One source available; the other structurally cannot verify it (e.g. image ↔ fabric).
- LOW:    Sources disagree, OR a required field has no source at all.
- HARD CAPS (never "high", no exceptions):
    fabric, fabric_composition, wash_care, stock_qty, seller_price, mrp, weight_grams (gst_percent and hsn_code are exceptions and can be marked as "high" confidence when auto-derived as specified).
- LOW confidence: always include a seller_question in plain Hindi or English.

=== SIZE CHART RULES (AGENTS.md Section 5d) ===
1. Use ONLY the measurement keys relevant for the category (e.g. chest, length). Note that keys should correspond to standard names like "chest", "waist", "length", "hip".
2. Store inches as the primary value with cm in brackets, formatted exactly as a string: '30" (76cm)' (e.g., '32" (81cm)', '25.5" (65cm)').
3. If size measurements are not explicitly specified by the seller, autofill using these Indian standard size charts (mark as medium confidence):
   - T-shirt / Shirt (keys: chest, length):
     XS: chest 30"/76cm, length 25"/63cm | S: chest 32"/81cm, length 25.5"/65cm | M: chest 34"/86cm, length 27"/68cm | L: chest 36"/91cm, length 28"/71cm | XL: chest 38"/96cm, length 29"/73cm | XXL: chest 40"/101cm, length 30"/76cm
   - Kurti/Kurta (keys: chest, length):
     XS: chest 30"/76cm, length 38"/96cm | S: chest 32"/81cm, length 40"/101cm | M: chest 34"/86cm, length 42"/106cm | L: chest 36"/91cm, length 44"/111cm | XL: chest 38"/96cm, length 46"/116cm | XXL: chest 40"/101cm, length 48"/121cm
   - Dress/Maxi Dress (keys: chest, waist, length):
     XS: chest 30"/76cm, waist 24"/60cm, length 35"/90cm | S: chest 32"/81cm, waist 25"/64cm, length 36"/92cm | M: chest 34"/86cm, waist 27"/68cm, length 37"/94cm | L: chest 36"/91cm, waist 28"/72cm, length 38"/96cm | XL: chest 38"/96cm, waist 30"/76cm, length 39"/98cm | XXL: chest 40"/101cm, waist 31"/80cm, length 39"/100cm
   - Pant/Trouser/Shorts (keys: waist, hip, length):
     XS: waist 24"/60cm, hip 33"/84cm, length 39"/99cm | S: waist 25"/64cm, hip 35"/88cm, length 39"/100cm | M: waist 27"/68cm, hip 36"/92cm, length 40"/101cm | L: waist 28"/72cm, hip 38"/96cm, length 40"/102cm | XL: waist 30"/76cm, hip 39"/100cm, length 41"/103cm | XXL: waist 31"/80cm, hip 41"/104cm, length 41"/104cm
   - Leggings (keys: waist, length):
     XS: waist 22"/56cm, length 37"/95cm | S: waist 24"/60cm, length 38"/97cm | M: waist 25"/64cm, length 39"/99cm | L: waist 27"/68cm, length 40"/101cm | XL: waist 28"/72cm, length 41"/103cm | XXL: waist 30"/76cm, length 41"/105cm
   - Saree: No size_chart array needed (set to empty array []). You must write fabric length as 5.5m and blouse piece as 0.8m in the description only.

=== ALLOWED CATEGORIES ===
Shirt | T-shirt | Pant / Trouser | Shorts | Leggings | Dress | Maxi Dress | Kurti / Kurta | Saree

=== FALLBACK ATTRIBUTE GROUP RULES (only used when RAG retrieval failed) ===
TOPS (Shirt, T-shirt, Kurti / Kurta): add sleeve_length, neck_type, fit
BOTTOMS (Pant/Trouser, Shorts, Leggings): add waist_rise, closure (or waist_type for Leggings), fit
FULL-BODY (Dress, Maxi Dress): add length, neck_type, sleeve_length, fit
ETHNIC additions (Kurti/Kurta, Saree): add work, set_components

=== MANDATORY confidence_flags ===
Include entries for:
- fabric: medium confidence (cannot be verified from image)
- stock_qty: low confidence (unless specified by seller)
- seller_price / mrp: low confidence (unless specified by seller)
- weight_grams: medium confidence (if default category weight used) or high (if explicit weight provided)
- size_measurements: medium confidence (if default size chart used) or low (if no sizes/measurements could be determined)
- gst_percent: high confidence (if derived from seller_price) or low (if seller_price unknown)
- hsn_code: high confidence (always auto-filled)
plus any attribute that could not be determined from image or text.

=== OUTPUT FORMAT ===
Return ONLY raw JSON — no markdown fences, nothing before { or after }.

{
  "category": "<one of the 9 allowed strings>",
  "sub_category": "<e.g. Oversized T-shirt>",
  "title": "<marketplace-style English title, 60-80 chars>",
  "title_seo_keywords": ["<kw1>", "<kw2>", "<kw3>"],
  "attributes": {
    "fabric": "<from text/voice only>",
    "pattern": "<from image — must be one of the valid_values in retrieved schema>",
    "color": "<from image>",
    "occasion": "<must be one of the valid_values in retrieved schema>",
    "net_quantity": "<from text/voice, or null>",
    "country_of_origin": "India",
    "<group-specific key>": "<value — must be one of the valid_values in retrieved schema>"
  },
  "description": "<2-3 sentence English description using only true, sourced attributes>",
  "size_chart": [
    { "size": "<size>", "measurements_cm": { "<key from size_chart_keys>": "34\" (86cm)" } }
  ],
  "variants": [
    { "size": "<size>", "color": "<from image>", "stock_qty": null }
  ],
  "pricing_inputs": {
    "seller_price": null,
    "mrp": null,
    "weight_grams": null,
    "gst_percent": null,
    "hsn_code": null
  },
  "confidence_flags": [
    { "field": "<name>", "confidence": "low|medium|high", "reason": "<why>", "seller_question": "<question or null>" }
  ],
  "source_log": {
    "category": "image",
    "color": "image",
    "pattern": "image",
    "fabric": "text",
    "fit": "text",
    "size_availability": "text",
    "rag_schema": "<'rag_schema' if retrieved successfully, 'rag_schema_failed' if retrieval failed>",
    "seller_price": "seller_clarification_needed",
    "mrp": "seller_clarification_needed",
    "weight_grams": "default|text",
    "gst_percent": "default|seller_clarification_needed",
    "hsn_code": "default",
    "stock_qty": "seller_clarification_needed",
    "size_measurements": "default|seller_clarification_needed",
    "title": "rag_seo_corpus|seo_agent",
    "description": "rag_seo_corpus|seo_agent"
  }
}`;
}

// ─── Pipeline Runner ─────────────────────────────────────────────────────────

export async function runListingPipeline(params: {
  imageBuffer: Buffer;
  imageMimeType: string;
  audioBuffer?: Buffer;
  audioMimeType?: string;
  text?: string;
}): Promise<Listing> {
  const sellerText = params.text || "";
  
  // Start Langfuse trace
  const trace = langfuse?.trace({
    name: "generate-listing-pipeline",
    input: {
      textLength: sellerText.length,
      hasAudio: !!params.audioBuffer,
      imageMimeType: params.imageMimeType,
    },
  });

  const imagePart = {
    inlineData: {
      mimeType: params.imageMimeType,
      data: params.imageBuffer.toString("base64"),
    },
  };

  const audioPart = params.audioBuffer && params.audioMimeType
    ? {
        inlineData: {
          mimeType: params.audioMimeType,
          data: params.audioBuffer.toString("base64"),
        },
      }
    : null;

  try {
    // Step 1: Detect category
    const detectedCategory = await detectCategory(imagePart, audioPart, sellerText, trace);

    // Step 2a: Fetch attribute schema (RAG #1)
    let retrievedSchema: RetrievedSchema | null = null;
    if (detectedCategory) {
      retrievedSchema = await fetchAttributeSchema(detectedCategory, trace);
    }

    // Step 2b: Fetch SEO corpus patterns (RAG #2)
    const seoPatterns = detectedCategory
      ? await fetchSeoPatterns(detectedCategory, trace)
      : "";

    // Step 2c: Run SEO Research Agent (AGENTS.md §10a)
    // Pass any attributes we know at this point (category + detected schema group)
    // The agent's output is style guidance only — not facts about the product.
    let seoAgentResult: SeoAgentResult | null = null;
    if (detectedCategory) {
      const knownAttrs: Record<string, string> = {};
      if (retrievedSchema?.attribute_group) {
        knownAttrs["attribute_group"] = retrievedSchema.attribute_group;
      }
      seoAgentResult = await runSeoAgent(detectedCategory, knownAttrs, seoPatterns, trace);
      console.log(`[Pipeline] SEO agent used ${seoAgentResult.searches_used} Tavily search(es).`);
    }

    // Step 3: Generate listing fields
    const systemPrompt = buildSystemPrompt(retrievedSchema, seoPatterns, seoAgentResult);
    const userContent = `Seller description: "${sellerText}"

Analyze the attached photo and any voice/text description.
Follow all rules in the system prompt. Return the JSON object only.`;

    const generateSpan = trace ? trace.span({ name: "generate-listing-fields" }) : null;

    let res;
    try {
      res = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: [
          {
            role: "user",
            parts: [
              imagePart,
              ...(audioPart ? [audioPart] : []),
              { text: userContent },
            ],
          },
        ],
        config: {
          systemInstruction: systemPrompt,
          responseMimeType: "application/json",
          temperature: 0.1,
        },
      });
      generateSpan?.end({ output: { success: true } });
    } catch (genErr) {
      generateSpan?.end({ output: { error: (genErr as Error).message } });
      throw genErr;
    }

    let rawText = (res.text ?? "").trim();
    let cleaned = rawText
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    let parsed = JSON.parse(cleaned);

    // Step 4: Validate with Zod & Retry once if validation fails
    const validationSpan = trace ? trace.span({ name: "zod-validation" }) : null;
    let validationResult = ListingSchema.safeParse(parsed);

    if (!validationResult.success) {
      console.warn("[Pipeline] Validation failed. Retrying once with error feedback...");
      const validationErrorMsg = validationResult.error.message;

      const retrySpan = trace ? trace.span({ name: "generate-listing-fields-retry" }) : null;
      const retryUserContent = `Previous generated output that failed validation:
${rawText}

Zod Validation Errors encountered:
${validationErrorMsg}

Please fix the errors above and generate the corrected JSON object matching the schema. Follow all rules.`;

      try {
        const retryRes = await ai.models.generateContent({
          model: GEMINI_MODEL,
          contents: [
            {
              role: "user",
              parts: [
                imagePart,
                ...(audioPart ? [audioPart] : []),
                { text: retryUserContent },
              ],
            },
          ],
          config: {
            systemInstruction: systemPrompt,
            responseMimeType: "application/json",
            temperature: 0.1,
          },
        });

        const retryRawText = (retryRes.text ?? "").trim();
        const retryCleaned = retryRawText
          .replace(/^```json\s*/i, "")
          .replace(/^```\s*/i, "")
          .replace(/\s*```$/i, "")
          .trim();

        parsed = JSON.parse(retryCleaned);
        validationResult = ListingSchema.safeParse(parsed);

        retrySpan?.end({ output: { parsed, success: validationResult.success } });
      } catch (retryErr) {
        retrySpan?.end({ output: { error: (retryErr as Error).message } });
        throw new Error(`Gemini self-correction retry call failed: ${(retryErr as Error).message}`);
      }
    }

    if (!validationResult.success) {
      const errDetail = validationResult.error.message;
      validationSpan?.end({ output: { error: errDetail } });
      throw new Error(`JSON schema validation failed after retry: ${errDetail}`);
    }

    validationSpan?.end({ output: validationResult.data });

    // Flush Langfuse events before returning
    await langfuse?.shutdownAsync();

    return validationResult.data;
  } catch (err) {
    await langfuse?.shutdownAsync();
    throw err;
  }
}
