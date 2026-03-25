export type PlanStatus = "draft" | "active" | "completed" | "archived";
export type TaskStatus = "pending" | "in_progress" | "completed" | "cancelled";

/** 1 = low, 2 = normal, 3 = high, 4 = urgent */
export type TaskPriority = 1 | 2 | 3 | 4;

export const TASK_PRIORITY_LOW = 1 as const;
export const TASK_PRIORITY_NORMAL = 2 as const;
export const TASK_PRIORITY_HIGH = 3 as const;
export const TASK_PRIORITY_URGENT = 4 as const;

export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
  1: "low",
  2: "normal",
  3: "high",
  4: "urgent",
};

export function parseTaskPriority(value: string | number): TaskPriority {
  if (typeof value === "number" && value >= 1 && value <= 4) return value as TaskPriority;
  switch (String(value).toLowerCase()) {
    case "low":
    case "1":
      return 1;
    case "normal":
    case "2":
      return 2;
    case "high":
    case "3":
      return 3;
    case "urgent":
    case "4":
      return 4;
    default:
      return 2;
  }
}
