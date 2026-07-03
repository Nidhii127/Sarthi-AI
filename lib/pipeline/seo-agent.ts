/**
 * lib/pipeline/seo-agent.ts — SEO Research Agent (AGENTS.md §10a)
 *
 * Agentic loop — the model decides after each Tavily search whether it has
 * sufficient keyword/structure signal, or whether to reformulate and search again.
 * Hard cap: 3 search attempts (AGENTS.md §10a).
 *
 * Output: style/structure guidance only — keyword patterns, title structure,
 * common phrasing — NEVER raw competitor text to copy.
 * This feeds into Gemini's field-generation prompt alongside RAG #2.
 */

import { ai, GEMINI_MODEL } from "@/lib/gemini";

const TAVILY_ENDPOINT = "https://api.tavily.com/search";
const MAX_ATTEMPTS = 3; // AGENTS.md §10a hard cap

// ─── Public types ─────────────────────────────────────────────────────────────

export type SeoAgentResult = {
  keyword_themes: string[];
  title_structure_guidance: string;
  description_tone: string;
  searches_used: number;
  source: "seo_agent";
};

// Internal Gemini judge response shapes
type JudgeSufficient = {
  sufficient: true;
  keyword_themes: string[];
  title_structure_guidance: string;
  description_tone: string;
};

type JudgeInsufficient = {
  sufficient: false;
  next_query: string;
};

type JudgeResponse = JudgeSufficient | JudgeInsufficient;

// ─── Tavily helper ────────────────────────────────────────────────────────────

type TavilyResult = {
  title: string;
  url: string;
  content: string;
};

async function tavilySearch(query: string): Promise<TavilyResult[]> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) throw new Error("TAVILY_API_KEY not set");

  const res = await fetch(TAVILY_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
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

// ─── Judge helper (Gemini call) ───────────────────────────────────────────────

async function judgeSignal(
  category: string,
  attributes: Record<string, string>,
  ragPatterns: string,
  searchResults: TavilyResult[],
  attemptNumber: number
): Promise<JudgeResponse> {
  const snippets = searchResults
    .map((r, i) => `[${i + 1}] Title: "${r.title}"\n    Snippet: "${r.content}"`)
    .join("\n\n");

  const attrSummary = Object.entries(attributes)
    .slice(0, 5) // only the most useful fields
    .map(([k, v]) => `${k}: ${v}`)
    .join(", ");

  const ragSection =
    ragPatterns.trim()
      ? `\nRAG pattern guidance already retrieved:\n${ragPatterns}\n`
      : "";

  const prompt = `You are an SEO keyword analyst for an Indian clothing marketplace.

Product: ${category}${attrSummary ? ` (${attrSummary})` : ""}
${ragSection}
Search results from attempt ${attemptNumber}:
${snippets}

Judge whether the search results above give SUFFICIENT keyword/structure signal to inform a compelling marketplace listing title and description for this specific product.

"Sufficient" means: you can identify ≥2 keyword themes, a clear title structure pattern, and a tone descriptor.

If SUFFICIENT, return ONLY this JSON (no markdown):
{
  "sufficient": true,
  "keyword_themes": ["<theme1>", "<theme2>", "<theme3>"],
  "title_structure_guidance": "<how to structure the title, e.g. 'fabric + color + garment type + occasion + gender'>",
  "description_tone": "<tone for description, e.g. 'confident, feature-first, 2 sentences, no superlatives'>"
}

If NOT SUFFICIENT, return ONLY this JSON (no markdown):
{
  "sufficient": false,
  "next_query": "<a more specific Tavily search query to try next>"
}`;

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

  return JSON.parse(raw) as JudgeResponse;
}

// ─── Fallback result ──────────────────────────────────────────────────────────

function fallbackResult(category: string, searchesUsed: number): SeoAgentResult {
  return {
    keyword_themes: [`${category}`, "India", "casual wear"],
    title_structure_guidance:
      "fabric + color + garment type + occasion — keep under 80 characters",
    description_tone:
      "Brief (2 sentences), feature-first, no superlatives",
    searches_used: searchesUsed,
    source: "seo_agent",
  };
}

// ─── Main agent function ──────────────────────────────────────────────────────

/**
 * Runs the SEO Research Agent for a specific product.
 *
 * @param category    - Detected category string (e.g. "Kurti / Kurta")
 * @param attributes  - Key attributes extracted so far (e.g. { color, fabric, pattern })
 * @param ragPatterns - Stringified pattern docs from RAG #2 retrieval (may be "")
 * @param parentTrace - Optional Langfuse parent trace for span creation
 * @returns SeoAgentResult — style/structure guidance only, never raw competitor text
 */
export async function runSeoAgent(
  category: string,
  attributes: Record<string, string>,
  ragPatterns: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  parentTrace?: any
): Promise<SeoAgentResult> {
  let searchesUsed = 0;
  // Start with a generic query template (Option B)
  let currentQuery = `${category} clothing listing title description keywords India marketplace`;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const span = parentTrace
      ? parentTrace.span({ name: `seo-agent-attempt-${attempt}` })
      : null;

    // Step 1: Tavily search
    let results: TavilyResult[] = [];
    try {
      results = await tavilySearch(currentQuery);
      searchesUsed++;
    } catch (err) {
      const msg = (err as Error).message;
      console.warn(`[SeoAgent] Tavily search failed (attempt ${attempt}): ${msg}`);
      span?.end({ output: { error: msg, query: currentQuery } });
      // On network failure, break and return fallback
      break;
    }

    if (results.length === 0) {
      console.warn(`[SeoAgent] No results returned for query: "${currentQuery}"`);
      span?.end({ output: { results: 0, query: currentQuery } });
      break;
    }

    // Step 2: Gemini judges whether signal is sufficient
    let judgment: JudgeResponse;
    try {
      judgment = await judgeSignal(
        category,
        attributes,
        ragPatterns,
        results,
        attempt
      );
    } catch (err) {
      const msg = (err as Error).message;
      console.warn(`[SeoAgent] Gemini judge failed (attempt ${attempt}): ${msg}`);
      span?.end({ output: { error: msg } });
      break;
    }

    span?.end({ output: { sufficient: judgment.sufficient, query: currentQuery, attempt } });

    // Step 3: sufficient → return; insufficient → reformulate if attempts remain
    if (judgment.sufficient) {
      console.log(`[SeoAgent] Sufficient signal after ${attempt} search(es).`);
      return {
        keyword_themes: judgment.keyword_themes,
        title_structure_guidance: judgment.title_structure_guidance,
        description_tone: judgment.description_tone,
        searches_used: searchesUsed,
        source: "seo_agent",
      };
    }

    if (attempt < MAX_ATTEMPTS) {
      console.log(
        `[SeoAgent] Insufficient signal — reformulating query (attempt ${attempt + 1}).`
      );
      currentQuery = judgment.next_query;
    } else {
      console.log(`[SeoAgent] Hard cap reached (${MAX_ATTEMPTS} attempts) — using fallback.`);
    }
  }

  // All attempts exhausted or errors encountered — return graceful fallback
  console.warn(
    `[SeoAgent] Returning fallback guidance for "${category}" (searches used: ${searchesUsed}).`
  );
  return fallbackResult(category, searchesUsed);
}
