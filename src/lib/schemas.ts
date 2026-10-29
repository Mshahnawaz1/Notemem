import { z } from "zod";

// Shared by the HTTP and MCP layers. Every external input goes through one of these.

export const PAD_NAME_MAX_LENGTH = 64;

export const padNameSchema = z
  .string()
  .max(PAD_NAME_MAX_LENGTH, `Pad names are at most ${PAD_NAME_MAX_LENGTH} characters.`)
  .regex(
    /^[A-Za-z0-9][A-Za-z0-9._-]*$/,
    "Pad names use letters, digits, '.', '_' and '-', and start with a letter or digit."
  );

export const sourceSchema = z.enum(["api", "mcp", "web"]);
export type Source = z.infer<typeof sourceSchema>;

export const versionSchema = z.number().int().positive("Pad versions start at 1.");

// Accepts `3` and the standard quoted ETag form `"3"` (optionally weak, `W/"3"`).
export const ifMatchSchema = z
  .string()
  .trim()
  .regex(/^(W\/)?"?\d+"?$/, "If-Match must be a pad version number, e.g. If-Match: 3.")
  .transform((value) => Number(value.replace(/^W\//, "").replaceAll('"', "")))
  .pipe(versionSchema);

// Only `*` makes sense for a pad: "create it, but only if it doesn't exist yet".
export const ifNoneMatchSchema = z
  .string()
  .trim()
  .refine((value) => value === "*", "If-None-Match only accepts *, meaning: create the pad only if it doesn't exist.");

export const replaceBodySchema = z.object({ content: z.string() });
export const appendBodySchema = z.object({ text: z.string() });

const sha256HexSchema = z.string().regex(/^[0-9a-f]{64}$/);
export const roomKeysSchema = z.object({ readHash: sha256HexSchema, writeHash: sha256HexSchema });

/** First issue of a failed parse, phrased for an agent to act on. */
export function describeIssue(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return "Invalid input.";
  const path = issue.path.length ? `${issue.path.join(".")}: ` : "";
  return `${path}${issue.message}`;
}
