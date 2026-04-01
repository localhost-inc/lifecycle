export type ApiErrorCode =
  | "unauthenticated"
  | "organization_not_found"
  | "organization_access_denied"
  | "organization_membership_missing"
  | "cloud_account_missing"
  | "cloud_token_invalid"
  | "cloud_token_expired"
  | "cloud_account_mismatch"
  | "cloud_permission_missing"
  | "repository_not_linked"
  | "repository_disconnected"
  | "workspace_provision_failed"
  | "workspace_attach_failed"
  | "workspace_branch_unresolved"
  | "workspace_not_found"
  | "provider_not_installed"
  | "provider_auth_missing"
  | "pull_request_not_found"
  | "pull_request_not_mergeable"
  | "branch_protection_blocked"
  | "project_not_found"
  | "validation_failed"
  | "internal_error";

export interface ApiErrorBody {
  code: ApiErrorCode;
  message: string;
  details?: Record<string, unknown>;
  suggestedAction?: string;
  retryable: boolean;
}

export class ApiError extends Error {
  readonly status: number;
  readonly body: ApiErrorBody;

  constructor(status: number, body: ApiErrorBody) {
    super(body.message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }

  toResponse(): Response {
    return Response.json({ error: this.body }, { status: this.status });
  }
}

export function unauthenticated(message = "Authentication required."): ApiError {
  return new ApiError(401, {
    code: "unauthenticated",
    message,
    suggestedAction: "Run `lifecycle auth login` to sign in.",
    retryable: false,
  });
}

export function notFound(code: ApiErrorCode, message: string): ApiError {
  return new ApiError(404, {
    code,
    message,
    retryable: false,
  });
}

export function forbidden(code: ApiErrorCode, message: string): ApiError {
  return new ApiError(403, {
    code,
    message,
    retryable: false,
  });
}

export function badRequest(code: ApiErrorCode, message: string, suggestedAction?: string): ApiError {
  return new ApiError(400, {
    code,
    message,
    ...(suggestedAction !== undefined ? { suggestedAction } : {}),
    retryable: false,
  });
}
