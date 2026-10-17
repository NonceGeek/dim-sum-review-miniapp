export const TASK_TYPE_OPTIONS = [
  { label: "全部", value: "all" },
  { label: "分类抽检", value: "classification_check" },
  { label: "内容校对", value: "content_review" },
];

export function getTaskType(task: any): string {
  if (task.taskType === "category_review") return "classification_check";
  if (task.taskType === "data_review" || task.taskType === "error_fix") return "content_review";
  return task.taskType || "";
}

