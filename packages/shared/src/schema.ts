import { z } from "zod";
import { EFFORT_LEVELS, REASONING } from "./model";

export const reasoningSchema = z.enum(REASONING);

export const effortSchema = z.enum(EFFORT_LEVELS);

export const toolCallArgsSchema = z.record(z.string(), z.json());

export const messagePartSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("reasoning"),
    text: z.string(),
  }),
  z.object({
    type: z.literal("tool-call"),
    toolCallId: z.string(),
    toolName: z.string(),
    args: toolCallArgsSchema,
    result: z.string().optional(),
  }),
  z.object({
    type: z.literal("text"),
    text: z.string(),
  }),
]);

export const messagePartsSchema = z.array(messagePartSchema);

export type MessagePart = z.infer<typeof messagePartSchema>;

// tool call args
export const chatStreamEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("text-delta"),
    text: z.string(),
  }),
  z.object({
    type: z.literal("reasoning-delta"),
    text: z.string(),
  }),
  z.object({
    type: z.literal("tool-call"),
    toolCallId: z.string(),
    toolName: z.string(),
    args: toolCallArgsSchema,
  }),
  z.object({
    type: z.literal("done"),
    messageId: z.string(),
    durationMs: z.number(),
  }),
  z.object({
    type: z.literal("error"),
    message: z.string(),
  }),
]);

export type ChatStreamEvent = z.infer<typeof chatStreamEventSchema>;
