export interface ProjectRecord {
  id: string;
  path: string;
  name: string;
  manifestPath: string;
  manifestValid: boolean;
  organizationId?: string;
  repositoryId?: string;
  createdAt: string;
  updatedAt: string;
}
