-- Versiones, sus activos y los activos son inmutables: lo que se aprueba no puede cambiar.
CREATE TRIGGER content_versions_immutable
  BEFORE UPDATE OR DELETE ON content_versions
  FOR EACH ROW EXECUTE FUNCTION mph_forbid_mutation();
--> statement-breakpoint
CREATE TRIGGER content_version_assets_immutable
  BEFORE UPDATE OR DELETE ON content_version_assets
  FOR EACH ROW EXECUTE FUNCTION mph_forbid_mutation();
--> statement-breakpoint
CREATE TRIGGER assets_immutable
  BEFORE UPDATE OR DELETE ON assets
  FOR EACH ROW EXECUTE FUNCTION mph_forbid_mutation();
