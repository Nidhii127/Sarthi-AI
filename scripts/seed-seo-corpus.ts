/**
 * seed-seo-corpus.ts — Phase 7: Seed RAG Collection #2 (SEO Corpus)
 *
 * For each of the 9 clothing categories (AGENTS.md §5a):
 *   1. Run up to 3 Tavily searches (hard cap — AGENTS.md §10a).
 *   2. For each useful search result (Option A per approval), call Gemini to extract
 *      structural title/description patterns — keyword themes, structure, tone. NOT raw text.
 *   3. Embed each pattern document using Gemini text-embedding-004 (768 dims).
 *   4. Upsert to Pinecone namespace "seo-corpus" in index "sarthi-ai-index".
 *
 * OFFLINE, MANUALLY-RUN only — never called by the live app (AGENTS.md §5e).
 * Run with:  npm run seed-seo-corpus
 */

import { config as dotenvConfig } from "dotenv";
import * as path from "node:path";
import { GoogleGenAI } from "@google/genai";
import { Pinecone } from "@pinecone-database/pinecone";

// ---------------------------------------------------------------------------
// 1. Load .env.local
// ---------------------------------------------------------------------------
dotenvConfig({ path: path.resolve(process.cwd(), ".env.local") });

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const PINECONE_API_KEY = process.env.PINECONE_API_KEY;
const TAVILY_API_KEY = process.env.TAVILY_API_KEY;

if (!GEMINI_API_KEY) {
  console.error("❌  GEMINI_API_KEY is missing from .env.local");
  process.exit(1);
}
if (!PINECONE_API_KEY) {
  console.error("❌  PINECONE_API_KEY is missing from .env.local");
  process.exit(1);
}
if (!TAVILY_API_KEY) {
  console.error("❌  TAVILY_API_KEY is missing from .env.local");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// 2. Constants
// ---------------------------------------------------------------------------
const INDEX_NAME = "sarthi-ai-index";
const SEO_NAMESPACE = "seo-corpus";
const EMBEDDING_MODEL = "gemini-embedding-2";
const DIMENSION = 768; // target dimension size to match index spec
const GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-2.0-flash";
const MAX_SEARCHES_PER_CATEGORY = 3; // AGENTS.md §10a hard cap
const TAVILY_ENDPOINT = "https://api.tavily.com/search";

/** All 9 categories from AGENTS.md §5a — do not alter this list */
const CATEGORIES = [
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

// ---------------------------------------------------------------------------
// 3. Types
// ---------------------------------------------------------------------------
type TavilyResult = {
  title: string;
  url: string;
  content: string;
};

type PatternDoc = {
  category: string;
  title_structure: string;
  keyword_themes: string[];
  tone_descriptors: string[];
  avoid: string[];
};

// ---------------------------------------------------------------------------
// 4. Tavily search helper
// ---------------------------------------------------------------------------
async function tavilySearch(query: string): Promise<TavilyResult[]> {
  const res = await fetch(TAVILY_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${TAVILY_API_KEY}`,
    },
    body: JSON.stringify({
      query,
      search_depth: "basic",
      include_answer: false,
      include_raw_content: false,
      include_images: false,
      max_results: 5,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Tavily HTTP ${res.status}: ${body}`);
  }

  const data = (await res.json()) as { results?: TavilyResult[] };
  return data.results ?? [];
}

// ---------------------------------------------------------------------------
// 5. Pattern extraction helper — Gemini call per result snippet (Option A)
//    Extracts structural/stylistic patterns only — never raw competitor text.
// ---------------------------------------------------------------------------
async function extractPattern(
  ai: GoogleGenAI,
  category: string,
  resultTitle: string,
  resultSnippet: string
): Promise<PatternDoc | null> {
  const prompt = `You are a listing-quality analyst for an Indian clothing marketplace.

Given the following search result for a "${category}" clothing product listing:
Title: "${resultTitle}"
Snippet: "${resultSnippet}"

Extract ONLY the structural and stylistic patterns — NOT the raw content itself.
Do not quote any specific brand name, price, or product claim from the snippet.

Return ONLY this JSON object (no markdown fences, no text before or after):
{
  "category": "${category}",
  "title_structure": "<describe how the title is structured, e.g. 'fabric + occasion + garment type + target gender'>",
  "keyword_themes": ["<theme1>", "<theme2>", "<theme3>"],
  "tone_descriptors": ["<tone1>", "<tone2>"],
  "avoid": ["<pattern or phrase to avoid in titles/descriptions>"]
}`;

  try {
    const res = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: { responseMimeType: "application/json", temperature: 0 },
    });

    const raw = (res.text ?? "")
      .trim()
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    return JSON.parse(raw) as PatternDoc;
  } catch (err) {
    console.warn(
      `    ⚠️  Pattern extraction failed for "${resultTitle.slice(0, 50)}": ${(err as Error).message}`
    );
    return null;
  }
}

// ---------------------------------------------------------------------------
// 6. Embedding helper
// ---------------------------------------------------------------------------
async function embedText(ai: GoogleGenAI, text: string): Promise<number[]> {
  const result = await ai.models.embedContent({
    model: EMBEDDING_MODEL,
    contents: text,
    config: {
      outputDimensionality: DIMENSION,
    },
  });
  const values = result.embeddings?.[0]?.values;
  if (!values || values.length !== DIMENSION) {
    throw new Error(
      `Unexpected embedding dimension: got ${values?.length ?? 0}, expected ${DIMENSION}`
    );
  }
  return values;
}

// ---------------------------------------------------------------------------
// 7. Main seed function
// ---------------------------------------------------------------------------
async function seedSeoCorpus(): Promise<void> {
  console.log("🔧  Initialising Gemini and Pinecone clients...");
  const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY! });
  const pc = new Pinecone({ apiKey: PINECONE_API_KEY! });

  // Verify the index exists (it was created in Phase 2 by seed-attribute-schema.ts)
  const existingIndexes = await pc.listIndexes();
  const indexExists =
    existingIndexes.indexes?.some((i) => i.name === INDEX_NAME) ?? false;

  if (!indexExists) {
    console.log(
      `🔧  Index "${INDEX_NAME}" not found — creating (dim=${DIMENSION}, metric=cosine)...`
    );
    await pc.createIndex({
      name: INDEX_NAME,
      dimension: DIMENSION,
      metric: "cosine",
      spec: { serverless: { cloud: "aws", region: "us-east-1" } },
    });
    console.log("⏳  Waiting for index to become ready...");
    let ready = false;
    for (let attempt = 0; attempt < 30; attempt++) {
      await new Promise((r) => setTimeout(r, 5000));
      const desc = await pc.describeIndex(INDEX_NAME);
      if (desc.status?.ready) {
        ready = true;
        break;
      }
      process.stdout.write(".");
    }
    if (!ready) {
      console.error("\n❌  Index did not become ready within 150s — re-run the script.");
      process.exit(1);
    }
    console.log("\n✅  Index ready.");
  } else {
    console.log(`✅  Index "${INDEX_NAME}" already exists.`);
  }

  const index = pc.index(INDEX_NAME).namespace(SEO_NAMESPACE);
  let totalUpserted = 0;

  for (const category of CATEGORIES) {
    console.log(`\n📂  Category: ${category}`);
    type PineconeRecord = { id: string; values: number[]; metadata: Record<string, string | number | boolean | string[]> };
    const patternDocs: PineconeRecord[] = [];
    let searchCount = 0;
    let docIndex = 0;

    for (let attempt = 1; attempt <= MAX_SEARCHES_PER_CATEGORY; attempt++) {
      // Option B: generic query template
      const query = `${category} clothing listing title description keywords India marketplace`;
      console.log(`  🔍  Search ${attempt}/${MAX_SEARCHES_PER_CATEGORY}: "${query}"`);

      let results: TavilyResult[] = [];
      try {
        results = await tavilySearch(query);
        searchCount++;
      } catch (err) {
        console.warn(
          `  ⚠️  Tavily search failed (attempt ${attempt}): ${(err as Error).message}`
        );
        break; // stop searching for this category on network error
      }

      if (results.length === 0) {
        console.log(`  ℹ️  No results returned — stopping searches for "${category}".`);
        break;
      }

      // Option A: extract pattern per result snippet
      for (const result of results) {
        if (patternDocs.length >= 3) {
          break;
        }

        const hasContent = result.content?.trim() || result.title?.trim();
        if (!hasContent) continue;

        // Introduce a small sleep delay (e.g. 4.2s) to stay under Gemini free-tier 15 RPM rate limits
        await new Promise((r) => setTimeout(r, 4200));

        const pattern = await extractPattern(
          ai,
          category,
          result.title ?? "",
          result.content ?? ""
        );
        if (!pattern) continue;

        // Build the text to embed — structured summary, not raw content
        const patternText = [
          `Category: ${pattern.category}`,
          `Title structure: ${pattern.title_structure}`,
          `Keywords: ${pattern.keyword_themes.join(", ")}`,
          `Tone: ${pattern.tone_descriptors.join(", ")}`,
          `Avoid: ${pattern.avoid.join(", ")}`,
        ].join(". ");

        // Introduce another small sleep before the embedding call to prevent embedding rate limits
        await new Promise((r) => setTimeout(r, 2000));

        let embedding: number[];
        try {
          embedding = await embedText(ai, patternText);
        } catch (err) {
          console.warn(
            `    ⚠️  Embedding failed for pattern ${docIndex}: ${(err as Error).message}`
          );
          continue;
        }

        const id = `${category}-${docIndex}`;
        patternDocs.push({
          id,
          values: embedding,
          metadata: {
            category,
            pattern_json: JSON.stringify(pattern),
          },
        });
        console.log(`    ✅  Pattern doc ${id} extracted & embedded`);
        docIndex++;
      }

      // If we have ≥3 pattern docs, we have sufficient signal — stop early
      if (patternDocs.length >= 3) {
        console.log(`  ✋  Sufficient patterns collected (${patternDocs.length}) — stopping early.`);
        break;
      }

      // Small rate-limit delay between Tavily calls
      if (attempt < MAX_SEARCHES_PER_CATEGORY) {
        await new Promise((r) => setTimeout(r, 600));
      }
    }

    if (patternDocs.length === 0) {
      console.warn(
        `  ⚠️  No pattern documents produced for "${category}" — skipping upsert.`
      );
      continue;
    }

    // Upsert all pattern docs for this category in one call
    await index.upsert({ records: patternDocs });
    totalUpserted += patternDocs.length;
    console.log(
      `  📥  Upserted ${patternDocs.length} pattern doc(s) for "${category}" (${searchCount} Tavily search(es) used)`
    );
  }

  console.log(`\n✅  SEO corpus seed complete.`);
  console.log(`   Namespace: "${SEO_NAMESPACE}" in index "${INDEX_NAME}"`);
  console.log(`   Total pattern docs upserted: ${totalUpserted}\n`);
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------
seedSeoCorpus().catch((err: Error) => {
  console.error("❌  Unhandled error:", err.message);
  process.exit(1);
});
