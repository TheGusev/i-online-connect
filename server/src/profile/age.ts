import { z } from "zod";

export const profileAgeSchema = z.number().int().min(18).max(100);