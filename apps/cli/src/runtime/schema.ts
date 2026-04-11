import { z } from "zod";

export type SchemaShape = Record<string, z.ZodTypeAny>;

export function getSchemaShape(schema: z.ZodObject<z.ZodRawShape>): SchemaShape {
  return schema.shape as SchemaShape;
}
