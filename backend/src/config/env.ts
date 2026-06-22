import { z } from "zod";

const envSchema = z.object({
  DB_HOST:     z.string().default("localhost"),
  DB_PORT:     z.coerce.number().default(5432),
  DB_NAME:     z.string().default("alloc_platform"),
  DB_USER:     z.string().default("postgres"),
  DB_PASSWORD: z.string().default("postgres"),
  PORT:        z.coerce.number().default(3001),
});

function loadEnv() {
  // Simple .env loader (no dotenv dependency needed for dev with tsx)
  try {
    const fs = require("fs");
    const path = require("path");
    const envPath = path.resolve(__dirname, "../../.env");
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, "utf-8");
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eqIdx = trimmed.indexOf("=");
        if (eqIdx === -1) continue;
        const key = trimmed.slice(0, eqIdx).trim();
        const val = trimmed.slice(eqIdx + 1).trim();
        if (!process.env[key]) process.env[key] = val;
      }
    }
  } catch {
    // Ignore - will use defaults
  }
}

loadEnv();

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Invalid environment variables:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
