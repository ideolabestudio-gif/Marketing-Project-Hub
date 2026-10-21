-- Eliminar un ciclo de prueba o creado por error: el servicio borra todo lo del ciclo en
-- una sola transacción tras marcarla con SET LOCAL mph.cycle_purge = '<id del ciclo>'.
-- Solo esa marca, que dura lo que la transacción, permite DELETE en las tablas que por lo
-- demás son inmutables. UPDATE sigue prohibido siempre. La auditoría y la ficha de marca
-- NO usan esta función: el borrado del ciclo queda registrado y no se puede borrar.
CREATE OR REPLACE FUNCTION mph_cycle_purge_active() RETURNS boolean AS $$
BEGIN
  RETURN coalesce(current_setting('mph.cycle_purge', true), '') <> '';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION mph_forbid_mutation_unless_cycle_purge() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' AND mph_cycle_purge_active() THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'La tabla % es inmutable (operación % no permitida)', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER content_versions_immutable ON content_versions;
--> statement-breakpoint
CREATE TRIGGER content_versions_immutable
  BEFORE UPDATE OR DELETE ON content_versions
  FOR EACH ROW EXECUTE FUNCTION mph_forbid_mutation_unless_cycle_purge();
--> statement-breakpoint
DROP TRIGGER content_version_assets_immutable ON content_version_assets;
--> statement-breakpoint
CREATE TRIGGER content_version_assets_immutable
  BEFORE UPDATE OR DELETE ON content_version_assets
  FOR EACH ROW EXECUTE FUNCTION mph_forbid_mutation_unless_cycle_purge();
--> statement-breakpoint
DROP TRIGGER assets_immutable ON assets;
--> statement-breakpoint
CREATE TRIGGER assets_immutable
  BEFORE UPDATE OR DELETE ON assets
  FOR EACH ROW EXECUTE FUNCTION mph_forbid_mutation_unless_cycle_purge();
--> statement-breakpoint
DROP TRIGGER asset_files_immutable ON asset_files;
--> statement-breakpoint
CREATE TRIGGER asset_files_immutable
  BEFORE UPDATE OR DELETE ON asset_files
  FOR EACH ROW EXECUTE FUNCTION mph_forbid_mutation_unless_cycle_purge();
--> statement-breakpoint
DROP TRIGGER approvals_immutable ON approvals;
--> statement-breakpoint
CREATE TRIGGER approvals_immutable
  BEFORE UPDATE OR DELETE ON approvals
  FOR EACH ROW EXECUTE FUNCTION mph_forbid_mutation_unless_cycle_purge();
--> statement-breakpoint
DROP TRIGGER publications_no_delete ON publications;
--> statement-breakpoint
CREATE TRIGGER publications_no_delete
  BEFORE DELETE ON publications
  FOR EACH ROW EXECUTE FUNCTION mph_forbid_mutation_unless_cycle_purge();
--> statement-breakpoint
DROP TRIGGER metric_values_immutable ON metric_values;
--> statement-breakpoint
CREATE TRIGGER metric_values_immutable
  BEFORE UPDATE OR DELETE ON metric_values
  FOR EACH ROW EXECUTE FUNCTION mph_forbid_mutation_unless_cycle_purge();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION mph_guard_metric_import() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF mph_cycle_purge_active() THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'Las importaciones no se borran' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NEW.raw_csv IS DISTINCT FROM OLD.raw_csv OR NEW.filename IS DISTINCT FROM OLD.filename
     OR NEW.project_id IS DISTINCT FROM OLD.project_id OR NEW.cycle_id IS DISTINCT FROM OLD.cycle_id
     OR NEW.channel_id IS DISTINCT FROM OLD.channel_id OR NEW.uploaded_by IS DISTINCT FROM OLD.uploaded_by THEN
    RAISE EXCEPTION 'El contenido de una importación no se puede modificar' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF OLD.status <> 'pending' THEN
    RAISE EXCEPTION 'La importación ya está resuelta' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION mph_guard_ai_generation() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF mph_cycle_purge_active() THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'Las generaciones de IA no se borran' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NEW.output IS DISTINCT FROM OLD.output OR NEW.project_id IS DISTINCT FROM OLD.project_id
     OR NEW.cycle_id IS DISTINCT FROM OLD.cycle_id OR NEW.content_item_id IS DISTINCT FROM OLD.content_item_id
     OR NEW.purpose IS DISTINCT FROM OLD.purpose OR NEW.input_refs IS DISTINCT FROM OLD.input_refs
     OR NEW.provider IS DISTINCT FROM OLD.provider OR NEW.model IS DISTINCT FROM OLD.model
     OR NEW.prompt_template IS DISTINCT FROM OLD.prompt_template
     OR NEW.prompt_template_version IS DISTINCT FROM OLD.prompt_template_version
     OR NEW.instructions IS DISTINCT FROM OLD.instructions OR NEW.error IS DISTINCT FROM OLD.error
     OR NEW.input_tokens IS DISTINCT FROM OLD.input_tokens OR NEW.output_tokens IS DISTINCT FROM OLD.output_tokens
     OR NEW.cost_usd IS DISTINCT FROM OLD.cost_usd OR NEW.requested_by IS DISTINCT FROM OLD.requested_by
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Una generación de IA no se puede modificar' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF OLD.status <> 'draft' OR NEW.status NOT IN ('used', 'discarded') THEN
    RAISE EXCEPTION 'La generación ya está resuelta' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
-- Un ciclo cerrado no se elimina (hay que reabrirlo antes): segunda barrera, además del servicio.
CREATE OR REPLACE FUNCTION mph_guard_cycle_delete() RETURNS trigger AS $$
BEGIN
  IF OLD.status = 'closed' THEN
    RAISE EXCEPTION 'Un ciclo cerrado no se puede eliminar; reábrelo antes' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER cycles_guard_delete
  BEFORE DELETE ON cycles
  FOR EACH ROW EXECUTE FUNCTION mph_guard_cycle_delete();
