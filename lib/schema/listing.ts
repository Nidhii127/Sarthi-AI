import { z } from "zod";

export const ALLOWED_CATEGORIES = [
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

export const ListingSchema = z.object({
  category: z.enum(ALLOWED_CATEGORIES),
  sub_category: z.string(),
  title: z.string(),
  title_seo_keywords: z.array(z.string()),
  attributes: z.record(z.string(), z.string().nullable()),
  description: z.string(),
  size_chart: z.array(
    z.object({
      size: z.string(),
      measurements_cm: z.record(z.string(), z.union([z.string(), z.number()])),
    })
  ),
  variants: z.array(
    z.object({
      size: z.string(),
      color: z.string(),
      stock_qty: z.number().nullable(),
    })
  ),
  pricing_inputs: z.object({
    seller_price: z.number().nullable(),
    mrp: z.number().nullable(),
    weight_grams: z.number().nullable(),
    gst_percent: z.number().nullable(),
    hsn_code: z.union([z.string(), z.number()]).nullable(),
  }),
  confidence_flags: z.array(
    z.object({
      field: z.string(),
      confidence: z.enum(["low", "medium", "high"]),
      reason: z.string(),
      seller_question: z.string().nullable(),
    })
  ),
  source_log: z.record(z.string(), z.string()),
});

export type Listing = z.infer<typeof ListingSchema>;
