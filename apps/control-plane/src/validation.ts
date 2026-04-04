import { badRequest } from "./errors";

export function validationHook(result: { success: boolean; error?: { message: string } }) {
  if (!result.success) {
    throw badRequest("validation_failed", result.error!.message);
  }
}
