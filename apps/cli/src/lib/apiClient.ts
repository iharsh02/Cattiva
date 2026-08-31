import { hc } from "hono/client";
import type { AppType } from "@cattiva/server";

export const apiClient = hc<AppType>(process.env.CATTIVA_API_URL ?? "http://localhost:3000");
