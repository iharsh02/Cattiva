import * as z from "zod/v4";

const metadataValue = z.union([z.string(), z.number(), z.boolean()]);
const metadata = z.record(z.string(), metadataValue);

const memoryId = z
  .string()
  .min(1)
  .describe(
    "The unique identifier of the memory. Must be obtained from a previous memory retrieval operation.",
  );

export const addMemoryInput = z.strictObject({
  content: z
    .string()
    .min(1)
    .describe(
      "One self-contained fact, written so it still makes sense with no surrounding conversation. Resolve pronouns to explicit names. Store exactly one fact per call.",
    ),
  metadata: metadata
    .optional()
    .describe(
      'Flat key-value tags for later filtering, e.g. {"domain": "math"}. Values must be strings, numbers, or booleans.',
    ),
  memory_type: z
    .string()
    .optional()
    .describe(
      "A short category label, e.g. 'user_info' or 'project_fact'. Reuse labels consistently so memories can be filtered later.",
    ),
});

export const retrieveMemoryInput = z.strictObject({
  query: z
    .string()
    .min(1)
    .describe(
      "Describe the information you need in natural language. Phrase it like the fact you hope to find, not as keywords.",
    ),
  // Paper default is 3. `.max()` is a crash guard, not a policy limit — how many
  // memories to pull is behaviour P_penalty is meant to shape, so keep it loose
  // enough that it never binds in normal use.
  top_k: z
    .number()
    .int()
    .positive()
    .max(100)
    .default(3)
    .describe(
      "How many memories to retrieve. Keep this small — retrieving more than you need wastes context.",
    ),
  metadata_filter: metadata
    .optional()
    .describe(
      'Optional exact-match filters over metadata, e.g. {"domain": "math"}. Omit to search all memories.',
    ),
});

export const updateMemoryInput = z.strictObject({
  memory_id: memoryId,
  content: z
    .string()
    .min(1)
    .describe("The corrected fact, replacing the stored content entirely. Still self-contained."),
  metadata: metadata
    .optional()
    .describe("Replacement metadata tags. Omit to leave existing tags unchanged."),
  // Intentionally no `memory_type` — the paper's Update_memory omits it.
});

export const deleteMemoryInput = z.strictObject({
  memory_id: memoryId,
  // Plain boolean, not z.literal(true): a `false` here is a well-formed call the
  // handler declines, not a malformed one, and those should read differently to
  // the model. The handler enforces the semantics.
  confirmation: z
    .boolean()
    .describe(
      "Must be true to proceed. Set this only when you are certain the memory should be permanently removed.",
    ),
});

export type AddMemoryInput = z.infer<typeof addMemoryInput>;
export type RetrieveMemoryInput = z.infer<typeof retrieveMemoryInput>;
export type UpdateMemoryInput = z.infer<typeof updateMemoryInput>;
export type DeleteMemoryInput = z.infer<typeof deleteMemoryInput>;
