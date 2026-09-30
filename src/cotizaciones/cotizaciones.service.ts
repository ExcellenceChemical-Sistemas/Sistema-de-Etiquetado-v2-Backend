import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCotizacionDto } from './dto/create-cotizacion.dto';
import { UpdateCotizacionDto } from './dto/update-cotizacion.dto';
import { AusenciasService } from '../ausencias/ausencias.service';
import { esDiaNoLaboral } from '../common/fecha/feriados-peru';

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

// numeroProforma se compara tal cual llega el PATCH (ver calcularCambiosSimples). Las 4 fechas de
// abajo (incluida requerimientoEn desde ahora) tienen su propia política en create()/update(): se
// fijan con la hora real de servidor al crear/marcar (nadie elige la fecha), y solo un Admin puede
// corregirlas después.
export type CampoRastreado =
  | 'numeroProforma'
  | 'requerimientoEn'
  | 'cotizacionEnviadaEn'
  | 'pedidoAprobadoEn'
  | 'avisoAlmacenEn';

// Las 4 fechas que reflejan el trabajo de Joel sobre la cotización. requerimientoEn se sumó acá
// (antes era de carga libre, "la hora del SMS del cliente") porque el mismo hueco que motivó la
// política de las otras 3 aplica igual: si Joel puede elegir esa fecha, puede acercarla a la de
// envío para inflar su indicador de tiempo de respuesta — igual de fácil que en el Excel. Ahora
// requerimientoEn se fija al momento real en que Joel la carga en el sistema (create()), y solo se
// puede corregir después con motivo y solo por un Admin, igual que las otras 3 — ver update().
const CAMPOS_A_VERIFICAR = ['requerimientoEn', 'cotizacionEnviadaEn', 'pedidoAprobadoEn', 'avisoAlmacenEn'] as const;

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
    // requerimientoEn no se recibe del cliente: siempre la hora real del servidor al crear (ver
    // comentario de CAMPOS_A_VERIFICAR). Corregirla después es cosa exclusiva de un Admin.
    const cotizacion = await this.prisma.cotizacion.create({
      data: {
        clienteId: dto.clienteId,
        notas: dto.notas?.trim() || undefined,
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

  async findAll(estado?: EstadoCotizacion) {
    const cotizaciones = await this.prisma.cotizacion.findMany({
      where: estado ? WHERE_POR_ESTADO[estado] : undefined,
      include: INCLUDE_COTIZACION,
      orderBy: { requerimientoEn: 'desc' },
    });
    const conAlertas = await this.conAlertas(cotizaciones);
    return conAlertas.map((c) => ({ ...c, estado: derivarEstadoCotizacion(c) }));
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
    // Cotizacion y Pedido son tablas independientes (viven en módulos y, hoy, con encargados
    // distintos — ver CLAUDE.md), pero ambas guardan el mismo numeroProforma de KEYFACIL: es la
    // llave natural para mostrar la trazabilidad de punta a punta, del requerimiento del cliente
    // a la entrega real, sin agregar una relación formal en el schema. Solo en el detalle (no en
    // findAll) para no pagar una consulta extra por fila en el listado.
    const pedidoRelacionado = cotizacion.numeroProforma
      ? await this.prisma.pedido.findUnique({
          where: { numeroProforma: cotizacion.numeroProforma },
          select: {
            id: true,
            recibidoEn: true,
            inicioPreparacionEn: true,
            preparadoEn: true,
            salioEn: true,
            entregadoEn: true,
            tokenSeguimiento: true,
          },
        })
      : null;
    return { ...conAlertas, estado: derivarEstadoCotizacion(cotizacion), pedidoRelacionado };
  }

  async update(id: number, dto: UpdateCotizacionDto, editadoPorId: number, esAdmin: boolean) {
    const actual = await this.findOne(id);

    // No se puede marcar "cotización enviada" sin saber la proforma de KEYFACIL — o ya está
    // guardada de antes, o viene en este mismo PATCH.
    const proformaFinal = dto.numeroProforma !== undefined ? dto.numeroProforma.trim() : actual.numeroProforma;
    if (dto.cotizacionEnviadaEn && !proformaFinal) {
      throw new BadRequestException('Para marcar la cotización como enviada hace falta el número de proforma de KEYFACIL');
    }

    // Las 4 fechas de Joel: la PRIMERA vez que se marcan usan la hora real del servidor, sin
    // importar qué fecha mande el cliente — así el indicador mide lo que pasó de verdad, no lo
    // que alguien prefiera que haya pasado. Corregir una que ya estaba marcada es cosa del Admin
    // general únicamente, y exige un motivo (queda en el historial junto al valor anterior).
    // requerimientoEn siempre tiene un valor previo (se fija en create()), así que para ella este
    // bucle SIEMPRE toma la rama de "corrección" — nunca la de "primera marca".
    const ahora = new Date();
    const resueltos: Partial<Record<'requerimientoEn' | 'cotizacionEnviadaEn' | 'pedidoAprobadoEn' | 'avisoAlmacenEn', Date>> = {};
    const cambiosEtapa: { campo: CampoRastreado; valorAnterior: string | null; valorNuevo: string; motivo: string | null }[] = [];

    for (const campo of CAMPOS_A_VERIFICAR) {
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
        throw new ConflictException(`Ya existe una cotización con la proforma "${dto.numeroProforma?.trim()}"`);
      }
      throw error;
    }
  }

  async remove(id: number) {
    await this.findOne(id);
    return this.prisma.cotizacion.delete({ where: { id } });
  }

  // Recordatorio (n8n): cotizaciones aprobadas hace más de `horas` que todavía no se avisaron a
  // almacén. Reserva (recordatorioEnviadoEn) con updateMany antes de devolver la lista, mismo
  // patrón que avisoSalioEnviadoEn en Pedidos — así no se manda el mismo aviso dos veces.
  async findPendientesDeRecordatorio(horas: number) {
    const limite = new Date(Date.now() - horas * 3_600_000);
    const candidatas = await this.prisma.cotizacion.findMany({
      where: {
        pedidoAprobadoEn: { not: null, lt: limite },
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
