import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCotizacionDto } from './dto/create-cotizacion.dto';
import { UpdateCotizacionDto } from './dto/update-cotizacion.dto';
import { AusenciasService } from '../ausencias/ausencias.service';
import { esDiaNoLaboral } from '../common/fecha/feriados-peru';
import { validarOrdenCronologico } from '../common/validacion/orden-etapas';

export type EstadoCotizacion = 'RECIBIDO' | 'COTIZADO' | 'APROBADO' | 'AVISADO_ALMACEN';

export type TipoAlertaCotizacion = 'FERIADO_O_FIN_DE_SEMANA' | 'AUSENCIA_REGISTRADA' | 'CARGA_TARDIA';

export interface AlertaCotizacion {
  campo: 'requerimientoEn' | 'cotizacionEnviadaEn' | 'pedidoAprobadoEn' | 'avisoAlmacenEn';
  tipo: TipoAlertaCotizacion;
  motivo?: string;
}

export interface HistorialCotizacionItem {
  id: number;
  campo: string;
  valorAnterior: string | null;
  valorNuevo: string | null;
  motivo: string | null;
  editadoPor: { id: number; nombre: string };
  editadoEn: Date;
}

export interface PedidoRelacionado {
  id: number;
  numeroProforma: string;
  recibidoEn: Date;
  inicioPreparacionEn: Date | null;
  preparadoEn: Date | null;
  salioEn: Date | null;
  entregadoEn: Date | null;
  tokenSeguimiento: string;
}

// numeroProforma se compara tal cual llega el PATCH (ver calcularCambiosSimples). requerimientoEn
// se puede cargar/editar libremente (ver más abajo). Las otras 3 se fijan con la hora real de
// servidor al marcar por primera vez, y solo un Admin puede corregirlas después.
export type CampoRastreado =
  | 'numeroProforma'
  | 'requerimientoEn'
  | 'cotizacionEnviadaEn'
  | 'pedidoAprobadoEn'
  | 'avisoAlmacenEn';

// Las 4 fechas que reflejan el trabajo de Joel sobre la cotización, usadas para las alertas de
// integridad (feriado/ausencia/carga tardía — ver calcularAlertasCotizacion). requerimientoEn se
// incluye acá también: aunque ya no está protegida contra edición libre (ver CAMPOS_PROTEGIDOS),
// las alertas siguen siendo útiles como información para un supervisor, nunca bloquean nada.
const CAMPOS_A_VERIFICAR = ['requerimientoEn', 'cotizacionEnviadaEn', 'pedidoAprobadoEn', 'avisoAlmacenEn'] as const;

// Subconjunto de CAMPOS_A_VERIFICAR con la política estricta (primera marca = hora del servidor,
// corrección posterior = exclusiva de Admin + motivo obligatorio). requerimientoEn quedó afuera a
// pedido explícito: es la hora en que el cliente pide el producto, no algo que el sistema pueda
// determinar solo — el usuario que carga la cotización la conoce mejor que el reloj del servidor.
// Con esto se reabre el hueco que la política original evitaba (alguien podría cargar una fecha
// retroactiva para mejorar su propio indicador); las alertas de integridad (arriba) son el control
// que queda para que un supervisor lo note, no para impedirlo.
const CAMPOS_PROTEGIDOS = ['cotizacionEnviadaEn', 'pedidoAprobadoEn', 'avisoAlmacenEn'] as const;

// Si el valor de una etapa se cargó o corrigió más de este umbral después de la fecha que dice
// (comparado contra la hora real de servidor en que se guardó el cambio, no editable por nadie),
// es señal de que se completó "de memoria" mucho después en vez de en el momento — el mismo tipo
// de manipulación que el Excel no puede detectar porque no guarda cuándo se tocó cada celda.
const UMBRAL_CARGA_TARDIA_HORAS = 24;

function diaDentroDeRango(dia: Date, desde: Date, hasta: Date): boolean {
  const d = new Date(dia.getFullYear(), dia.getMonth(), dia.getDate()).getTime();
  const ini = new Date(desde.getFullYear(), desde.getMonth(), desde.getDate()).getTime();
  const fin = new Date(hasta.getFullYear(), hasta.getMonth(), hasta.getDate()).getTime();
  return d >= ini && d <= fin;
}

export function calcularAlertasCotizacion(
  cotizacion: {
    requerimientoEn: Date;
    cotizacionEnviadaEn: Date | null;
    pedidoAprobadoEn: Date | null;
    avisoAlmacenEn: Date | null;
    creadoPorId: number;
    ultimoEditadoPorId: number | null;
  },
  ausenciasPorUsuario: Map<number, { desde: Date; hasta: Date; motivo: string | null }[]>,
  historial: { campo: string; valorNuevo: string | null; editadoEn: Date }[],
): AlertaCotizacion[] {
  const responsables = [cotizacion.creadoPorId, cotizacion.ultimoEditadoPorId].filter(
    (id): id is number => id != null,
  );
  const ausencias = responsables.flatMap((id) => ausenciasPorUsuario.get(id) ?? []);

  const alertas: AlertaCotizacion[] = [];
  for (const campo of CAMPOS_A_VERIFICAR) {
    const fecha = cotizacion[campo];
    if (!fecha) continue;

    if (esDiaNoLaboral(fecha)) {
      alertas.push({ campo, tipo: 'FERIADO_O_FIN_DE_SEMANA' });
    } else {
      const ausenciaQueAplica = ausencias.find((a) => diaDentroDeRango(fecha, a.desde, a.hasta));
      if (ausenciaQueAplica) {
        alertas.push({ campo, tipo: 'AUSENCIA_REGISTRADA', motivo: ausenciaQueAplica.motivo ?? undefined });
      }
    }

    // historial ya viene ordenado por editadoEn desc: el primero que coincide es el cambio vigente.
    const ultimoCambio = historial.find((h) => h.campo === campo && h.valorNuevo);
    if (ultimoCambio) {
      const brechaHoras = Math.abs(ultimoCambio.editadoEn.getTime() - fecha.getTime()) / 3_600_000;
      if (brechaHoras > UMBRAL_CARGA_TARDIA_HORAS) {
        alertas.push({
          campo,
          tipo: 'CARGA_TARDIA',
          motivo: `se cargó/corrigió en el sistema ${Math.round(brechaHoras)}h después de la fecha que dice`,
        });
      }
    }
  }
  return alertas;
}

// Sin columna "estado" en la tabla (mismo criterio que Pedido): se deriva de qué fechas están
// seteadas, así nunca se desincroniza de la fecha real de cada etapa.
export function derivarEstadoCotizacion(c: {
  cotizacionEnviadaEn: Date | null;
  pedidoAprobadoEn: Date | null;
  avisoAlmacenEn: Date | null;
}): EstadoCotizacion {
  if (c.avisoAlmacenEn) return 'AVISADO_ALMACEN';
  if (c.pedidoAprobadoEn) return 'APROBADO';
  if (c.cotizacionEnviadaEn) return 'COTIZADO';
  return 'RECIBIDO';
}

const WHERE_POR_ESTADO: Record<EstadoCotizacion, Prisma.CotizacionWhereInput> = {
  RECIBIDO: { cotizacionEnviadaEn: null },
  COTIZADO: { cotizacionEnviadaEn: { not: null }, pedidoAprobadoEn: null },
  APROBADO: { pedidoAprobadoEn: { not: null }, avisoAlmacenEn: null },
  AVISADO_ALMACEN: { avisoAlmacenEn: { not: null } },
};

const INCLUDE_COTIZACION = {
  cliente: true,
  creadoPor: { select: { id: true, nombre: true } },
  ultimoEditadoPor: { select: { id: true, nombre: true } },
} satisfies Prisma.CotizacionInclude;

@Injectable()
export class CotizacionesService {
  constructor(
    private prisma: PrismaService,
    private ausenciasService: AusenciasService,
  ) {}

  private async conAlertas<
    T extends {
      id: number;
      creadoPorId: number;
      ultimoEditadoPorId: number | null;
      requerimientoEn: Date;
      cotizacionEnviadaEn: Date | null;
      pedidoAprobadoEn: Date | null;
      avisoAlmacenEn: Date | null;
    },
  >(cotizaciones: T[]): Promise<(T & { alertas: AlertaCotizacion[]; historial: HistorialCotizacionItem[] })[]> {
    const usuarioIds = cotizaciones.flatMap((c) => [c.creadoPorId, c.ultimoEditadoPorId]);
    const ausenciasPorUsuario = await this.ausenciasService.obtenerPorUsuarios(
      usuarioIds.filter((id): id is number => id != null),
    );

    const ids = cotizaciones.map((c) => c.id);
    const historialRows = ids.length
      ? await this.prisma.cotizacionHistorial.findMany({
          where: { cotizacionId: { in: ids } },
          include: { editadoPor: { select: { id: true, nombre: true } } },
          orderBy: { editadoEn: 'desc' },
        })
      : [];
    const historialPorCotizacion = new Map<number, HistorialCotizacionItem[]>();
    for (const h of historialRows) {
      const lista = historialPorCotizacion.get(h.cotizacionId) ?? [];
      lista.push(h);
      historialPorCotizacion.set(h.cotizacionId, lista);
    }

    return cotizaciones.map((c) => {
      const historial = historialPorCotizacion.get(c.id) ?? [];
      return { ...c, alertas: calcularAlertasCotizacion(c, ausenciasPorUsuario, historial), historial };
    });
  }

  // numeroProforma: sin política especial, se compara tal cual llega el PATCH (evita un historial
  // con entradas idénticas si el frontend reenvía el mismo valor). Las 4 fechas de Joel (incluida
  // requerimientoEn) tienen su propia lógica en update(), ver ahí.
  private calcularCambiosSimples(
    actual: { numeroProforma: string | null },
    dto: UpdateCotizacionDto,
  ): { campo: CampoRastreado; valorAnterior: string | null; valorNuevo: string | null; motivo: null }[] {
    const cambios: { campo: CampoRastreado; valorAnterior: string | null; valorNuevo: string | null; motivo: null }[] = [];

    if (dto.numeroProforma !== undefined) {
      const nuevoValor = dto.numeroProforma.trim() || null;
      if (nuevoValor !== actual.numeroProforma) {
        cambios.push({ campo: 'numeroProforma', valorAnterior: actual.numeroProforma, valorNuevo: nuevoValor, motivo: null });
      }
    }

    return cambios;
  }

  async create(dto: CreateCotizacionDto, creadoPorId: number) {
    // requerimientoEn es de carga libre (ver CAMPOS_PROTEGIDOS): si viene en el body se usa tal
    // cual, si no, el default del schema (hora del servidor) aplica solo.
    const cotizacion = await this.prisma.cotizacion.create({
      data: {
        clienteId: dto.clienteId,
        notas: dto.notas?.trim() || undefined,
        ...(dto.requerimientoEn && { requerimientoEn: new Date(dto.requerimientoEn) }),
        creadoPorId,
        ultimoEditadoPorId: creadoPorId,
      },
      include: INCLUDE_COTIZACION,
    });
    await this.prisma.cotizacionHistorial.create({
      data: {
        cotizacionId: cotizacion.id,
        campo: 'requerimientoEn',
        valorAnterior: null,
        valorNuevo: cotizacion.requerimientoEn.toISOString(),
        editadoPorId: creadoPorId,
      },
    });
    const [conAlertas] = await this.conAlertas([cotizacion]);
    return { ...conAlertas, estado: derivarEstadoCotizacion(cotizacion) };
  }

  // Cotizacion y Pedido son tablas independientes (viven en módulos y, hoy, con encargados
  // distintos — ver CLAUDE.md), pero ambas guardan el mismo numeroProforma de KEYFACIL: es la
  // llave natural para mostrar la trazabilidad de punta a punta, del requerimiento del cliente a
  // la entrega real, sin agregar una relación formal en el schema. Una sola consulta bulk (no una
  // por fila) para poder usarse también en findAll, que alimenta el indicador de trazabilidad.
  private async adjuntarPedidosRelacionados<T extends { numeroProforma: string | null }>(
    cotizaciones: T[],
  ): Promise<(T & { pedidoRelacionado: PedidoRelacionado | null })[]> {
    const proformas = [...new Set(cotizaciones.map((c) => c.numeroProforma).filter((p): p is string => !!p))];
    const pedidos = proformas.length
      ? await this.prisma.pedido.findMany({
          where: { numeroProforma: { in: proformas } },
          select: {
            id: true,
            numeroProforma: true,
            recibidoEn: true,
            inicioPreparacionEn: true,
            preparadoEn: true,
            salioEn: true,
            entregadoEn: true,
            tokenSeguimiento: true,
          },
        })
      : [];
    const pedidoPorProforma = new Map(pedidos.map((p) => [p.numeroProforma, p]));
    return cotizaciones.map((c) => ({
      ...c,
      pedidoRelacionado: (c.numeroProforma && pedidoPorProforma.get(c.numeroProforma)) || null,
    }));
  }

  async findAll(estado?: EstadoCotizacion) {
    const cotizaciones = await this.prisma.cotizacion.findMany({
      where: estado ? WHERE_POR_ESTADO[estado] : undefined,
      include: INCLUDE_COTIZACION,
      orderBy: { requerimientoEn: 'desc' },
    });
    const conAlertas = await this.conAlertas(cotizaciones);
    const conPedido = await this.adjuntarPedidosRelacionados(conAlertas);
    return conPedido.map((c) => ({ ...c, estado: derivarEstadoCotizacion(c) }));
  }

  async findOne(id: number) {
    const cotizacion = await this.prisma.cotizacion.findUnique({
      where: { id },
      include: INCLUDE_COTIZACION,
    });
    if (!cotizacion) {
      throw new NotFoundException(`Cotización con id ${id} no encontrada`);
    }
    const [conAlertas] = await this.conAlertas([cotizacion]);
    const [conPedido] = await this.adjuntarPedidosRelacionados([conAlertas]);
    return { ...conPedido, estado: derivarEstadoCotizacion(cotizacion) };
  }

  async update(id: number, dto: UpdateCotizacionDto, editadoPorId: number, esAdmin: boolean) {
    const actual = await this.findOne(id);

    // Deshacer una etapa (no corregirla): vuelve esa fecha y las que dependen de ella a null, para
    // el caso de un clic accidental ("Marcar pedido aprobado" sobre la cotización equivocada, por
    // ejemplo). Es su propia rama porque no tiene sentido combinarla con marcar/corregir fechas en
    // el mismo PATCH — deja su propia entrada en el historial, con motivo obligatorio, igual que
    // una corrección.
    if (dto.revertirEtapa) {
      if (!esAdmin) {
        throw new ForbiddenException('Solo un administrador puede deshacer una etapa ya marcada');
      }
      const motivoTrim = dto.motivoCorreccion?.trim();
      if (!motivoTrim) {
        throw new BadRequestException('Para deshacer una etapa hace falta indicar el motivo');
      }
      const ordenEtapas = ['cotizacionEnviadaEn', 'pedidoAprobadoEn', 'avisoAlmacenEn'] as const;
      const desde = ordenEtapas.indexOf(dto.revertirEtapa);
      const camposALimpiar = ordenEtapas.slice(desde).filter((campo) => actual[campo]);
      if (camposALimpiar.length === 0) {
        throw new BadRequestException('Esa etapa no está marcada');
      }

      const cotizacion = await this.prisma.$transaction(async (tx) => {
        const actualizada = await tx.cotizacion.update({
          where: { id },
          data: {
            ...Object.fromEntries(camposALimpiar.map((campo) => [campo, null])),
            ultimoEditadoPorId: editadoPorId,
          },
          include: INCLUDE_COTIZACION,
        });
        for (const campo of camposALimpiar) {
          await tx.cotizacionHistorial.create({
            data: {
              cotizacionId: id,
              campo,
              valorAnterior: (actual[campo] as Date).toISOString(),
              valorNuevo: null,
              motivo: motivoTrim,
              editadoPorId,
            },
          });
        }
        return actualizada;
      });
      const [conAlertas] = await this.conAlertas([cotizacion]);
      return { ...conAlertas, estado: derivarEstadoCotizacion(cotizacion) };
    }

    // No se puede marcar "cotización enviada" sin saber la proforma de KEYFACIL — o ya está
    // guardada de antes, o viene en este mismo PATCH.
    const proformaFinal = dto.numeroProforma !== undefined ? dto.numeroProforma.trim() : actual.numeroProforma;
    if (dto.cotizacionEnviadaEn && !proformaFinal) {
      throw new BadRequestException('Para marcar la cotización como enviada hace falta el número de proforma de KEYFACIL');
    }

    // Las 3 fechas protegidas: la PRIMERA vez que se marcan usan la hora real del servidor, sin
    // importar qué fecha mande el cliente — así el indicador mide lo que pasó de verdad, no lo
    // que alguien prefiera que haya pasado. Corregir una que ya estaba marcada es cosa del Admin
    // general únicamente, y exige un motivo (queda en el historial junto al valor anterior).
    const ahora = new Date();
    const resueltos: Partial<Record<'requerimientoEn' | 'cotizacionEnviadaEn' | 'pedidoAprobadoEn' | 'avisoAlmacenEn', Date>> = {};
    const cambiosEtapa: { campo: CampoRastreado; valorAnterior: string | null; valorNuevo: string; motivo: string | null }[] = [];

    // requerimientoEn: de carga libre (ver CAMPOS_PROTEGIDOS), cualquiera con permiso de editar
    // puede cambiarla, sin motivo ni restricción de Admin.
    if (dto.requerimientoEn) {
      const valorFinal = new Date(dto.requerimientoEn);
      const nuevoTexto = valorFinal.toISOString();
      const anteriorTexto = actual.requerimientoEn.toISOString();
      resueltos.requerimientoEn = valorFinal;
      if (anteriorTexto !== nuevoTexto) {
        cambiosEtapa.push({ campo: 'requerimientoEn', valorAnterior: anteriorTexto, valorNuevo: nuevoTexto, motivo: null });
      }
    }

    for (const campo of CAMPOS_PROTEGIDOS) {
      const crudo = dto[campo];
      if (!crudo) continue;
      const valorActual = actual[campo];
      let valorFinal: Date;
      let motivo: string | null = null;

      if (!valorActual) {
        valorFinal = ahora;
      } else {
        if (!esAdmin) {
          throw new ForbiddenException(
            `Solo un administrador puede corregir "${campo}" — ya fue marcada y no se puede editar libremente`,
          );
        }
        const motivoTrim = dto.motivoCorreccion?.trim();
        if (!motivoTrim) {
          throw new BadRequestException('Para corregir una fecha ya marcada hace falta indicar el motivo');
        }
        valorFinal = new Date(crudo);
        motivo = motivoTrim;
      }

      resueltos[campo] = valorFinal;
      const nuevoTexto = valorFinal.toISOString();
      const anteriorTexto = valorActual ? valorActual.toISOString() : null;
      if (anteriorTexto !== nuevoTexto) {
        cambiosEtapa.push({ campo, valorAnterior: anteriorTexto, valorNuevo: nuevoTexto, motivo });
      }
    }

    const cambiosSimples = this.calcularCambiosSimples({ numeroProforma: actual.numeroProforma }, dto);

    // Misma validación que Pedido: con la foto final (lo que ya estaba + lo que llega en este
    // PATCH), para atrapar también el caso de un admin corrigiendo una etapa intermedia.
    validarOrdenCronologico([
      { label: 'Requerimiento del cliente', valor: resueltos.requerimientoEn ?? actual.requerimientoEn },
      { label: 'Cotización enviada', valor: resueltos.cotizacionEnviadaEn ?? actual.cotizacionEnviadaEn },
      { label: 'Pedido aprobado', valor: resueltos.pedidoAprobadoEn ?? actual.pedidoAprobadoEn },
      { label: 'Aviso a almacén', valor: resueltos.avisoAlmacenEn ?? actual.avisoAlmacenEn },
    ]);

    try {
      const cotizacion = await this.prisma.$transaction(async (tx) => {
        const actualizada = await tx.cotizacion.update({
          where: { id },
          data: {
            ...(dto.clienteId !== undefined && { clienteId: dto.clienteId }),
            ...(dto.numeroProforma !== undefined && { numeroProforma: dto.numeroProforma.trim() || null }),
            ...(dto.notas !== undefined && { notas: dto.notas.trim() || null }),
            ...(resueltos.requerimientoEn && { requerimientoEn: resueltos.requerimientoEn }),
            ...(resueltos.cotizacionEnviadaEn && { cotizacionEnviadaEn: resueltos.cotizacionEnviadaEn }),
            ...(resueltos.pedidoAprobadoEn && { pedidoAprobadoEn: resueltos.pedidoAprobadoEn }),
            ...(resueltos.avisoAlmacenEn && { avisoAlmacenEn: resueltos.avisoAlmacenEn }),
            ...(dto.categoriaObservacion !== undefined && { categoriaObservacion: dto.categoriaObservacion }),
            ...(dto.detalleObservacion !== undefined && { detalleObservacion: dto.detalleObservacion }),
            ultimoEditadoPorId: editadoPorId,
          },
          include: INCLUDE_COTIZACION,
        });
        for (const c of [...cambiosSimples, ...cambiosEtapa]) {
          await tx.cotizacionHistorial.create({
            data: {
              cotizacionId: id,
              campo: c.campo,
              valorAnterior: c.valorAnterior,
              valorNuevo: c.valorNuevo,
              motivo: c.motivo,
              editadoPorId,
            },
          });
        }
        return actualizada;
      });
      const [conAlertas] = await this.conAlertas([cotizacion]);
      return { ...conAlertas, estado: derivarEstadoCotizacion(cotizacion) };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const proforma = dto.numeroProforma?.trim();
        throw new ConflictException(
          `Ya existe una cotización con la proforma "${proforma}"${await this.sufijoFechaRegistroProforma(proforma)}`,
        );
      }
      throw error;
    }
  }

  // Para el mensaje de proforma duplicada: cuándo quedó registrada esa proforma en la cotización
  // que ya la tiene, para que quien ve el aviso pueda ubicarla sin tener que buscarla a mano.
  // Se lee del historial (no de un campo propio en Cotizacion, que no existe) porque
  // numeroProforma siempre se marca a través de update(), que deja su entrada ahí.
  private async sufijoFechaRegistroProforma(proforma: string | undefined): Promise<string> {
    if (!proforma) return '';
    const existente = await this.prisma.cotizacion.findUnique({ where: { numeroProforma: proforma }, select: { id: true } });
    if (!existente) return '';
    const historial = await this.prisma.cotizacionHistorial.findFirst({
      where: { cotizacionId: existente.id, campo: 'numeroProforma', valorNuevo: proforma },
      orderBy: { editadoEn: 'desc' },
    });
    if (!historial) return '';
    const fecha = historial.editadoEn.toLocaleString('es-PE', { timeZone: 'America/Lima' });
    return ` (registrada el ${fecha})`;
  }

  async remove(id: number) {
    await this.findOne(id);
    return this.prisma.cotizacion.delete({ where: { id } });
  }

  // Recordatorio (AlertasCotizacionesService, notificación interna — ya no correo vía n8n):
  // cotizaciones aprobadas antes de `limite` (el corte de las 5pm hora Perú más reciente que ya
  // pasó, ver corte-aviso-almacen.ts) que todavía no se avisaron a almacén. Reserva
  // (recordatorioEnviadoEn) con updateMany antes de devolver la lista, mismo patrón que
  // avisoSalioEnviadoEn en Pedidos — así no se manda el mismo aviso dos veces.
  async findPendientesDeRecordatorio(limite: Date) {
    const candidatas = await this.prisma.cotizacion.findMany({
      where: {
        pedidoAprobadoEn: { not: null, lte: limite },
        avisoAlmacenEn: null,
        recordatorioEnviadoEn: null,
      },
      include: INCLUDE_COTIZACION,
      orderBy: { pedidoAprobadoEn: 'asc' },
    });
    if (candidatas.length === 0) return candidatas;

    const ids = candidatas.map((c) => c.id);
    await this.prisma.cotizacion.updateMany({
      where: { id: { in: ids }, recordatorioEnviadoEn: null },
      data: { recordatorioEnviadoEn: new Date() },
    });
    return candidatas.map((c) => ({ ...c, estado: derivarEstadoCotizacion(c) }));
  }
}
