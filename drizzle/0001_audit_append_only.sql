-- audit_events es append-only: se prohíbe modificar o borrar filas (prueba DB-07).
CREATE OR REPLACE FUNCTION mph_forbid_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'La tabla % es inmutable (operación % no permitida)', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER audit_events_immutable
  BEFORE UPDATE OR DELETE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION mph_forbid_mutation();
--> statement-breakpoint
CREATE TRIGGER audit_events_no_truncate
  BEFORE TRUNCATE ON audit_events
  FOR EACH STATEMENT EXECUTE FUNCTION mph_forbid_mutation();
