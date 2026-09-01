import {
  buildNamespacedNativeEnums,
  type NamespacedNativeEnums,
} from "@prisma/orm-postgres/runtime";

import type { Contract } from "./prisma/contract.d.ts";
import contractJson from "./prisma/contract.json" with { type: "json" };

const enums = buildNamespacedNativeEnums(
  contractJson.storage as unknown as Contract["storage"],
) as NamespacedNativeEnums<Contract>;

export const Role = enums.public.Role.members;
export const Mode = enums.public.Mode.members;
export const MessageStatus = enums.public.MessageStatus.members;

export type Role = typeof enums.public.Role.Value;
export type Mode = typeof enums.public.Mode.Value;
export type MessageStatus = typeof enums.public.MessageStatus.Value;
