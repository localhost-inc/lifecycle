export const API_MESSAGE = "Lifecycle API scaffold is running.";

export function getApiResponse(pathname: string) {
  return {
    status: 200,
    body: `${API_MESSAGE} path=${pathname}`,
  } as const;
}
