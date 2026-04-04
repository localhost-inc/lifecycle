import { Daytona } from "@daytonaio/sdk";

const DAYTONA_API_URL = "https://app.daytona.io/api";

export function createDaytona(apiKey: string) {
  return new Daytona({
    apiKey,
    apiUrl: DAYTONA_API_URL,
    target: "us",
  });
}
