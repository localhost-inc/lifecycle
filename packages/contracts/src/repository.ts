import { z } from "zod";

export const RepositoryRecordSchema = z
  .object({
    id: z.string(),
    path: z.string(),
    name: z.string(),
    slug: z.string(),
    manifestPath: z.string(),
    manifestValid: z.boolean(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .meta({ id: "RepositoryRecord" });

export type RepositoryRecord = z.infer<typeof RepositoryRecordSchema>;
