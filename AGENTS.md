# AGENTS.md — Project Instructions

This file is the single source of truth for any agent (or human) working on this codebase. Read this in full before starting any task. If something you're about to build isn't covered here, stop and ask rather than inventing a default — several scope decisions in this project were made by deliberately *rejecting* alternatives, not by omission.

---

## 1. What this project is

A web app that lets a clothing seller create a marketplace-style product listing by speaking (in Hindi, Hinglish, or any Indian language) or typing, plus uploading one photo of the product. The system transcribes, cross-checks the spoken/typed claims against the photo, generates every listing field (title, description, attributes, size chart, variants, pricing inputs) in English, flags anything it isn't confident about, and lets the seller confirm before the listing goes live in a dashboard.

**Core problem this solves:** non-English-fluent, Tier 2/3 sellers struggle with marketplace listing forms that require typed English keywords and dropdown attribute selection. This removes that barrier without sacrificing listing accuracy (inaccurate listings drive returns).

**Project name:** not yet decided — use a placeholder (`listing-agent` or similar) in code/repo naming until confirmed. Do not invent a final name.

---

## 2. Scope — what's in, what's explicitly out

### In scope
- Single product category domain: **clothing only** (see Section 5 for the exact category list)
- **One product per session** — one photo, one voice/text input, one listing generated. Never design for multi-product batch input.
- Voice (recorded in-browser) OR typed text as input — both must be supported, same downstream pipeline
- Full field generation: category, sub-category, title, attributes, description, size chart, variants, pricing inputs
- A seller-facing confirmation/review step before anything is saved
- One dashboard shell, mostly mock, with one fully functional section

### Explicitly out of scope — do not build these, even if they seem natural to add
- **Image editing or image generation of any kind.** The seller's raw uploaded photo is used as-is. Do not add background removal, upscaling, angle generation, or any image processing step. This was deliberately descoped — do not reintroduce it without explicit instruction.
- **Bulk/multi-product upload.** Single product per session only.
- **Replicating Meesho's (or any platform's) actual dashboard or functionality.** Visual/UI style reference only comes from SellerShip (see Section 14) — never clone their features, credit system, or specific tools.
- **A real payment, order, returns, or claims system.** These dashboard sections are static mock data only — see Section 13.
- **Self-hosted models of any kind** (no self-hosted Whisper, no self-hosted Qwen/VLM, no self-hosted vector DB, no self-hosted search). Every AI/infra component in this project is a managed API or managed free-tier service. This was a deliberate reliability decision for a solo, AI-assisted build — do not "improve" this by self-hosting anything.
- **Inngest, BullMQ, or any job-queue/orchestration framework for v1.** The pipeline runs as sequential calls inside a single Next.js API route. Only revisit this if a real, observed timeout problem occurs — not preemptively.
- **n8n** for anything in the live request path. (It's fine as a separate, manually-run tool for one specific offline task — see Section 5d — but it is not part of the application.)
- **Fine-tuning any model.**
- **More than one vector DB.** Pinecone only, two collections (Section 9).

---

## 3. Tech stack — locked

| Layer | Choice | Notes |
|---|---|---|
| Frontend + hosting | Next.js, deployed on Vercel | |
| Auth | **Supabase Auth** | Not Clerk, not NextAuth — one vendor for auth+DB |
| Database | **Supabase (Postgres)**, same project as Auth | |
| AI "brain" (transcribe + extract + cross-check + generate) | **Gemini API**, Google AI Studio free tier | Multimodal — send audio + image + text in a single request where possible. Do not split this into a separate self-hosted ASR step. |
| Orchestration | Plain sequential async calls inside a Next.js API route | No queue/workflow framework in v1 |
| Vector store (RAG) | **Pinecone**, free tier | Two collections only — see Section 9 |
| Web search (for the SEO Research Agent) | **Tavily or Serper**, free tier | Pick one, don't integrate both |
| Validation | **Zod** | Every AI-generated output must pass a Zod schema before being trusted anywhere downstream |
| Observability | **Langfuse Cloud**, free tier (hosted, not self-hosted) | Traces each pipeline stage call |
| Coding tool | Antigravity (Google) | This file is read by Antigravity's agents |

### Required environment variables (names — keep consistent, never hardcode values in code)
```
GEMINI_API_KEY
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY   (server-side only, never exposed to client)
PINECONE_API_KEY
PINECONE_ENVIRONMENT
TAVILY_API_KEY   (or SERPER_API_KEY — whichever is chosen)
LANGFUSE_PUBLIC_KEY
LANGFUSE_SECRET_KEY
```
All secrets live in `.env.local` (gitignored). Never write a secret value into any source file, log statement, or commit.

---

## 4. End-to-end user flow

1. Seller signs up / logs in with **name + emailid**(nophone, no password complexity requirements beyond what Supabase Auth defaults to).
2. Lands on dashboard — sidebar with mock sections (Orders, Returns, Pricing, Claims, Inventory, Payments — static seeded data) and one real section: **Catalog Uploads**.
3. Seller clicks "Add Product" → records a voice note (browser `MediaRecorder` API) or types text, and uploads exactly one photo.
4. Submission triggers the pipeline (Section 8).
5. Pipeline returns a structured result (Section 9's schema).
6. Confirmation screen renders — bilingual (Hindi + English) — pre-filled with generated fields. High-confidence fields shown plainly; medium-confidence fields shown editable with a "please confirm" indicator; low-confidence fields shown with a mandatory clarifying question the seller must answer before submitting.
7. Seller edits/confirms → result saved to Supabase → reflected in the dashboard's catalog list/count as "live."

---

## 5. Domain data — categories, attributes, GST/HSN

### 5a. Locked category list (9 — do not silently add or remove)

| # | Category | Construction | HSN |
|---|---|---|---|
| 1 | Shirt | Woven top | 6205 (men's) / 6206 (women's) |
| 2 | T-shirt | Knit top | 6109 |
| 3 | Pant / Trouser | Woven bottom | 6203 (men's) / 6204 (women's) |
| 4 | Shorts | Woven/knit bottom | 6203 / 6204 |
| 5 | Leggings | Knit bottom | 6104 |
| 6 | Dress | Woven or knit, full-body | 6204 (woven) / 6104 (knit) |
| 7 | Maxi Dress | Woven or knit, full-body, long length | 6204 (woven) / 6104 (knit) |
| 8 | Kurti / Kurta | Ethnic top | 6211 |
| 9 | Saree | Unstitched fabric | 5208 (cotton) / 5407 (synthetic) |

Men's/women's variants of the same garment type **share one schema** — gender is an attribute value, not a separate category entry.

### 5b. GST rule (price-based, applies uniformly across all categories above)
- Sale price **≤ ₹2,500/piece → 5% GST**
- Sale price **> ₹2,500/piece → 18% GST**
- This is the GST 2.0 structure (effective Sept 22, 2025). GST is derived from the seller-confirmed price, never hardcoded per category.
- Note in any user-facing docs/README: HSN/GST values used here are representative for a demo project, not a substitute for real tax advice.

### 5c. Attribute schema (this is the seed content for RAG Collection #1 — Section 9)

**Universal attributes (all 9 categories):** Fabric, Pattern (printed / solid / striped / checked / embroidered), Color, Occasion (casual / party / office / festive), Net Quantity, Country of Origin.

**Category-specific additions:**
| Group | Categories | Extra attributes |
|---|---|---|
| Tops | Shirt, T-shirt, Kurti | Sleeve Length (sleeveless / short / 3-4th / full), Neck Type (round / V / boat / square / scoop / sweetheart), Fit (regular / slim / relaxed) |
| Bottoms | Pant, Shorts, Leggings | Waist Rise (high / mid / low), Closure (elastic / drawstring / zipper / button), Fit (skinny / regular / relaxed) — Leggings omit Closure/Fit-as-pants and instead just use Waist Type, since they're stretch-knit |
| Full-body | Dress, Maxi Dress | Length (mini / midi / maxi), Neck Type, Sleeve Length, Fit |
| Ethnic | Kurti/Kurta, Saree | Fabric expands to (rayon / net / satin / silk-blend / georgette / chiffon / cotton), Work/Embellishment (embroidered / printed / plain), and for sets: Set Components (top+bottom, top+bottom+dupatta, etc.) |

Each category's attribute set must be stored as its own retrievable document in Pinecone (Section 9) — this is what the pipeline retrieves to constrain dropdown-value generation.

### 5d. Size chart fields
Varies by category — not every category needs every measurement:
- Tops: Bust/Chest (cm), Length (cm)
- Bottoms: Waist (cm), Hip (cm), Length (cm)
- Dresses: Bust (cm), Waist (cm), Length (cm)
- Saree: no standard size chart — fabric length/width only, handle as a category-level exception (don't force a size_chart array with irrelevant fields for this category)

### 5e. RAG corpus refresh (offline, not part of the live app)
The competitor-listing corpus (RAG Collection #2) is built/refreshed by a **manually-run script**, not by any service running inside the app. It is acceptable to use n8n for this specific offline task if convenient, but the app itself must never depend on n8n being up.

---

## 6. Pipeline architecture (what happens inside "the brain")

Sequential steps, called from one Next.js API route handler:

1. **Single Gemini call**: send audio (if voice) + image + any typed text together. Ask it to: transcribe (if audio), extract every factual claim the seller made, independently analyze the image (category, color, pattern, visible construction details), and cross-check the two against each other.
2. **RAG retrieval #1**: query Pinecone Collection 1 with the detected category → get back the valid attribute schema (Section 5c) for that category.
3. **RAG retrieval #2**: query Pinecone Collection 2 with the detected category/attributes → get back competitor listing title/description patterns (style only).
4. **SEO Research Agent** (agentic sub-system — see Section 10) runs to inform title/description phrasing, using RAG #2 results plus live search if needed.
5. **Field generation**: produce every output field, respecting source-of-truth priority rules (Section 7) and confidence rules (Section 8).
6. **Confidence-Resolution Agent** (agentic sub-system — see Section 10) attempts to resolve any medium/low confidence field before giving up and flagging it for the seller.
7. **Zod validation** of the full output object against the schema in Section 9. On failure, retry once, feeding the validation error back into the Gemini call. On second failure, stop and surface a generic error (Section 11).
8. Return the validated, confidence-annotated object to the frontend for the confirmation screen.

---

## 7. Source-of-truth priority rules

| Field type | Primary source | Never do |
|---|---|---|
| Category, color, pattern, visible construction details | Image | Trust voice over a clear visual contradiction |
| Fabric composition, wash care, brand | Voice/text only | Infer composition from how a fabric looks |
| Size measurements (numeric) | Voice (explicit numbers only) | Auto-generate or guess standard measurements |
| Stock quantity | Voice only | Default to any assumed number |
| Price, weight, GST%, HSN code | Voice (explicit only) | Estimate, recommend, or auto-assign without being asked |
| Title/description phrasing & keyword choice | RAG #2 + SEO Research Agent, constrained by this product's true attributes | Add a keyword or claim that isn't actually true of this specific product |

If image and voice disagree on something the image can verify (a visually-checkable attribute), trust the image — but always log the disagreement, never resolve it silently.

---

## 8. Confidence rules

### Thresholds
- **High** — voice claim and image both support the same value, OR only one relevant source exists for that field type and it's unambiguous.
- **Medium** — only one source is available for a field, and the other source structurally cannot verify it (e.g., image can never verify fabric composition).
- **Low** — sources disagree, OR a required field has no source at all.

### Hard cap — these fields can never be marked High confidence, regardless of how confidently the seller states them, because nothing can cross-verify them against the image:
Fabric composition, wash-care instructions, stock quantity, price, weight, GST%, HSN code.

### Action per confidence level
- **High** → fill silently, no flag.
- **Medium** → fill, pre-filled and editable, shown with a "please confirm" indicator on the confirmation screen.
- **Low** → fill with best available value (or leave blank), and attach a mandatory clarifying question in the seller's own input language — the seller must answer before the listing can be submitted.

### Core principle (applies everywhere in this codebase, not just confidence logic)
**Never silently guess, and never silently fail.** Every uncertain or failed step either gets flagged to the seller or stops the pipeline outright. This is the project's central thesis — accuracy failures are what cause real-world returns — so silent guessing anywhere in this codebase is a bug, not an acceptable shortcut.

---

## 9. Output schema (the contract every pipeline run must satisfy)

```json
{
  "category": "string",
  "sub_category": "string",
  "title": "string",
  "title_seo_keywords": ["string"],
  "attributes": {
    "<attribute_name>": "string"
  },
  "description": "string",
  "size_chart": [
    {"size": "string", "measurements_cm": {"chest": 0, "waist": 0, "length": 0}}
  ],
  "variants": [
    {"size": "string", "color": "string", "stock_qty": 0}
  ],
  "pricing_inputs": {
    "seller_price": 0,
    "mrp": 0,
    "weight_grams": 0,
    "gst_percent": null,
    "hsn_code": null
  },
  "confidence_flags": [
    {"field": "string", "confidence": "low|medium|high", "reason": "string", "seller_question": "string or null"}
  ],
  "source_log": {
    "<field_name>": "image|voice|text|default|rag_schema|rag_seo_corpus|seo_agent|confidence_agent|seller_clarification_needed"
  }
}
```

Notes:
- There is no `images[]` or `image_qc_flags` field — image editing is out of scope (Section 2). Do not add these back.
- `size_chart` measurement keys vary by category per Section 5d — don't force chest/waist/length onto a category that doesn't use all three (e.g., saree).
- This schema is enforced via Zod on every pipeline run before the result reaches the frontend.

---

## 10. Agentic sub-systems

This project has exactly two genuinely agentic components (the model decides what to do next and when to stop) — everything else in the pipeline is a fixed-sequence generative step. Do not relabel the fixed steps as "agents," and do not add more agentic loops without a clear decision point that justifies it.

### 10a. SEO Research Agent
- **Purpose:** inform title/description phrasing with real keyword/structure patterns.
- **Tools available:** web search (Tavily or Serper).
- **Loop:** search with an initial query → judge whether results give sufficient keyword/structure signal → if not, reformulate the query and search again → stop when sufficient signal is found, or after a hard cap of **3 search attempts** (to bound free-tier search usage).
- **Output:** style/structure guidance only — never raw content to copy. Feeds into field generation (Section 6, step 4) alongside RAG #2.

### 10b. Confidence-Resolution Agent
- **Purpose:** try to resolve a medium/low confidence field before bothering the seller with a question.
- **Tools available:** re-examine the same image with a more targeted Gemini prompt (cheap — same image, sharper question, not a heavier/different call), re-query the RAG attribute schema, re-check the voice/text transcript for a missed mention.
- **Loop:** field is medium/low → try one resolution action → re-evaluate confidence → if still unresolved, try a different action, or give up. Hard cap: **max 2 resolution attempts** per field.
- **Stop condition:** confidence improves to an acceptable level, or attempts are exhausted → escalate to the seller as a flagged field (Section 8).

---

## 11. Error handling

| Failure | Required behavior |
|---|---|
| Gemini API call fails/times out | Retry once automatically. Second failure → user-facing error, no partial/incorrect data saved anywhere. |
| Gemini rate-limited (429) | Same as above, plus log it distinctly (this is a quota/timing issue, not a real failure). |
| Audio is unclear, silent, or empty | Do not guess from it. Tell the seller to re-record. Do not let the pipeline proceed past this point. |
| No photo uploaded | Block at the form level before the pipeline is triggered at all — don't waste an API call on an invalid submission. |
| Voice and image describe fundamentally different products (category-level mismatch) | This is a hard stop, not a confidence flag. Show the seller both detected interpretations and ask which is correct — never silently pick one. |
| Gemini output fails Zod validation | Retry once, feeding the specific validation error back to Gemini so it can self-correct. Second failure → generic error to the user, log the details for debugging. |
| Pinecone/RAG retrieval fails | Pipeline must still complete — fall back to ungrounded generation, but mark that run's `confidence_flags` as lower-trust since schema/corpus grounding wasn't available. |

---

## 12. Edge cases to handle explicitly
- Seller corrects themselves mid-recording ("isme... nahi nahi, dusra wala color hai") — use the final, corrected statement, not the first one.
- Seller references context that was never shared with the system ("jaisa pichli baar tha") — flag as unresolvable, do not guess at what "pichli baar" means.
- Photo is too blurry/unusable to analyze — flag and ask for a reshoot. Do not attempt any image fix (Section 2 — image editing is out of scope).

---

## 13. Dashboard scope
Only **Catalog Uploads** is functionally real. Every other sidebar section (Orders, Returns, Pricing, Claims, Inventory, Payments) opens to **static seeded dummy data** — no real logic, no real database writes, just enough to look authentic. Do not build real functionality into these sections; that effort belongs in the Catalog Uploads flow and the pipeline behind it.

---

## 14. UI/UX conventions
- Visual/style reference: **SellerShip (sellership.in)** — color palette, hero section style, the upload → processing → result card pattern. Reference for look-and-feel only — do not replicate their feature set, credit system, or specific tools.
- Confirmation screen must be **bilingual: Hindi and English** side by side (or toggle — implementation detail, not locked), since the seller may not read English confidently.
- Clarifying questions for low-confidence fields must appear in the seller's own input language, in plain, non-technical wording — not Meesho-jargon, not technical field names.

---

## 15. Build order (for sequencing work — one phase per task/mission, don't combine)
1. Validate the Gemini "brain" alone via a standalone script (no app yet) against a few real test examples.
2. Add RAG #1 (attribute schema) to that same script.
3. Build the app shell: Next.js + Vercel + Supabase Auth + mock dashboard.
4. Build input capture UI (photo + voice record + text fallback) — capture only, no AI call yet.
5. Wire the validated brain (steps 1-2) into the app via an API route + Zod validation.
6. Build the bilingual confirmation screen.
7. Add RAG #2 (competitor corpus) and the SEO Research Agent for title/description.
8. Persist confirmed listings to Supabase and reflect them in the dashboard.
9. Build the eval harness (15-20 hand-labeled test cases, including a dedicated Hinglish/code-switched subset).
10. Add Langfuse observability across pipeline stages.
11. Deploy to Vercel, test the live link cold, handle Gemini 429s gracefully in the UI, write the README.

Each phase should be a separate, focused task given to an agent — do not combine multiple phases into one mission/prompt.

---

## 16. Coding conventions
- Suggested folder structure:
```
/app                — Next.js app router pages
/app/api             — API routes (pipeline entry point lives here)
/lib                 — shared clients: gemini.ts, pinecone.ts, supabase.ts
/lib/pipeline        — pipeline steps: extract.ts, cross-check.ts, rag.ts, seo-agent.ts, confidence-agent.ts, validate.ts
/lib/schema          — Zod schemas (must match Section 9 exactly)
/components          — UI components
/scripts             — one-off scripts: seed-rag-corpus.ts, run-eval.ts
/eval                — hand-labeled test cases + scoring output
.env.local           — secrets, gitignored
AGENTS.md            — this file
```
- Every pipeline output must pass through the Zod schema in `/lib/schema` before being used anywhere — no exceptions, no "just this once" bypasses.
- No secrets in source files, ever — environment variables only (Section 3).
- Keep each pipeline step as a separate, named function — even though there's no orchestration framework in v1, the steps should already be structured so that wrapping them in Inngest `step.run()` later (if ever needed) is a refactor, not a rewrite.

---

## 17. Open items — not yet decided, do not invent these
- Final project name
- Hand-labeled test/seed data (photo + voice/text pairs) for the eval harness and for Phase 1 validation
- Exact final choice between Tavily and Serper: **Tavily chosen** (Phase 7, `TAVILY_API_KEY` in `.env.local`). Do not integrate Serper.

If a task depends on one of these and it hasn't been provided, stop and ask rather than fabricating a placeholder that looks final.
