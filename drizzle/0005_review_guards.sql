-- Las decisiones de revisión son inmutables.
CREATE TRIGGER approvals_immutable
  BEFORE UPDATE OR DELETE ON approvals
  FOR EACH ROW EXECUTE FUNCTION mph_forbid_mutation();
--> statement-breakpoint
-- Principio "nada se publica sin aprobación humana", garantizado también en la BD:
-- solo se registra la publicación de la ÚLTIMA versión, sin cambios pedidos, con
-- aprobación interna y, si el proyecto lo exige, del cliente.
CREATE OR REPLACE FUNCTION mph_check_publishable() RETURNS trigger AS $$
DECLARE
  needs_client boolean;
  latest_version uuid;
BEGIN
  SELECT require_client_approval INTO needs_client FROM projects WHERE id = NEW.project_id;
  SELECT id INTO latest_version FROM content_versions
    WHERE project_id = NEW.project_id AND content_item_id = NEW.content_item_id
    ORDER BY version_no DESC LIMIT 1;
  IF latest_version IS DISTINCT FROM NEW.content_version_id THEN
    RAISE EXCEPTION 'Solo se puede publicar la última versión de la pieza' USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM approvals WHERE project_id = NEW.project_id
               AND content_version_id = NEW.content_version_id AND decision = 'changes_requested') THEN
    RAISE EXCEPTION 'La versión tiene cambios pedidos' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM approvals WHERE project_id = NEW.project_id
                   AND content_version_id = NEW.content_version_id AND stage = 'internal' AND decision = 'approved')
     OR (needs_client AND NOT EXISTS (SELECT 1 FROM approvals WHERE project_id = NEW.project_id
                   AND content_version_id = NEW.content_version_id AND stage = 'client' AND decision = 'approved')) THEN
    RAISE EXCEPTION 'La versión no tiene las aprobaciones necesarias' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER publications_require_approval
  BEFORE INSERT ON publications
  FOR EACH ROW EXECUTE FUNCTION mph_check_publishable();
--> statement-breakpoint
-- Una publicación no cambia de pieza ni de versión; cancelada o publicada es definitiva.
CREATE OR REPLACE FUNCTION mph_guard_publication_update() RETURNS trigger AS $$
BEGIN
  IF NEW.project_id IS DISTINCT FROM OLD.project_id
     OR NEW.content_item_id IS DISTINCT FROM OLD.content_item_id
     OR NEW.content_version_id IS DISTINCT FROM OLD.content_version_id
     OR NEW.authorized_by IS DISTINCT FROM OLD.authorized_by
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'No se puede cambiar la pieza, la versión ni el autor de una publicación'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF OLD.status = 'cancelled' OR (OLD.status = 'published' AND NEW.status <> 'published') THEN
    RAISE EXCEPTION 'Una publicación % no se puede modificar', OLD.status USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER publications_guard_update
  BEFORE UPDATE ON publications
  FOR EACH ROW EXECUTE FUNCTION mph_guard_publication_update();
--> statement-breakpoint
CREATE TRIGGER publications_no_delete
  BEFORE DELETE ON publications
  FOR EACH ROW EXECUTE FUNCTION mph_forbid_mutation();
