export function stackServiceProcessID(stackId: string, serviceName: string): string {
  return `${stackId}:${serviceName}`;
}

export function stackServiceContainerName(stackId: string, serviceName: string): string {
  return `lifecycle-${stackId}-${serviceName}`;
}
