import type { Metadata } from "next";
import type { ReactNode } from "react";
import { PrintButton } from "@/components/print-button";

export const metadata: Metadata = { title: "Ayuda" };

/**
 * Guía de uso dentro de la app. Cada página enlaza a su apartado con «? Ayuda»
 * (`/ayuda#<id>`), así que los ids de las secciones no deben cambiar.
 */
const SECTIONS: { id: string; title: string; body: ReactNode }[] = [
  {
    id: "que-es",
    title: "Qué es el Hub",
    body: (
      <>
        <p>
          La herramienta interna de Ideolab para llevar, cliente a cliente, el ciclo mensual de redes sociales y email:
          planificar el mes, preparar cada pieza, aprobarla, registrar cuándo se programa o publica, recoger las métricas y
          entregar el informe. Tres reglas explican casi todo:
        </p>
        <ul>
          <li>
            <strong>El Hub no publica ni envía nada.</strong> Programas en Metricool o envías en MailerLite, y luego lo
            registras aquí. Solo se puede registrar como programada o publicada una pieza aprobada.
          </li>
          <li>
            <strong>Cada proyecto está aislado.</strong> Lo de un cliente nunca aparece en otro; solo ves los proyectos de
            los que eres miembro.
          </li>
          <li>
            <strong>Nada se pisa.</strong> Cambiar un texto crea una versión nueva, corregir una métrica crea un valor
            nuevo, y lo que propone Claude se guarda aparte hasta que una persona decide usarlo.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "moverse",
    title: "Cómo moverte",
    body: (
      <>
        <p>
          Arriba están siempre <strong>Mis proyectos</strong> (el inicio), <strong>Conexiones</strong>,{" "}
          <strong>Ayuda</strong> y, si eres administradora, <strong>Administración</strong>.
        </p>
        <p>Dentro de un proyecto hay dos menús fijos:</p>
        <ul>
          <li>
            <strong>Menú del proyecto</strong>: Resumen · el mes en curso · Ficha del cliente · Ajustes, y el botón{" "}
            <em>Abrir Metricool ↗</em>.
          </li>
          <li>
            <strong>Menú del mes</strong>: Plan · Brief · Métricas · Informe. Las flechas ‹ › de la derecha llevan a la misma
            sección del mes anterior o del siguiente.
          </li>
        </ul>
        <p>
          Encima del título de cada página, las <strong>migas de pan</strong> (Inicio / Proyecto / Mes / …) llevan a
          cualquier nivel superior de un clic, y <em>? Ayuda</em> abre el apartado de esta guía que explica esa página.
        </p>
      </>
    ),
  },
  {
    id: "inicio",
    title: "Inicio",
    body: (
      <>
        <p>Reúne lo que te toca en todos tus proyectos. Arriba hay tres contadores que llevan a su lista:</p>
        <ul>
          <li>
            <strong>Vencen esta semana</strong>: piezas con fecha de lunes a domingo. Las que tienen fecha pasada y no
            están programadas ni publicadas salen en rojo como <em>Atrasadas</em>.
          </li>
          <li>
            <strong>Por programar en Metricool</strong>: piezas aprobadas que aún no has programado.
          </li>
          <li>
            <strong>Pendiente de mí</strong>: lo que espera una acción tuya (revisar, registrar la respuesta del cliente,
            ver los cambios pedidos, confirmar que se publicó).
          </li>
        </ul>
        <p>
          Al final, <strong>Mis proyectos</strong>: cada tarjeta dice cómo va el mes en curso (piezas, aprobadas y
          programadas) y tiene un botón para ir directo a ese mes.
        </p>
      </>
    ),
  },
  {
    id: "proyecto",
    title: "El proyecto",
    body: (
      <>
        <p>
          El <strong>Resumen</strong> muestra tu rol, la zona horaria (todas las horas del proyecto van en ella), los meses
          (el mes en curso, marcado), los canales y el equipo. Desde aquí se abre un mes nuevo y se prepara el calendario
          del mes que viene.
        </p>
        <table>
          <thead>
            <tr>
              <th>Rol</th>
              <th>Qué puede hacer</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Responsable de cuenta</td>
              <td>Todo: ajustes, abrir, cerrar y eliminar meses, escribir, aprobar, registrar al cliente, programar, métricas e informes</td>
            </tr>
            <tr>
              <td>Editor</td>
              <td>Escribir piezas, usar Claude, registrar programación y publicación, métricas y borradores de informe</td>
            </tr>
            <tr>
              <td>Revisor</td>
              <td>Aprobar o pedir cambios (revisión interna) y aprobar informes</td>
            </tr>
            <tr>
              <td>Solo lectura</td>
              <td>Ver el proyecto</td>
            </tr>
          </tbody>
        </table>
        <p>Un proyecto archivado queda en solo lectura para todo el mundo.</p>
      </>
    ),
  },
  {
    id: "ficha",
    title: "Ficha del cliente",
    body: (
      <>
        <p>Lo estable de la marca, en la pestaña Ficha del cliente:</p>
        <ul>
          <li>
            <strong>Contexto de marca</strong>: tono, público, qué se dice y qué no. Cada «Guardar ficha» crea una versión
            nueva.
          </li>
          <li>
            <strong>Biblioteca de materiales</strong>: logos, guía de marca, fotos y plantillas, como archivo o enlace
            (Drive, Canva…). Conviene usar enlaces: en el servidor actual los archivos subidos pueden perderse al
            reiniciarse.
          </li>
        </ul>
        <p>La ficha va incluida en todo lo que el Hub prepara para Claude: cuanto más completa, mejores propuestas.</p>
      </>
    ),
  },
  {
    id: "ajustes",
    title: "Ajustes del proyecto",
    body: (
      <>
        <p>Solo la responsable de cuenta. Arriba hay un índice para saltar a cada apartado:</p>
        <ul>
          <li>
            <strong>General</strong>: zona horaria, idioma y cómo se aprueba (trabajo en solitario, exigir la aprobación del
            cliente, separación de funciones).
          </li>
          <li>
            <strong>Enlaces</strong>: la dirección de <em>Abrir Metricool</em> y la de <em>Crear diseño</em> (Claude
            Design), que aparece en cada pieza de redes. Si la dejas vacía, el botón no sale.
          </li>
          <li>
            <strong>Borradores con IA</strong>: solo hace falta si un día se configura la API; copiar y pegar funciona sin
            ella.
          </li>
          <li>
            <strong>Canales</strong>: redes, newsletter y tienda online (WooCommerce), con su cuenta o lista. Sin un canal
            activo no se pueden crear piezas. También se llega con «Gestionar canales» desde el Resumen.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "mes",
    title: "El mes: plan y brief",
    body: (
      <>
        <p>
          Cada mes de cada cliente es un ciclo. Arriba del Plan, <strong>Cómo va el mes</strong> enseña los siete pasos
          (planificar, producir, aprobar, programar, medir, informe y cerrar), calculados con lo que ya está registrado, y
          un botón con el <strong>siguiente paso</strong> que lleva a donde se hace.
        </p>
        <ol>
          <li>
            <strong>Abrir el mes.</strong> En el Resumen del proyecto, «Abrir ciclo». «Preparar calendario del mes que
            viene» lo abre por ti.
          </li>
          <li>
            <strong>Brief.</strong> En la pestaña Brief: objetivos, fechas clave y notas. Claude lo recibe en todo lo que
            le pides del mes.
          </li>
          <li>
            <strong>Piezas.</strong> «+ Nueva pieza» (título, canal y formato, fecha), o el <em>Calendario con IA</em> e{" "}
            <em>Ideas con IA</em> más abajo en el Plan.
          </li>
          <li>
            <strong>Seguimiento.</strong> Vista Calendario (cada pieza con el color y el símbolo de su estado; la leyenda
            está debajo) o Lista. Las piezas sin fecha salen aparte.
          </li>
          <li>
            <strong>Cerrar.</strong> Con el informe aprobado, escribe los aprendizajes y pulsa «Cerrar ciclo»: el mes
            queda en solo lectura. La responsable puede reabrirlo indicando el motivo.
          </li>
        </ol>
        <p>
          <strong>Eliminar este ciclo</strong> (al final del Plan, solo la responsable) borra un mes de prueba o creado por
          error con todo lo que contiene. No se puede deshacer: hay que escribir el mes (AAAA-MM) para confirmar, y no se
          puede con el mes cerrado ni con el informe aprobado.
        </p>
      </>
    ),
  },
  {
    id: "piezas",
    title: "Piezas: escribir, aprobar y programar",
    body: (
      <>
        <p>
          Una pieza es un post, reel, story, carrusel o email con su canal y su fecha. Su estado no se toca a mano: el Hub
          lo deduce de lo registrado. Idea → Borrador → En revisión interna → Pendiente del cliente (si el proyecto lo
          exige) → Aprobada → Programada → Publicada; también Cambios pedidos y Cancelada.
        </p>
        <ol>
          <li>
            <strong>Escribir</strong> en Contenido y «Guardar como nueva versión». El historial guarda y compara todas.
          </li>
          <li>
            <strong>Adjuntar</strong> archivos, enlaces o materiales de la biblioteca. En redes, <em>Crear diseño ↗</em>{" "}
            abre Claude Design.
          </li>
          <li>
            <strong>Aprobar</strong>: «Enviar vN a revisión» y un revisor registra su decisión. Si el proyecto lo exige,
            registras la respuesta del cliente con quién respondió y la evidencia.
          </li>
          <li>
            <strong>Programar</strong>: en una pieza de redes aprobada, «Copiar para Metricool» y pégalo en un chat de Claude
            con el conector de Metricool; la deja como pendiente de revisión y tú la programas allí. En el Plan,{" "}
            <em>Llevar el mes a Metricool con Claude</em> hace lo mismo con todas las aprobadas a la vez. Los emails se
            montan y envían en MailerLite.
          </li>
          <li>
            <strong>Registrar</strong>: «La he programado» o «Ya está publicada», y «Confirmar publicación» cuando salga.
          </li>
        </ol>
        <p>
          Cambiar el texto de una pieza aprobada crea una versión nueva que hay que volver a aprobar. Una pieza programada
          o publicada ya no se puede editar.
        </p>
        <p>
          <strong>Trabajo en solitario</strong> (Ajustes › General): la pieza se aprueba en un paso con «Aprobar vN», sin
          revisión ni cliente. Queda registrado igual quién aprobó qué versión.
        </p>
      </>
    ),
  },
  {
    id: "claude",
    title: "Trabajar con Claude sin API de pago",
    body: (
      <>
        <p>El Hub usa tu suscripción de Claude. Claude solo propone; una persona decide qué se usa.</p>
        <ul>
          <li>
            <strong>Copiar y pegar</strong>: los bloques «Copiar texto para Claude» (calendario, borradores, lectura del
            informe) y «Copiar petición para Claude» (métricas) dan un texto con los datos del proyecto; pegas la respuesta
            donde se indica y la revisas antes de usarla.
          </li>
          <li>
            <strong>Conector del Hub</strong>: en Conexiones está la dirección para añadirlo en claude.ai (Ajustes ›
            Conectores › Añadir conector personalizado). Claude puede ver tus proyectos, preparar el calendario, redactar
            borradores, preparar la lectura del informe y subir CSV de métricas. Nada se aprueba, publica ni envía desde
            Claude.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "metricas",
    title: "Métricas del mes",
    body: (
      <>
        <p>
          El Hub solo guarda datos que alguien registra o importa, siempre con su fuente; lo que falta sale como «sin dato»
          en el informe. Arriba, <strong>Traer las métricas</strong> ofrece tres caminos:
        </p>
        <ol>
          <li>
            <strong>Pedírselas a Claude</strong> (redes): «Copiar petición para Claude» y pégala en un chat con el conector
            de Metricool. Si también tiene el conector del Hub, sube un CSV por red; si no, te los da para subirlos tú.
          </li>
          <li>
            <strong>Subir un CSV</strong>: exportación de Metricool o MailerLite, el informe de Ingresos de WooCommerce o
            una hoja de cálculo. Elige el canal y pulsa «Subir CSV».
          </li>
          <li>
            <strong>A mano</strong>: en la tarjeta de cada canal, «Registrar o corregir un valor a mano». Corregir no borra:
            el anterior queda en el historial.
          </li>
        </ol>
        <p>
          Un CSV no cuenta hasta que lo revisas: abre la importación (si hay alguna esperando, sale un aviso arriba), mira
          la vista previa, asigna de qué columna sale cada métrica y cómo se resumen las filas (suma para el alcance diario,
          última fila para seguidores…) y pulsa «Aplicar importación», o «Descartar importación» si no era el archivo.
        </p>
      </>
    ),
  },
  {
    id: "informe",
    title: "Informe mensual",
    body: (
      <>
        <ol>
          <li>
            <strong>Crear.</strong> Nace con una estructura propuesta, o con la del mes anterior.
          </li>
          <li>
            <strong>Editar en el sitio.</strong> Cada sección se edita sobre el propio informe; las tablas de datos se
            rellenan solas con las métricas (este mes, mes anterior, variación y tendencia de seis meses) y con lo
            publicado. Puedes destacar hasta cuatro cifras arriba.
          </li>
          <li>
            <strong>Lectura de los resultados con Claude</strong> (opcional): por el conector o copiando y pegando. Se añade
            marcada como asistida por IA y hay que pulsar «La he revisado».
          </li>
          <li>
            <strong>Aprobar.</strong> «Antes de aprobar» avisa de lo que falta. Al aprobarlo queda bloqueado; «Reabrir
            informe» si hay que corregir.
          </li>
          <li>
            <strong>Entregar.</strong> «Ver para imprimir / PDF» y guárdalo como PDF desde el navegador.
          </li>
        </ol>
      </>
    ),
  },
  {
    id: "administracion",
    title: "Administración",
    body: (
      <ul>
        <li>
          <strong>Clientes y proyectos</strong>: crear clientes y proyectos, añadir o retirar miembros, cambiar roles y
          archivar o reactivar.
        </li>
        <li>
          <strong>Usuarios</strong>: dar de alta con el email de Google y activar o desactivar.
        </li>
        <li>
          <strong>Catálogo de métricas</strong>: las métricas que se pueden registrar, comunes a todos los proyectos.
        </li>
      </ul>
    ),
  },
  {
    id: "preguntas",
    title: "Preguntas frecuentes",
    body: (
      <dl>
        <dt>No puedo editar una pieza.</dt>
        <dd>Está programada o publicada, el mes está cerrado, el proyecto está archivado o tu rol no lo permite.</dd>
        <dt>No me deja aprobar mi propia pieza.</dt>
        <dd>Está activada la separación de funciones: tiene que aprobarla otra persona, o activa el trabajo en solitario.</dd>
        <dt>No me deja registrarla como programada.</dt>
        <dd>Solo se puede con la última versión aprobada. Si guardaste una versión nueva, hay que volver a aprobarla.</dd>
        <dt>He registrado una métrica mal.</dt>
        <dd>Registra el valor correcto: sustituye al anterior y el error queda en el historial.</dd>
        <dt>No puedo cerrar el mes.</dt>
        <dd>El informe tiene que estar aprobado antes.</dd>
        <dt>¿Puede Claude publicar por mí?</dt>
        <dd>No. Deja borradores en el Hub y publicaciones pendientes de revisión en Metricool. Programar, enviar y aprobar lo haces tú.</dd>
      </dl>
    ),
  },
];

export default function HelpPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="h1">Ayuda</h1>
          <p className="mt-1 text-sm text-muted">Guía de uso del Marketing Project Hub.</p>
        </div>
        <PrintButton />
      </div>

      <nav aria-label="Apartados de la ayuda" className="card no-print">
        <h2 className="eyebrow">Apartados</h2>
        <ol className="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2 lg:grid-cols-3">
          {SECTIONS.map((s) => (
            <li key={s.id}>
              <a href={`#${s.id}`} className="link">
                {s.title}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      {SECTIONS.map((s) => (
        <section key={s.id} id={s.id} className="card help-section scroll-mt-20">
          <h2 className="h2">{s.title}</h2>
          <div className="help-body mt-3">{s.body}</div>
        </section>
      ))}
    </div>
  );
}
