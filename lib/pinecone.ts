import { Pinecone } from "@pinecone-database/pinecone";

export const pc = process.env.PINECONE_API_KEY
  ? new Pinecone({ apiKey: process.env.PINECONE_API_KEY })
  : null;

export const INDEX_NAME = "sarthi-ai-index";
export const NAMESPACE = "attribute-schemas";
export const SEO_NAMESPACE = "seo-corpus";
