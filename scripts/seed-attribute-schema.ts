/**
 * seed-attribute-schema.ts — Phase 2: Seed RAG Collection #1
 *
 * Populates the Pinecone `attribute-schemas` namespace with one record per
 * clothing category (9 total). Each record stores the complete attribute schema
 * (required keys + valid dropdown values) from AGENTS.md §5c as metadata.
 *
 * Retrieval in test-brain.ts uses direct ID fetch (index.fetch()), NOT
 * vector similarity search — so the vectors stored here are placeholder zeros.
 *
 * Run with:  npx tsx scripts/seed-attribute-schema.ts
 */

import { config as dotenvConfig } from "dotenv";
import * as path from "node:path";
import { Pinecone } from "@pinecone-database/pinecone";

// ---------------------------------------------------------------------------
// 1. Load .env.local
// ---------------------------------------------------------------------------
dotenvConfig({ path: path.resolve(process.cwd(), ".env.local") });

const PINECONE_API_KEY = process.env.PINECONE_API_KEY;
const GEMINI_API_KEY   = process.env.GEMINI_API_KEY; // validated but not called in this script

if (!PINECONE_API_KEY) {
  console.error("❌  PINECONE_API_KEY is missing from .env.local — please add it and retry.");
  process.exit(1);
}
if (!GEMINI_API_KEY) {
  console.error("❌  GEMINI_API_KEY is missing from .env.local");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// 2. Constants
// ---------------------------------------------------------------------------
const INDEX_NAME = "sarthi-ai-index";
const NAMESPACE  = "attribute-schemas";
const DIMENSION  = 768; // matches text-embedding-004 for Phase 7 (competitor corpus)

// Placeholder vector — never used for similarity; only fetch-by-ID is used for this namespace.
// First element is a tiny non-zero value to avoid cosine-metric edge cases on all-zero vectors.
const PLACEHOLDER_VECTOR: number[] = Array(DIMENSION).fill(0.0);
PLACEHOLDER_VECTOR[0] = 0.1;

// ---------------------------------------------------------------------------
// 3. Schema definitions — AGENTS.md §5c (hardcoded, authoritative)
// ---------------------------------------------------------------------------

/** Universal attributes shared by all 9 categories */
const UNIVERSAL_ATTRIBUTES = {
  fabric: {
    source: "text_only",
    confidence_cap: "medium",
    note: "Never infer from image. Accept any fabric name stated by seller.",
  },
  pattern: {
    source: "image",
    valid_values: ["printed", "solid", "striped", "checked", "embroidered"],
  },
  color: {
    source: "image",
    note: "Any color detected from the image. No fixed value list.",
  },
  occasion: {
    source: "image_and_text",
    valid_values: ["casual", "party", "office", "festive"],
  },
  net_quantity: {
    source: "text",
    note: "Use null if not stated by seller.",
  },
  country_of_origin: {
    source: "text",
    default: "India",
  },
};

/** Group-specific attributes per AGENTS.md §5c */
const GROUP_TOPS = {
  sleeve_length: {
    source: "image",
    valid_values: ["sleeveless", "short", "3-4th", "full"],
  },
  neck_type: {
    source: "image",
    valid_values: ["round", "V", "boat", "square", "scoop", "sweetheart"],
  },
  fit: {
    source: "text_or_image",
    valid_values: ["regular", "slim", "relaxed", "oversized"],
  },
};

const GROUP_BOTTOMS_STANDARD = {
  waist_rise: {
    source: "image",
    valid_values: ["high", "mid", "low"],
  },
  closure: {
    source: "image",
    valid_values: ["elastic", "drawstring", "zipper", "button"],
  },
  fit: {
    source: "text_or_image",
    valid_values: ["skinny", "regular", "relaxed"],
  },
};

const GROUP_BOTTOMS_LEGGINGS = {
  waist_rise: {
    source: "image",
    valid_values: ["high", "mid", "low"],
  },
  // Leggings omit 'closure', use 'waist_type' instead (AGENTS.md §5c)
  waist_type: {
    source: "image",
    valid_values: ["elastic", "drawstring"],
  },
  fit: {
    source: "text_or_image",
    valid_values: ["skinny", "regular", "relaxed"],
  },
};

const GROUP_FULL_BODY = {
  length: {
    source: "image",
    valid_values: ["mini", "midi", "maxi"],
  },
  neck_type: {
    source: "image",
    valid_values: ["round", "V", "boat", "square", "scoop", "sweetheart"],
  },
  sleeve_length: {
    source: "image",
    valid_values: ["sleeveless", "short", "3-4th", "full"],
  },
  fit: {
    source: "text_or_image",
    valid_values: ["regular", "slim", "relaxed"],
  },
};

/** Ethnic-specific additions — stacked on top of TOPS for Kurti, standalone for Saree */
const GROUP_ETHNIC_EXTRAS = {
  work: {
    source: "image",
    valid_values: ["embroidered", "printed", "plain"],
  },
  set_components: {
    source: "text",
    valid_values: ["top+bottom", "top+bottom+dupatta", "single piece"],
    note: "Use null if not stated.",
  },
};

/** Ethnic fabric values supersede the default universal list */
const ETHNIC_FABRIC_OVERRIDE = {
  fabric: {
    source: "text_only",
    confidence_cap: "medium",
    valid_values: ["rayon", "net", "satin", "silk-blend", "georgette", "chiffon", "cotton"],
  },
};

// ---------------------------------------------------------------------------
// 4. Build all 9 records
// ---------------------------------------------------------------------------

type SchemaRecord = {
  id: string; // exact category name — used as the Pinecone vector ID for fetch-by-ID
  values: number[];
  metadata: {
    category: string;
    attribute_group: string;
    size_chart_keys: string[];
    schema_json: string; // stringified JSON for injection into the Gemini prompt
  };
};

const CATEGORY_SCHEMAS: SchemaRecord[] = [
  // --- TOPS group ---
  {
    id: "Shirt",
    values: PLACEHOLDER_VECTOR,
    metadata: {
      category: "Shirt",
      attribute_group: "Tops",
      size_chart_keys: ["chest_cm", "length_cm"],
      schema_json: JSON.stringify({
        universal: UNIVERSAL_ATTRIBUTES,
        group_specific: GROUP_TOPS,
      }),
    },
  },
  {
    id: "T-shirt",
    values: PLACEHOLDER_VECTOR,
    metadata: {
      category: "T-shirt",
      attribute_group: "Tops",
      size_chart_keys: ["chest_cm", "length_cm"],
      schema_json: JSON.stringify({
        universal: UNIVERSAL_ATTRIBUTES,
        group_specific: GROUP_TOPS,
      }),
    },
  },

  // --- BOTTOMS group ---
  {
    id: "Pant / Trouser",
    values: PLACEHOLDER_VECTOR,
    metadata: {
      category: "Pant / Trouser",
      attribute_group: "Bottoms",
      size_chart_keys: ["waist_cm", "hip_cm", "length_cm"],
      schema_json: JSON.stringify({
        universal: UNIVERSAL_ATTRIBUTES,
        group_specific: GROUP_BOTTOMS_STANDARD,
      }),
    },
  },
  {
    id: "Shorts",
    values: PLACEHOLDER_VECTOR,
    metadata: {
      category: "Shorts",
      attribute_group: "Bottoms",
      size_chart_keys: ["waist_cm", "hip_cm", "length_cm"],
      schema_json: JSON.stringify({
        universal: UNIVERSAL_ATTRIBUTES,
        group_specific: GROUP_BOTTOMS_STANDARD,
      }),
    },
  },
  {
    id: "Leggings",
    values: PLACEHOLDER_VECTOR,
    metadata: {
      category: "Leggings",
      attribute_group: "Bottoms",
      size_chart_keys: ["waist_cm", "hip_cm", "length_cm"],
      schema_json: JSON.stringify({
        universal: UNIVERSAL_ATTRIBUTES,
        group_specific: GROUP_BOTTOMS_LEGGINGS,
      }),
    },
  },

  // --- FULL-BODY group ---
  {
    id: "Dress",
    values: PLACEHOLDER_VECTOR,
    metadata: {
      category: "Dress",
      attribute_group: "Full-body",
      size_chart_keys: ["bust_cm", "waist_cm", "length_cm"],
      schema_json: JSON.stringify({
        universal: UNIVERSAL_ATTRIBUTES,
        group_specific: GROUP_FULL_BODY,
      }),
    },
  },
  {
    id: "Maxi Dress",
    values: PLACEHOLDER_VECTOR,
    metadata: {
      category: "Maxi Dress",
      attribute_group: "Full-body",
      size_chart_keys: ["bust_cm", "waist_cm", "length_cm"],
      schema_json: JSON.stringify({
        universal: UNIVERSAL_ATTRIBUTES,
        group_specific: GROUP_FULL_BODY,
      }),
    },
  },

  // --- ETHNIC group (Tops + Ethnic extras for Kurti; Ethnic only for Saree) ---
  {
    id: "Kurti / Kurta",
    values: PLACEHOLDER_VECTOR,
    metadata: {
      category: "Kurti / Kurta",
      attribute_group: "Tops+Ethnic",
      size_chart_keys: ["chest_cm", "length_cm"],
      schema_json: JSON.stringify({
        universal: { ...UNIVERSAL_ATTRIBUTES, ...ETHNIC_FABRIC_OVERRIDE },
        group_specific: { ...GROUP_TOPS, ...GROUP_ETHNIC_EXTRAS },
      }),
    },
  },
  {
    id: "Saree",
    values: PLACEHOLDER_VECTOR,
    metadata: {
      category: "Saree",
      attribute_group: "Ethnic",
      size_chart_keys: [], // Saree: no standard size chart (AGENTS.md §5d)
      schema_json: JSON.stringify({
        universal: { ...UNIVERSAL_ATTRIBUTES, ...ETHNIC_FABRIC_OVERRIDE },
        group_specific: GROUP_ETHNIC_EXTRAS,
      }),
    },
  },
];

// ---------------------------------------------------------------------------
// 5. Seed Pinecone
// ---------------------------------------------------------------------------
async function seedAttributeSchemas(): Promise<void> {
  console.log("🔧  Connecting to Pinecone...");
  const pc = new Pinecone({ apiKey: PINECONE_API_KEY! });

  // Check / create index
  const existingIndexes = await pc.listIndexes();
  const indexExists = existingIndexes.indexes?.some((i) => i.name === INDEX_NAME) ?? false;

  if (!indexExists) {
    console.log(`🔧  Index "${INDEX_NAME}" not found — creating (dimension=${DIMENSION}, metric=cosine)...`);
    await pc.createIndex({
      name: INDEX_NAME,
      dimension: DIMENSION,
      metric: "cosine",
      spec: {
        serverless: {
          cloud: "aws",
          region: "us-east-1",
        },
      },
    });

    // Poll until index is ready (can take 30-90s on free tier)
    console.log("⏳  Waiting for index to be ready...");
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
      console.error("\n❌  Index did not become ready within 150s. Try re-running.");
      process.exit(1);
    }
    console.log("\n✅  Index ready.");
  } else {
    console.log(`✅  Index "${INDEX_NAME}" already exists.`);
  }

  // Connect to namespace
  const index = pc.index(INDEX_NAME).namespace(NAMESPACE);

  // Upsert all 9 records
  console.log(`\n📥  Upserting ${CATEGORY_SCHEMAS.length} schema records into namespace "${NAMESPACE}"...\n`);
  await index.upsert({ records: CATEGORY_SCHEMAS });

  // Verify each record is fetchable immediately after upsert
  console.log("🔍  Verifying fetch-by-ID for all 9 categories...\n");
  let allOk = true;
  for (const record of CATEGORY_SCHEMAS) {
    const result = await index.fetch({ ids: [record.id] });
    const fetched = result.records?.[record.id];
    if (fetched && fetched.metadata?.["category"]) {
      const group = fetched.metadata["attribute_group"];
      console.log(`  ✅  ${record.id.padEnd(20)} (group: ${group})`);
    } else {
      console.warn(`  ⚠️   ${record.id} — fetch returned no record (may need a moment to propagate)`);
      allOk = false;
    }
  }

  if (allOk) {
    console.log("\n✅  All 9 schemas seeded and verified. RAG Collection #1 is ready.\n");
  } else {
    console.log("\n⚠️   Some records may still be propagating. Wait 10s and re-run to confirm.\n");
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------
seedAttributeSchemas().catch((err: Error) => {
  console.error("❌  Unhandled error:", err.message);
  process.exit(1);
});
