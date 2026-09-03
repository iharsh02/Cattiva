import { smoothStream } from "ai";

export const SMOOTHING = smoothStream({ delayInMs: 12, chunking: "word" });
