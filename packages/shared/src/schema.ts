import { z } from "zod";
import { EFFORT_LEVELS, REASONING } from "./model";

export const reasoningSchema = z.enum(REASONING);

export const effortSchema = z.enum(EFFORT_LEVELS);
