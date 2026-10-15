import type { ReactNode } from "react";

type Props = {
  title: string;
  /** Una línea bajo el título que se ve también con la tarjeta plegada. */
  hint?: ReactNode;
  defaultOpen?: boolean;
  id?: string;
  children: ReactNode;
};

/** Tarjeta que se pliega y despliega sin JavaScript (`<details>`). */
export function CollapsibleCard({ title, hint, defaultOpen, id, children }: Props) {
  return (
    <details id={id} className="card collapsible" open={defaultOpen} aria-label={title}>
      <summary className="flex cursor-pointer items-start justify-between gap-4">
        <div>
          <h2 className="h2">{title}</h2>
          {hint && <p className="mt-0.5 line-clamp-1 text-sm text-muted">{hint}</p>}
        </div>
        <span aria-hidden className="chevron mt-1 text-muted">
          ▾
        </span>
      </summary>
      <div className="mt-4 flex flex-col gap-3">{children}</div>
    </details>
  );
}
