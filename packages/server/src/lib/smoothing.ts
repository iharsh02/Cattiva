import { smoothStream } from "ai";
import type { ToolContracts } from "@cattiva/shared";

export const SMOOTHING = smoothStream<ToolContracts>({ delayInMs: 12, chunking: "word" });
