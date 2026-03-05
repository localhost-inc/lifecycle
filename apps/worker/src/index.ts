export const WORKER_MESSAGE = "Lifecycle worker scaffold is running.";

export function getWorkerResponse(pathname: string) {
  return {
    status: 200,
    body: `${WORKER_MESSAGE} path=${pathname}`,
  } as const;
}
