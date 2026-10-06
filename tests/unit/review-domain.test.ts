import { describe, expect, it } from "vitest";
import { deriveVersionState, effectiveStatus, type ReviewEvent } from "@/modules/review/domain";

const submitted: ReviewEvent = { stage: "submission", decision: "submitted" };
const internalOk: ReviewEvent = { stage: "internal", decision: "approved" };
const clientOk: ReviewEvent = { stage: "client", decision: "approved" };

describe("estado de revisión de una versión", () => {
  it("recorre borrador → revisión → pendiente del cliente → aprobada", () => {
    expect(deriveVersionState([], true)).toBe("draft");
    expect(deriveVersionState([submitted], true)).toBe("in_review");
    expect(deriveVersionState([submitted, internalOk], true)).toBe("awaiting_client");
    expect(deriveVersionState([submitted, internalOk, clientOk], true)).toBe("approved");
  });

  it("sin aprobación de cliente exigida, basta la interna", () => {
    expect(deriveVersionState([submitted, internalOk], false)).toBe("approved");
  });

  it("cualquier petición de cambios manda", () => {
    expect(deriveVersionState([submitted, { stage: "internal", decision: "changes_requested" }], true)).toBe(
      "changes_requested",
    );
    expect(
      deriveVersionState([submitted, internalOk, { stage: "client", decision: "changes_requested" }], true),
    ).toBe("changes_requested");
  });

  it("una aprobación del cliente sin la interna no basta", () => {
    expect(deriveVersionState([submitted, clientOk], true)).toBe("in_review");
  });
});

describe("estado efectivo de la pieza", () => {
  it("la publicación activa manda; luego cancelada; luego idea/estado de versión", () => {
    const base = { cancelled: false, hasVersion: true, versionState: "approved" as const, activePublication: null };
    expect(effectiveStatus({ ...base, activePublication: "scheduled" })).toBe("scheduled");
    expect(effectiveStatus({ ...base, cancelled: true })).toBe("cancelled");
    expect(effectiveStatus({ ...base, hasVersion: false, versionState: "draft" })).toBe("idea");
    expect(effectiveStatus(base)).toBe("approved");
  });
});
