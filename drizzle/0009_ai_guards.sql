-- Lo que generó la IA no se reescribe ni se borra: solo cambia su estado, una vez
-- (draft → used | discarded). Las generaciones fallidas quedan como están.
CREATE OR REPLACE FUNCTION mph_guard_ai_generation() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
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
CREATE TRIGGER ai_generations_guard
  BEFORE UPDATE OR DELETE ON ai_generations
  FOR EACH ROW EXECUTE FUNCTION mph_guard_ai_generation();
