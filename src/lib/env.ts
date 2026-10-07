import { z } from "zod";
import "server-only";
import { isConfigured } from "@/lib/config";

const schema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().optional(),
  DATABASE_URL: z.string().optional(),
  QUATRE_GATEWAY_URL: z.string().url().optional(),
  QUATRE_GATEWAY_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  GOOGLE_AI_API_KEY: z.string().optional(),
  XAI_API_KEY: z.string().optional(),
});

export const env = schema.parse(process.env);
export const hasSupabase = isConfigured(env.NEXT_PUBLIC_SUPABASE_URL) && isConfigured(env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
export const hasDatabase = Boolean(env.DATABASE_URL);
