export class BridgeError extends Error {
  readonly code: string;
  readonly status: 400 | 401 | 403 | 404 | 409 | 422;

  constructor(input: { code: string; message: string; status: 400 | 401 | 403 | 404 | 409 | 422 }) {
    super(input.message);
    this.name = "BridgeError";
    this.code = input.code;
    this.status = input.status;
  }
}
