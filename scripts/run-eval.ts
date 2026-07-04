/**
 * run-eval.ts — Phase 9: Evaluation harness
 *
 * Reads every test case from /eval/test-cases.json, runs each through the
 * real pipeline (lib/pipeline/generate.ts), checks every expected field,
 * and writes a structured report to /eval/results.json.
 *
 * Run with:  npx tsx scripts/run-eval.ts
 *
 * Scoring rules:
 *   - Fuzzy color matching: "light blue" ~ "blue" (substring / word overlap)
 *   - Case-insensitive category/string matching
 *   - null-check for numeric fields expected to be null
 *   - TC02 conflict detection: color confidence_flag must be "low" with a
 *     reason that mentions disagreement / conflict
 *   - Hard-cap violations: fabric, wash_care, stock_qty, seller_price, mrp,
 *     weight_grams must NEVER have confidence = "high"
 */

import { config as dotenvConfig } from "dotenv";
import * as fs from "node:fs";
import * as path from "node:path";

// Load .env.local BEFORE any other module imports that read process.env
dotenvConfig({ path: path.resolve(process.cwd(), ".env.local") });

import { runListingPipeline } from "@/lib/pipeline/generate";
import type { Listing } from "@/lib/schema/listing";

// ─── Types ───────────────────────────────────────────────────────────────────

interface TestCase {
  id: string;
  image: string;
  input: string;
  input_language: string;
  expected: Record<string, unknown>;
}

interface FieldResult {
  field: string;
  expected: unknown;
  actual: unknown;
  pass: boolean;
  note?: string;
}

interface TestResult {
  id: string;
  input_language: string;
  pass: boolean;
  field_results: FieldResult[];
  conflict_detection?: { expected: boolean; detected: boolean; pass: boolean; note?: string };
  hard_cap_violations: string[];
  error?: string;
  duration_ms: number;
}

interface EvalReport {
  run_at: string;
  overall_accuracy: number;
  total_fields_checked: number;
  total_fields_passed: number;
  per_field_accuracy: Record<string, { pass: number; total: number; pct: string }>;
  per_language_accuracy: Record<string, { pass: number; total: number; pct: string }>;
  conflict_detection_accuracy: { pass: number; total: number; pct: string };
  hard_cap_violations: { test_id: string; violations: string[] }[];
  per_test_summary: { id: string; pass: boolean; fields_pass: number; fields_total: number; error?: string }[];
  test_results: TestResult[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Resolve a dot-path like "attributes.color" against a Listing object */
function resolvePath(obj: unknown, dotPath: string): unknown {
  return dotPath.split(".").reduce((cur, key) => {
    if (cur === null || cur === undefined) return undefined;
    return (cur as Record<string, unknown>)[key];
  }, obj);
}

/** Color words that map to each other for fuzzy matching */
const COLOR_SYNONYMS: string[][] = [
  ["light blue", "sky blue", "baby blue", "powder blue", "denim blue", "blue"],
  ["dark blue", "navy", "navy blue", "indigo"],
  ["light green", "mint", "sage", "olive"],
  ["dark green", "forest green", "bottle green"],
  ["light pink", "baby pink", "pastel pink", "blush", "pink"],
  ["hot pink", "magenta", "fuchsia", "bright pink"],
  ["light yellow", "cream", "ivory", "lemon yellow", "yellow"],
  ["golden", "gold", "mustard", "dark yellow"],
  ["off white", "white", "ecru"],
  ["cyan", "turquoise", "teal", "aqua", "peacock blue"],
  ["grey", "gray", "charcoal", "ash"],
  ["maroon", "dark red", "burgundy", "wine"],
];

function normalizeStr(s: string): string {
  return s.toLowerCase().trim();
}

function colorMatches(expected: string, actual: string): boolean {
  const exp = normalizeStr(expected);
  const act = normalizeStr(actual);
  if (act.includes(exp) || exp.includes(act)) return true;
  // Check synonym groups
  for (const group of COLOR_SYNONYMS) {
    const expInGroup = group.some((c) => act.includes(c) || c.includes(act));
    const actInGroup = group.some((c) => exp.includes(c) || c.includes(exp));
    if (expInGroup && actInGroup) return true;
  }
  return false;
}

function categoryMatches(expected: string, actual: string): boolean {
  return normalizeStr(expected) === normalizeStr(actual);
}

/**
 * Compare an expected value to the actual resolved value.
 * Returns { pass, note }
 */
function compareField(
  fieldKey: string,
  expected: unknown,
  actual: unknown
): { pass: boolean; note?: string } {
  // null / undefined expected → actual must be null or undefined
  if (expected === null || expected === undefined) {
    const pass = actual === null || actual === undefined;
    return { pass, note: pass ? undefined : `Expected null, got ${JSON.stringify(actual)}` };
  }

  if (actual === null || actual === undefined) {
    return { pass: false, note: `Expected ${JSON.stringify(expected)}, got null/undefined` };
  }

  const expStr = String(expected);
  const actStr = String(actual);

  // Category matching
  if (fieldKey === "category" || fieldKey.endsWith(".category")) {
    const pass = categoryMatches(expStr, actStr);
    return { pass, note: pass ? undefined : `Category mismatch: expected "${expStr}", got "${actStr}"` };
  }

  // Color matching (fuzzy)
  if (fieldKey.endsWith(".color") || fieldKey === "attributes.color") {
    const pass = colorMatches(expStr, actStr);
    return { pass, note: pass ? undefined : `Color mismatch: expected "${expStr}", got "${actStr}"` };
  }

  // Confidence levels — must be exact from enum
  if (fieldKey.endsWith(".confidence")) {
    const pass = normalizeStr(expStr) === normalizeStr(actStr);
    return { pass, note: pass ? undefined : `Confidence mismatch: expected "${expStr}", got "${actStr}"` };
  }

  // source_log values — exact, case-insensitive
  if (fieldKey.startsWith("source_log.")) {
    const pass = normalizeStr(expStr) === normalizeStr(actStr);
    return { pass, note: pass ? undefined : `source_log mismatch: expected "${expStr}", got "${actStr}"` };
  }

  // Boolean fields
  if (typeof expected === "boolean") {
    const pass = Boolean(actual) === expected;
    return { pass, note: pass ? undefined : `Boolean mismatch: expected ${expected}, got ${actual}` };
  }

  // Numeric fields
  if (typeof expected === "number") {
    const actNum = typeof actual === "number" ? actual : parseFloat(String(actual));
    const pass = !isNaN(actNum) && Math.abs(actNum - expected) < 0.01;
    return { pass, note: pass ? undefined : `Numeric mismatch: expected ${expected}, got ${actual}` };
  }

  // Default: case-insensitive string compare
  const pass = normalizeStr(expStr) === normalizeStr(actStr);
  return { pass, note: pass ? undefined : `String mismatch: expected "${expStr}", got "${actStr}"` };
}

// Hard-capped fields (AGENTS.md §8) — must NEVER be "high" confidence
const HARD_CAP_FIELDS = new Set([
  "fabric",
  "fabric_composition",
  "wash_care",
  "stock_qty",
  "seller_price",
  "mrp",
  "weight_grams",
]);

function checkHardCapViolations(listing: Listing): string[] {
  const violations: string[] = [];
  for (const flag of listing.confidence_flags) {
    if (HARD_CAP_FIELDS.has(flag.field) && flag.confidence === "high") {
      violations.push(
        `Field "${flag.field}" is marked "high" confidence — hard-cap violation (AGENTS.md §8)`
      );
    }
  }
  return violations;
}

/**
 * TC02 conflict detection check:
 * The pipeline must produce a color confidence_flag with confidence "low"
 * and a reason that signals disagreement between image and text.
 */
function checkConflictDetection(
  listing: Listing,
  expectedConflict: boolean
): { expected: boolean; detected: boolean; pass: boolean; note?: string } {
  if (!expectedConflict) {
    // For non-conflict TCs, just report true
    return { expected: false, detected: false, pass: true };
  }

  const colorFlag = listing.confidence_flags.find((f) => f.field === "color");
  if (!colorFlag) {
    return {
      expected: true,
      detected: false,
      pass: false,
      note: "No color entry in confidence_flags at all",
    };
  }

  const isLow = colorFlag.confidence === "low";
  const reason = colorFlag.reason.toLowerCase();
  const reasonMentionsConflict =
    reason.includes("disagree") ||
    reason.includes("conflict") ||
    reason.includes("mismatch") ||
    reason.includes("contradict") ||
    reason.includes("differs") ||
    reason.includes("text says") ||
    reason.includes("seller said") ||
    reason.includes("seller described") ||
    reason.includes("described as") ||
    reason.includes("but image") ||
    reason.includes("image shows") ||
    reason.includes("seller states") ||
    reason.includes("seller mentions") ||
    // Generic pattern: "X but Y" where image and text diverge
    (reason.includes("but") && (reason.includes("image") || reason.includes("photo")));

  const detected = isLow && reasonMentionsConflict;
  return {
    expected: true,
    detected,
    pass: detected,
    note: detected
      ? undefined
      : `Color flag: confidence="${colorFlag.confidence}", reason="${colorFlag.reason}"`,
  };
}

/** Resolve confidence_flags.{field}.confidence */
function resolveConfidenceFlag(listing: Listing, fieldDotPath: string): string | undefined {
  // e.g. "confidence_flags.fabric.confidence"
  const parts = fieldDotPath.split(".");
  if (parts[0] !== "confidence_flags" || parts.length < 3) return undefined;
  const fieldName = parts[1];
  const prop = parts[2]; // "confidence" | "reason"
  const flag = listing.confidence_flags.find((f) => f.field === fieldName);
  if (!flag) return undefined;
  return (flag as Record<string, unknown>)[prop] as string | undefined;
}

/** Resolve any expected key to an actual value from the listing */
function resolveActualValue(listing: Listing, key: string): unknown {
  // confidence_flags.{field}.{prop}
  if (key.startsWith("confidence_flags.")) {
    return resolveConfidenceFlag(listing, key);
  }
  // source_log.{field}
  if (key.startsWith("source_log.")) {
    const field = key.slice("source_log.".length);
    return listing.source_log[field];
  }
  // attributes.{field}
  if (key.startsWith("attributes.")) {
    const field = key.slice("attributes.".length);
    return listing.attributes[field];
  }
  // pricing_inputs.{field}
  if (key.startsWith("pricing_inputs.")) {
    const field = key.slice("pricing_inputs.".length) as keyof typeof listing.pricing_inputs;
    return listing.pricing_inputs[field];
  }
  // top-level
  return (listing as unknown as Record<string, unknown>)[key];
}

// ─── Detect MIME type ────────────────────────────────────────────────────────

function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const map: Record<string, string> = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".gif": "image/gif",
  };
  return map[ext] ?? "image/jpeg";
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const testCasesPath = path.resolve(process.cwd(), "eval/test-cases.json");
  const resultsPath = path.resolve(process.cwd(), "eval/results.json");

  if (!fs.existsSync(testCasesPath)) {
    console.error(`❌  test-cases.json not found at ${testCasesPath}`);
    process.exit(1);
  }

  const testCases: TestCase[] = JSON.parse(fs.readFileSync(testCasesPath, "utf-8"));
  console.log(`\n🧪  Sarthi AI — Eval Harness (Phase 9)`);
  console.log(`📋  Running ${testCases.length} test cases...\n`);

  // Verify all images exist before starting
  const missingImages: string[] = [];
  for (const tc of testCases) {
    const imgPath = path.resolve(process.cwd(), tc.image);
    if (!fs.existsSync(imgPath)) missingImages.push(`${tc.id}: ${tc.image}`);
  }
  if (missingImages.length > 0) {
    console.error("❌  Missing images — cannot proceed:");
    missingImages.forEach((m) => console.error(`   - ${m}`));
    process.exit(1);
  }
  console.log("✅  All images verified.\n");

  const testResults: TestResult[] = [];
  const perFieldStats: Record<string, { pass: number; total: number }> = {};
  const perLangStats: Record<string, { pass: number; total: number }> = {};
  const conflictStats = { pass: 0, total: 0 };
  const hardCapViolationSummary: { test_id: string; violations: string[] }[] = [];

  for (const tc of testCases) {
    const startMs = Date.now();
    console.log(`▶  ${tc.id} — "${tc.input}" [${tc.input_language}]`);

    const result: TestResult = {
      id: tc.id,
      input_language: tc.input_language,
      pass: false,
      field_results: [],
      hard_cap_violations: [],
      duration_ms: 0,
    };

    try {
      // Load image
      const imgPath = path.resolve(process.cwd(), tc.image);
      const imageBuffer = fs.readFileSync(imgPath);
      const imageMimeType = getMimeType(tc.image);

      // Run pipeline (real Gemini + Pinecone calls, no shortcuts)
      const listing = await runListingPipeline({
        imageBuffer,
        imageMimeType,
        text: tc.input,
      });

      // Check each expected field
      const expectedFields = Object.entries(tc.expected).filter(
        ([k]) => k !== "conflict" && k !== "conflict_field" && k !== "conflict_image_wins"
      );

      for (const [key, expectedVal] of expectedFields) {
        const actual = resolveActualValue(listing, key);
        const { pass, note } = compareField(key, expectedVal, actual);

        result.field_results.push({ field: key, expected: expectedVal, actual, pass, note });

        // Accumulate per-field stats
        perFieldStats[key] ??= { pass: 0, total: 0 };
        perFieldStats[key].total++;
        if (pass) perFieldStats[key].pass++;
      }

      // Conflict detection check
      const expectedConflict = Boolean(tc.expected["conflict"]);
      result.conflict_detection = checkConflictDetection(listing, expectedConflict);
      if (expectedConflict) {
        conflictStats.total++;
        if (result.conflict_detection.pass) conflictStats.pass++;
      }

      // Hard-cap violations
      result.hard_cap_violations = checkHardCapViolations(listing);
      if (result.hard_cap_violations.length > 0) {
        hardCapViolationSummary.push({ test_id: tc.id, violations: result.hard_cap_violations });
      }

      const fieldsPassed = result.field_results.filter((f) => f.pass).length;
      const fieldsTotal = result.field_results.length;
      result.pass =
        fieldsPassed === fieldsTotal &&
        result.conflict_detection.pass &&
        result.hard_cap_violations.length === 0;

      // Per-language stats (count by field passes)
      perLangStats[tc.input_language] ??= { pass: 0, total: 0 };
      perLangStats[tc.input_language].total += fieldsTotal;
      perLangStats[tc.input_language].pass += fieldsPassed;

      // Console output per test
      const icon = result.pass ? "✅" : "⚠️ ";
      console.log(`   ${icon} ${fieldsPassed}/${fieldsTotal} fields pass`);
      for (const fr of result.field_results) {
        if (!fr.pass) {
          console.log(`      ✗ ${fr.field}: ${fr.note}`);
        }
      }
      if (!result.conflict_detection.pass && result.conflict_detection.expected) {
        console.log(`      ✗ Conflict detection: ${result.conflict_detection.note}`);
      }
      if (result.hard_cap_violations.length > 0) {
        for (const v of result.hard_cap_violations) {
          console.log(`      ✗ Hard-cap: ${v}`);
        }
      }
    } catch (err) {
      result.error = (err as Error).message;
      console.log(`   ❌  Pipeline error: ${result.error}`);
    }

    result.duration_ms = Date.now() - startMs;
    testResults.push(result);
    console.log(`   ⏱  ${result.duration_ms}ms\n`);

    // Throttle between test cases to stay under Gemini free-tier 15 req/min limit.
    // Each case makes ~4-5 Gemini calls; an 8s pause keeps the burst rate safe.
    const INTER_CASE_DELAY_MS = 8_000;
    if (testCases.indexOf(tc) < testCases.length - 1) {
      process.stdout.write(`   ⏳  Waiting ${INTER_CASE_DELAY_MS / 1000}s before next case (rate limit guard)...\n\n`);
      await new Promise((r) => setTimeout(r, INTER_CASE_DELAY_MS));
    }
  }

  // ─── Aggregate Report ──────────────────────────────────────────────────────

  let totalPass = 0;
  let totalChecked = 0;
  for (const tr of testResults) {
    totalPass += tr.field_results.filter((f) => f.pass).length;
    totalChecked += tr.field_results.length;
  }

  const overallPct = totalChecked === 0 ? 0 : Math.round((totalPass / totalChecked) * 100);

  const perFieldAccuracy: Record<string, { pass: number; total: number; pct: string }> = {};
  for (const [field, stat] of Object.entries(perFieldStats)) {
    perFieldAccuracy[field] = {
      ...stat,
      pct: `${Math.round((stat.pass / stat.total) * 100)}%`,
    };
  }

  const perLangAccuracy: Record<string, { pass: number; total: number; pct: string }> = {};
  for (const [lang, stat] of Object.entries(perLangStats)) {
    perLangAccuracy[lang] = {
      ...stat,
      pct: `${Math.round((stat.pass / stat.total) * 100)}%`,
    };
  }

  const conflictAccuracy = {
    pass: conflictStats.pass,
    total: conflictStats.total,
    pct:
      conflictStats.total === 0
        ? "N/A"
        : `${Math.round((conflictStats.pass / conflictStats.total) * 100)}%`,
  };

  const perTestSummary = testResults.map((tr) => ({
    id: tr.id,
    pass: tr.pass,
    fields_pass: tr.field_results.filter((f) => f.pass).length,
    fields_total: tr.field_results.length,
    error: tr.error,
  }));

  const report: EvalReport = {
    run_at: new Date().toISOString(),
    overall_accuracy: overallPct,
    total_fields_checked: totalChecked,
    total_fields_passed: totalPass,
    per_field_accuracy: perFieldAccuracy,
    per_language_accuracy: perLangAccuracy,
    conflict_detection_accuracy: conflictAccuracy,
    hard_cap_violations: hardCapViolationSummary,
    per_test_summary: perTestSummary,
    test_results: testResults,
  };

  // Write results
  fs.writeFileSync(resultsPath, JSON.stringify(report, null, 2), "utf-8");

  // ─── Human-readable summary ────────────────────────────────────────────────

  console.log("═".repeat(60));
  console.log("📊  EVAL RESULTS SUMMARY");
  console.log("═".repeat(60));
  console.log(`\n🎯  Overall Accuracy: ${overallPct}%  (${totalPass}/${totalChecked} fields)`);

  console.log("\n📐  Per-Field Accuracy:");
  for (const [field, stat] of Object.entries(perFieldAccuracy)) {
    const bar = stat.pass === stat.total ? "✅" : stat.pass === 0 ? "❌" : "⚠️ ";
    console.log(`   ${bar} ${field.padEnd(40)} ${stat.pass}/${stat.total}  (${stat.pct})`);
  }

  console.log("\n🌐  Per-Language Accuracy:");
  for (const [lang, stat] of Object.entries(perLangAccuracy)) {
    console.log(`   ${lang.padEnd(12)} ${stat.pass}/${stat.total}  (${stat.pct})`);
  }

  console.log("\n⚡  Conflict Detection:");
  if (conflictStats.total === 0) {
    console.log("   No conflict test cases found.");
  } else {
    const icon = conflictStats.pass === conflictStats.total ? "✅" : "❌";
    console.log(
      `   ${icon}  ${conflictStats.pass}/${conflictStats.total}  (${conflictAccuracy.pct})`
    );
  }

  console.log("\n🚨  Hard-Cap Violations:");
  if (hardCapViolationSummary.length === 0) {
    console.log("   ✅  None — all hard-capped fields correctly capped.");
  } else {
    for (const hc of hardCapViolationSummary) {
      console.log(`   ⛔  ${hc.test_id}:`);
      hc.violations.forEach((v) => console.log(`      - ${v}`));
    }
  }

  console.log("\n📋  Per-Test-Case Summary:");
  for (const s of perTestSummary) {
    const icon = s.pass ? "✅" : s.error ? "❌" : "⚠️ ";
    const errNote = s.error ? ` — ERROR: ${s.error.slice(0, 80)}` : "";
    console.log(`   ${icon}  ${s.id}  ${s.fields_pass}/${s.fields_total} fields${errNote}`);
  }

  console.log(`\n📁  Full results saved to: ${resultsPath}`);
  console.log("═".repeat(60) + "\n");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
