import { WORKFLOW_LABELS, type WorkflowStatus } from "@/modules/review/domain";

/** Color de cada pieza según su estado (calendario del ciclo y panel de inicio). */
export const STATUS_STYLES: Record<WorkflowStatus, string> = {
  idea: "bg-background border border-border",
  draft: "bg-background border border-border",
  in_review: "bg-amber-100 text-amber-950",
  awaiting_client: "bg-amber-100 text-amber-950",
  changes_requested: "bg-red-100 text-red-950",
  approved: "bg-sky-100 text-sky-950",
  scheduled: "bg-indigo-100 text-indigo-950",
  published: "bg-green-100 text-green-950",
  cancelled: "bg-background border border-border line-through opacity-60",
};

export function StatusPill({ status }: { status: WorkflowStatus }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${STATUS_STYLES[status]}`}
    >
      {WORKFLOW_LABELS[status]}
    </span>
  );
}
