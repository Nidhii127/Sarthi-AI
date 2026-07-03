/**
 * test-brain.ts — Phase 2: Gemini brain + RAG Collection #1
 *
 * Pipeline (two-call approach):
 *   Call 1  → Gemini: detect category from image + text (returns single JSON { category })
 *   Fetch   → Pinecone: direct ID lookup for that category's attribute schema
 *   Call 2  → Gemini: full field generation with the retrieved schema injected into the prompt
 *
 * Fallback: if Pinecone retrieval fails at any point, the pipeline still completes
 * using ungrounded generation, and source_log.rag_schema is set to "rag_schema_failed".
 *
 * Run with:  npx tsx scripts/test-brain.ts
 */

import { config as dotenvConfig } from "dotenv";
import * as fs from "node:fs";
import * as path from "node:path";
import { GoogleGenAI } from "@google/genai";
import { Pinecone } from "@pinecone-database/pinecone";

// ---------------------------------------------------------------------------
// 1. Load .env.local — must happen before any process.env reads
// ---------------------------------------------------------------------------
dotenvConfig({ path: path.resolve(process.cwd(), ".env.local") });

const API_KEY         = process.env.GEMINI_API_KEY;
const MODEL           = process.env.GEMINI_MODEL;
const PINECONE_API_KEY = process.env.PINECONE_API_KEY;

if (!API_KEY) { console.error("❌  GEMINI_API_KEY missing from .env.local"); process.exit(1); }
if (!MODEL)   { console.error("❌  GEMINI_MODEL missing from .env.local");   process.exit(1); }
// PINECONE_API_KEY absence is handled as a fallback, not a hard exit

console.log(`✅  Loaded env — model: ${MODEL}`);
if (!PINECONE_API_KEY) {
  console.warn("⚠️   PINECONE_API_KEY not set — RAG retrieval will be skipped (fallback mode).");
}

// ---------------------------------------------------------------------------
// 2. Read the test image
// ---------------------------------------------------------------------------
const IMAGE_PATH = path.resolve(process.cwd(), "scripts/test-data/sample-shirt.webp");

if (!fs.existsSync(IMAGE_PATH)) {
  console.error(`❌  Image file not found: ${IMAGE_PATH}`);
  process.exit(1);
}

const imageBytes  = fs.readFileSync(IMAGE_PATH);
const imageBase64 = imageBytes.toString("base64");
console.log(`✅  Loaded image: ${IMAGE_PATH} (${imageBytes.length} bytes)`);

// ---------------------------------------------------------------------------
// 3. Seller's typed description (the input under test)
// ---------------------------------------------------------------------------
const SELLER_TEXT = "yellow tshirt, oversized, cotton, size m l xl";

// ---------------------------------------------------------------------------
// 4. Pinecone constants (must match seed-attribute-schema.ts)
// ---------------------------------------------------------------------------
const INDEX_NAME = "sarthi-ai-index";
const NAMESPACE  = "attribute-schemas";

/** Exact allowed category strings from AGENTS.md §5a */
const ALLOWED_CATEGORIES = [
  "Shirt",
  "T-shirt",
  "Pant / Trouser",
  "Shorts",
  "Leggings",
  "Dress",
  "Maxi Dress",
  "Kurti / Kurta",
  "Saree",
] as const;
type AllowedCategory = (typeof ALLOWED_CATEGORIES)[number];

// ---------------------------------------------------------------------------
// 5. Call 1 — Detect category (lightweight, image + text → single JSON field)
// ---------------------------------------------------------------------------
async function detectCategory(ai: GoogleGenAI): Promise<AllowedCategory | null> {
  console.log("\n📋  Call 1 — detecting category from image + text...");

  const categoryPrompt = `You are a clothing category classifier.
Analyse the attached image of a clothing item.
Return ONLY this JSON object — nothing else, no markdown:
{ "category": "<one of the 9 strings listed below>" }

Allowed category strings (use EXACTLY one of these, character-for-character):
${ALLOWED_CATEGORIES.map((c) => `  "${c}"`).join("\n")}

The seller's description for context (do NOT trust it over the image for category):
"${SELLER_TEXT}"`;

  try {
    const res = await ai.models.generateContent({
      model: MODEL!,
      contents: [
        {
          role: "user",
          parts: [
            { inlineData: { mimeType: "image/webp", data: imageBase64 } },
            { text: categoryPrompt },
          ],
        },
      ],
      config: {
        responseMimeType: "application/json",
        temperature: 0,
      },
    });

    const raw = (res.text ?? "").trim()
      .replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();

    const parsed = JSON.parse(raw) as { category?: string };
    const detected = parsed.category?.trim() as AllowedCategory | undefined;

    if (!detected || !ALLOWED_CATEGORIES.includes(detected)) {
      console.warn(`⚠️   Category "${detected}" is not in the allowed list — will fall back to ungrounded generation.`);
      return null;
    }

    console.log(`✅  Call 1 result — category: "${detected}"`);
    return detected;
  } catch (err) {
    console.warn(`⚠️   Call 1 failed (${(err as Error).message}) — will fall back to ungrounded generation.`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// 6. Pinecone fetch — direct ID lookup, no embedding, no similarity search
// ---------------------------------------------------------------------------
type RetrievedSchema = {
  category: string;
  attribute_group: string;
  size_chart_keys: string[];
  schema_json: string;
};

async function fetchAttributeSchema(category: AllowedCategory): Promise<RetrievedSchema | null> {
  if (!PINECONE_API_KEY) return null;

  console.log(`\n🔍  Fetching attribute schema for "${category}" from Pinecone...`);
  try {
    const pc    = new Pinecone({ apiKey: PINECONE_API_KEY });
    const index = pc.index(INDEX_NAME).namespace(NAMESPACE);
    const result = await index.fetch({ ids: [category] });
    const record = result.records?.[category];
    if (!record || !record.metadata) {
      console.warn(`⚠️   No schema record found for "${category}" — did you run seed-attribute-schema.ts?`);
      return null;
    }

    const meta = record.metadata as Record<string, unknown>;
    const retrieved: RetrievedSchema = {
      category:        String(meta["category"]        ?? category),
      attribute_group: String(meta["attribute_group"] ?? "unknown"),
      size_chart_keys: (meta["size_chart_keys"] as string[]) ?? [],
      schema_json:     String(meta["schema_json"]     ?? "{}"),
    };

    console.log(`✅  Retrieved schema — category: "${retrieved.category}", group: "${retrieved.attribute_group}"`);
    console.log(`    size_chart_keys: [${retrieved.size_chart_keys.join(", ")}]`);

    // Print the full retrieved schema so the user can verify it
    console.log("\n=== RETRIEVED ATTRIBUTE SCHEMA (from Pinecone) ===");
    try {
      console.log(JSON.stringify(JSON.parse(retrieved.schema_json), null, 2));
    } catch {
      console.log(retrieved.schema_json);
    }
    console.log("===================================================\n");

    return retrieved;
  } catch (err) {
    console.warn(`⚠️   Pinecone fetch failed (${(err as Error).message}) — continuing without RAG schema.`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// 7. Build the system prompt for Call 2
//    If a schema was retrieved, it is injected verbatim so Gemini is constrained
//    to the exact valid dropdown values. If not, the prompt falls back to the
//    full in-prompt attribute group rules (same as Phase 1).
// ---------------------------------------------------------------------------
function buildSystemPrompt(retrievedSchema: RetrievedSchema | null): string {
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

  return `You are a product listing assistant for an Indian clothing marketplace.
You will receive:
  A) A photo of a clothing item.
  B) A short text description from a seller (may be in Hindi, Hinglish, or English).

Your job is to produce a single JSON object matching the schema at the bottom of this prompt.

${ragSection}

=== SOURCE-OF-TRUTH PRIORITY RULES (AGENTS.md Section 7) ===
1. Analyze the image FIRST and independently, before reading the seller text.
2. Category, color, pattern, visible construction details → PRIMARY SOURCE: image.
   If seller text contradicts the image on a visually-verifiable attribute, trust the image.
   Log the disagreement in confidence_flags with confidence "low".
3. Fabric composition, wash care, brand → PRIMARY SOURCE: seller text ONLY.
   Never infer fabric from the image.
4. Size availability (which sizes exist) → seller text.
5. Size measurements (numeric cm) → seller text (explicit numbers only).
   If no numbers given, leave measurements as 0 and flag as low confidence.
6. Stock qty, price, MRP, weight, GST%, HSN code → seller text (explicit only).
   If not stated, set to null and flag as low confidence.

=== CONFIDENCE RULES (AGENTS.md Section 8) ===
- HIGH:   Both image and text agree, OR one unambiguous source exists.
- MEDIUM: One source available; the other structurally cannot verify it (e.g. image ↔ fabric).
- LOW:    Sources disagree, OR a required field has no source at all.
- HARD CAPS (never "high", no exceptions):
    fabric, fabric_composition, wash_care, stock_qty, seller_price, mrp, weight_grams, gst_percent, hsn_code.
- LOW confidence: always include a seller_question in plain Hindi or English.

=== SIZE CHART RULES (AGENTS.md Section 5d) ===
Use ONLY the measurement keys listed in the RETRIEVED ATTRIBUTE SCHEMA above (size_chart_keys).
If retrieval failed, use:
  Tops (Shirt/T-shirt/Kurti): chest_cm, length_cm
  Bottoms: waist_cm, hip_cm, length_cm
  Dress/Maxi Dress: bust_cm, waist_cm, length_cm
  Saree: empty array []

=== ALLOWED CATEGORIES ===
Shirt | T-shirt | Pant / Trouser | Shorts | Leggings | Dress | Maxi Dress | Kurti / Kurta | Saree

=== FALLBACK ATTRIBUTE GROUP RULES (only used when RAG retrieval failed) ===
TOPS (Shirt, T-shirt, Kurti / Kurta): add sleeve_length, neck_type, fit
BOTTOMS (Pant/Trouser, Shorts, Leggings): add waist_rise, closure (or waist_type for Leggings), fit
FULL-BODY (Dress, Maxi Dress): add length, neck_type, sleeve_length, fit
ETHNIC additions (Kurti/Kurta, Saree): add work, set_components

=== MANDATORY confidence_flags ===
Include entries for: fabric (medium), seller_price (low), mrp (low),
weight_grams (low), stock_qty (low), size_measurements (low),
plus any attribute that could not be determined from image or text.

=== OUTPUT FORMAT ===
Return ONLY raw JSON — no markdown fences, nothing before { or after }.

{
  "category": "<one of the 9 allowed strings>",
  "sub_category": "<e.g. Oversized T-shirt>",
  "title": "<marketplace-style English title, 60-80 chars>",
  "title_seo_keywords": ["<kw1>", "<kw2>", "<kw3>"],
  "attributes": {
    "fabric": "<from text only>",
    "pattern": "<from image — must be one of the valid_values in retrieved schema>",
    "color": "<from image>",
    "occasion": "<must be one of the valid_values in retrieved schema>",
    "net_quantity": "<from text, or null>",
    "country_of_origin": "India",
    "<group-specific key>": "<value — must be one of the valid_values in retrieved schema>"
  },
  "description": "<2-3 sentence English description using only true, sourced attributes>",
  "size_chart": [
    { "size": "<size>", "measurements_cm": { "<key from size_chart_keys>": 0 } }
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
    "weight_grams": "seller_clarification_needed",
    "stock_qty": "seller_clarification_needed",
    "size_measurements": "seller_clarification_needed"
  }
}`;
}

// ---------------------------------------------------------------------------
// 8. Call 2 — Full field generation with schema-grounded prompt
// ---------------------------------------------------------------------------
async function generateListing(
  ai: GoogleGenAI,
  retrievedSchema: RetrievedSchema | null,
): Promise<void> {
  const systemPrompt = buildSystemPrompt(retrievedSchema);
  const ragGrounded  = retrievedSchema !== null;

  console.log(`\n🚀  Call 2 — generating full listing (RAG grounded: ${ragGrounded})...\n`);

  const userContent = `Seller description: "${SELLER_TEXT}"

Analyze the attached photo and the seller description above.
Follow all rules in the system prompt. Return the JSON object only.`;

  let rawText: string | undefined;

  try {
    const response = await ai.models.generateContent({
      model: MODEL!,
      contents: [
        {
          role: "user",
          parts: [
            { inlineData: { mimeType: "image/webp", data: imageBase64 } },
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

    rawText = response.text ?? "";

    // Always log raw response first
    console.log("=".repeat(60));
    console.log("=== RAW GEMINI RESPONSE (Call 2) ===");
    console.log("=".repeat(60));
    console.log(rawText);
    console.log("=".repeat(60));
    console.log();

    // Parse
    let parsed: unknown;
    try {
      const cleaned = rawText
        .trim()
        .replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
      parsed = JSON.parse(cleaned);
    } catch (parseErr) {
      console.error("❌  JSON parse failed:", (parseErr as Error).message);
      console.error("    Raw text logged above.");
      process.exit(1);
    }

    console.log("=== PARSED JSON OUTPUT ===");
    console.log(JSON.stringify(parsed, null, 2));
    console.log();

    // -------------------------------------------------------------------------
    // Structural spot-checks
    // -------------------------------------------------------------------------
    const obj = parsed as Record<string, unknown>;

    // Required top-level keys
    const REQUIRED_KEYS = [
      "category", "sub_category", "title", "title_seo_keywords",
      "attributes", "description", "size_chart", "variants",
      "pricing_inputs", "confidence_flags", "source_log",
    ];
    const missing = REQUIRED_KEYS.filter((k) => !(k in obj));
    if (missing.length > 0) {
      console.warn(`⚠️   Missing top-level keys: ${missing.join(", ")}`);
    } else {
      console.log("✅  All required top-level keys present.");
    }

    // Hard-cap confidence check
    const HARD_CAP_FIELDS = [
      "fabric", "fabric_composition", "wash_care", "stock_qty",
      "seller_price", "mrp", "weight_grams", "gst_percent", "hsn_code",
    ];
    const flags = obj["confidence_flags"] as Array<{ field: string; confidence: string }> | undefined;
    if (Array.isArray(flags)) {
      let ok = true;
      for (const flag of flags) {
        const isHardCap = HARD_CAP_FIELDS.some((f) => flag.field.toLowerCase().includes(f));
        if (isHardCap && flag.confidence === "high") {
          console.warn(`⚠️   Hard-cap violation: "${flag.field}" is "high" — AGENTS.md §8 forbids this.`);
          ok = false;
        }
      }
      if (ok) console.log(`✅  No hard-cap confidence violations. ${flags.length} field(s) flagged.`);
    } else {
      console.warn("⚠️   confidence_flags is missing or not an array.");
    }

    // T-shirt size chart: no waist_cm
    if (obj["category"] === "T-shirt" && Array.isArray(obj["size_chart"])) {
      const chart = obj["size_chart"] as Array<{ measurements_cm?: Record<string, unknown> }>;
      const hasWaist = chart.some((r) => r.measurements_cm && "waist_cm" in r.measurements_cm);
      if (hasWaist) {
        console.warn("⚠️   size_chart for T-shirt contains waist_cm — AGENTS.md §5d forbids this.");
      } else {
        console.log("✅  size_chart keys correct for T-shirt (chest_cm + length_cm only).");
      }
    }

    // source_log checks
    const srcLog = obj["source_log"] as Record<string, string> | undefined;
    if (srcLog) {
      if (srcLog["color"] !== "image") {
        console.warn(`⚠️   source_log.color = "${srcLog["color"]}" — expected "image".`);
      } else {
        console.log('✅  source_log.color = "image" ✓');
      }

      const ragStatus = srcLog["rag_schema"];
      if (ragStatus === "rag_schema_failed") {
        console.warn("⚠️   source_log.rag_schema = 'rag_schema_failed' — listing generated without schema grounding.");
      } else if (ragStatus === "rag_schema") {
        console.log("✅  source_log.rag_schema = 'rag_schema' — attributes were schema-grounded ✓");
      } else {
        console.warn(`⚠️   source_log.rag_schema = "${ragStatus}" — unexpected value.`);
      }
    }

    // Attribute value validation against retrieved schema (if available)
    if (retrievedSchema && obj["attributes"]) {
      const attrs = obj["attributes"] as Record<string, unknown>;
      let schemaObj: Record<string, { valid_values?: string[] }> = {};
      try {
        const parsed = JSON.parse(retrievedSchema.schema_json) as {
          universal?: Record<string, { valid_values?: string[] }>;
          group_specific?: Record<string, { valid_values?: string[] }>;
        };
        schemaObj = { ...parsed.universal, ...parsed.group_specific };
      } catch { /* ignore parse errors in schema validation */ }

      let attrOk = true;
      for (const [key, valDef] of Object.entries(schemaObj)) {
        if (!valDef.valid_values) continue; // no constraint (e.g. color, fabric)
        const actual = attrs[key];
        if (actual !== null && actual !== undefined && !valDef.valid_values.includes(String(actual))) {
          console.warn(`⚠️   attributes.${key} = "${actual}" — not in valid_values [${valDef.valid_values.join(", ")}]`);
          attrOk = false;
        }
      }
      if (attrOk) console.log("✅  All constrained attribute values are within retrieved schema valid_values.");
    }

    console.log("\n✅  Done.\n");

  } catch (apiErr) {
    const err = apiErr as Error;
    console.error("\n❌  Call 2 Gemini API failed:", err.message);
    if (rawText !== undefined) { console.error("\n    Partial raw response:"); console.error(rawText); }
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// 9. Main pipeline
// ---------------------------------------------------------------------------
async function main(): Promise<void> {
  const ai = new GoogleGenAI({ apiKey: API_KEY! });

  // Step 1: detect category
  const detectedCategory = await detectCategory(ai);

  // Step 2: fetch schema (or null on failure)
  let retrievedSchema: RetrievedSchema | null = null;
  if (detectedCategory) {
    retrievedSchema = await fetchAttributeSchema(detectedCategory);
  } else {
    console.warn("⚠️   Category detection failed — skipping Pinecone fetch, using fallback prompt.");
  }

  // Step 3: generate full listing
  await generateListing(ai, retrievedSchema);
}

main().catch((err: Error) => {
  console.error("❌  Unhandled error:", err.message);
  process.exit(1);
});
