-- Los valores de métricas son datos originales: inmutables (las correcciones son filas nuevas).
CREATE TRIGGER metric_values_immutable
  BEFORE UPDATE OR DELETE ON metric_values
  FOR EACH ROW EXECUTE FUNCTION mph_forbid_mutation();
--> statement-breakpoint
-- El CSV subido se conserva tal cual; solo cambia su estado, una vez (pending → applied/discarded).
CREATE OR REPLACE FUNCTION mph_guard_metric_import() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
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
CREATE TRIGGER metric_imports_guard
  BEFORE UPDATE OR DELETE ON metric_imports
  FOR EACH ROW EXECUTE FUNCTION mph_guard_metric_import();
--> statement-breakpoint
-- Un informe aprobado no se puede modificar: sus secciones quedan bloqueadas.
CREATE OR REPLACE FUNCTION mph_guard_report_sections() RETURNS trigger AS $$
DECLARE
  st report_status;
BEGIN
  SELECT status INTO st FROM reports
    WHERE project_id = COALESCE(NEW.project_id, OLD.project_id) AND id = COALESCE(NEW.report_id, OLD.report_id);
  IF st = 'approved' THEN
    RAISE EXCEPTION 'El informe está aprobado; reábrelo para modificarlo' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER report_sections_guard
  BEFORE INSERT OR UPDATE OR DELETE ON report_sections
  FOR EACH ROW EXECUTE FUNCTION mph_guard_report_sections();
--> statement-breakpoint
-- Un ciclo solo se cierra con su informe aprobado (segunda barrera, además del servicio).
CREATE OR REPLACE FUNCTION mph_guard_cycle_close() RETURNS trigger AS $$
BEGIN
  IF NEW.status = 'closed' AND OLD.status <> 'closed' AND NOT EXISTS (
    SELECT 1 FROM reports WHERE project_id = NEW.project_id AND cycle_id = NEW.id AND status = 'approved'
  ) THEN
    RAISE EXCEPTION 'Para cerrar el ciclo, el informe tiene que estar aprobado' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER cycles_guard_close
  BEFORE UPDATE ON cycles
  FOR EACH ROW EXECUTE FUNCTION mph_guard_cycle_close();
--> statement-breakpoint
-- Catálogo inicial (editable por un administrador). Definiciones orientativas.
INSERT INTO metric_definitions (key, kind, label, unit, description, source_note, default_aggregation, position) VALUES
  ('social.followers', 'social', 'Seguidores', 'count', 'Seguidores de la cuenta al final del periodo.', 'Dato del perfil en la plataforma o en Metricool.', 'last', 10),
  ('social.followers_gained', 'social', 'Nuevos seguidores', 'count', 'Seguidores ganados en el periodo. Según la herramienta puede ser el saldo neto (altas menos bajas).', 'Comprueba si tu herramienta da el dato neto o bruto.', 'sum', 20),
  ('social.posts', 'social', 'Publicaciones', 'count', 'Publicaciones hechas en el periodo.', NULL, 'sum', 30),
  ('social.reach', 'social', 'Alcance', 'count', 'Cuentas únicas que vieron el contenido. Ojo: sumar el alcance de cada día cuenta varias veces a la misma persona; si la herramienta da el alcance del mes, usa ese.', 'Definición de cada plataforma; puede variar entre redes.', 'sum', 40),
  ('social.impressions', 'social', 'Impresiones', 'count', 'Veces que se mostró el contenido (incluye repeticiones de la misma persona).', 'Algunas plataformas lo llaman visualizaciones.', 'sum', 50),
  ('social.interactions', 'social', 'Interacciones', 'count', 'Suma de reacciones, comentarios, compartidos y guardados, según lo que cuente la herramienta.', 'Comprueba qué acciones incluye tu herramienta.', 'sum', 60),
  ('social.engagement_rate', 'social', 'Tasa de interacción', 'percent', 'Interacciones respecto al alcance o a los seguidores, según la herramienta.', 'Cada herramienta la calcula de forma distinta: indica cuál usas.', 'average', 70),
  ('social.video_views', 'social', 'Reproducciones de vídeo', 'count', 'Reproducciones de vídeos y reels en el periodo.', 'El criterio de reproducción (segundos mínimos) depende de la plataforma.', 'sum', 80),
  ('social.link_clicks', 'social', 'Clics en enlaces', 'count', 'Clics en los enlaces de las publicaciones o del perfil.', NULL, 'sum', 90),
  ('social.profile_visits', 'social', 'Visitas al perfil', 'count', 'Visitas a la página del perfil en el periodo.', NULL, 'sum', 100),
  ('email.campaigns_sent', 'email', 'Campañas enviadas', 'count', 'Envíos de newsletter o campañas en el periodo.', NULL, 'sum', 10),
  ('email.subscribers', 'email', 'Suscriptores activos', 'count', 'Suscriptores activos al final del periodo.', 'Dato de MailerLite u otra herramienta de email.', 'last', 20),
  ('email.recipients', 'email', 'Destinatarios', 'count', 'Emails enviados (suma de destinatarios de las campañas).', NULL, 'sum', 30),
  ('email.opens', 'email', 'Aperturas únicas', 'count', 'Personas distintas que abrieron el email. La privacidad de algunos clientes de correo puede inflar o reducir este dato.', NULL, 'sum', 40),
  ('email.open_rate', 'email', 'Tasa de apertura', 'percent', 'Aperturas únicas respecto a emails entregados.', 'Usa el dato de la herramienta si lo da; promediar tasas es aproximado.', 'average', 50),
  ('email.clicks', 'email', 'Clics únicos', 'count', 'Personas distintas que hicieron clic en algún enlace.', NULL, 'sum', 60),
  ('email.click_rate', 'email', 'Tasa de clics', 'percent', 'Clics únicos respecto a emails entregados.', 'Usa el dato de la herramienta si lo da; promediar tasas es aproximado.', 'average', 70),
  ('email.unsubscribes', 'email', 'Bajas', 'count', 'Personas que se dieron de baja en el periodo.', NULL, 'sum', 80),
  ('email.bounces', 'email', 'Rebotes', 'count', 'Emails que no se pudieron entregar.', NULL, 'sum', 90);
