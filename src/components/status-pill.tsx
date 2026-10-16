import { WORKFLOW_LABELS, type WorkflowStatus } from "@/modules/review/domain";

/** Color de cada pieza según su estado (calendario del ciclo y panel de inicio). Los tonos están en globals.css. */
export const STATUS_STYLES: Record<WorkflowStatus, string> = {
  idea: "bg-background border border-border",
  draft: "bg-background border border-border",
  in_review: "bg-status-review text-status-review-ink",
  awaiting_client: "bg-status-review text-status-review-ink",
  changes_requested: "bg-status-changes text-status-changes-ink",
  approved: "bg-status-approved text-status-approved-ink",
  scheduled: "bg-status-scheduled text-status-scheduled-ink",
  published: "bg-status-published text-status-published-ink",
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
