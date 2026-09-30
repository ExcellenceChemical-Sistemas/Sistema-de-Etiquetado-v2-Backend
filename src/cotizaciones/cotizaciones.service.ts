import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCotizacionDto } from './dto/create-cotizacion.dto';
import { UpdateCotizacionDto } from './dto/update-cotizacion.dto';
import { AusenciasService } from '../ausencias/ausencias.service';
import { esDiaNoLaboral } from '../common/fecha/feriados-peru';

export type EstadoCotizacion = 'RECIBIDO' | 'COTIZADO' | 'APROBADO' | 'AVISADO_ALMACEN';

export type TipoAlertaCotizacion = 'FERIADO_O_FIN_DE_SEMANA' | 'AUSENCIA_REGISTRADA';

export interface AlertaCotizacion {
  campo: 'cotizacionEnviadaEn' | 'pedidoAprobadoEn' | 'avisoAlmacenEn';
  tipo: TipoAlertaCotizacion;
  motivo?: string;
}

// Las 3 etapas que Joel carga sobre su propio trabajo (a diferencia de requerimientoEn, que es
// la hora del SMS del cliente y puede caer en cualquier momento real). Si una de estas cae en un
// día que la empresa no trabaja, o dentro de una ausencia registrada de quien la cargó/editó, es
// evidencia de que el dato fue puesto para "cuadrar" el indicador en vez de reflejar lo real —
// ver la conversación que originó esto: Joel cargaba datos de días en que estaba de vacaciones.
const CAMPOS_A_VERIFICAR = ['cotizacionEnviadaEn', 'pedidoAprobadoEn', 'avisoAlmacenEn'] as const;

function diaDentroDeRango(dia: Date, desde: Date, hasta: Date): boolean {
  const d = new Date(dia.getFullYear(), dia.getMonth(), dia.getDate()).getTime();
  const ini = new Date(desde.getFullYear(), desde.getMonth(), desde.getDate()).getTime();
  const fin = new Date(hasta.getFullYear(), hasta.getMonth(), hasta.getDate()).getTime();
  return d >= ini && d <= fin;
}

export function calcularAlertasCotizacion(
  cotizacion: {
    cotizacionEnviadaEn: Date | null;
    pedidoAprobadoEn: Date | null;
    avisoAlmacenEn: Date | null;
    creadoPorId: number;
    ultimoEditadoPorId: number | null;
  },
  ausenciasPorUsuario: Map<number, { desde: Date; hasta: Date; motivo: string | null }[]>,
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
      continue;
    }

    const ausenciaQueAplica = ausencias.find((a) => diaDentroDeRango(fecha, a.desde, a.hasta));
    if (ausenciaQueAplica) {
      alertas.push({ campo, tipo: 'AUSENCIA_REGISTRADA', motivo: ausenciaQueAplica.motivo ?? undefined });
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
      creadoPorId: number;
      ultimoEditadoPorId: number | null;
      cotizacionEnviadaEn: Date | null;
      pedidoAprobadoEn: Date | null;
      avisoAlmacenEn: Date | null;
    },
  >(cotizaciones: T[]): Promise<(T & { alertas: AlertaCotizacion[] })[]> {
    const usuarioIds = cotizaciones.flatMap((c) => [c.creadoPorId, c.ultimoEditadoPorId]);
    const ausenciasPorUsuario = await this.ausenciasService.obtenerPorUsuarios(
      usuarioIds.filter((id): id is number => id != null),
    );
    return cotizaciones.map((c) => ({ ...c, alertas: calcularAlertasCotizacion(c, ausenciasPorUsuario) }));
  }

  async create(dto: CreateCotizacionDto, creadoPorId: number) {
    const cotizacion = await this.prisma.cotizacion.create({
      data: {
        clienteId: dto.clienteId,
        notas: dto.notas?.trim() || undefined,
        requerimientoEn: dto.requerimientoEn ? new Date(dto.requerimientoEn) : undefined,
        creadoPorId,
        ultimoEditadoPorId: creadoPorId,
      },
      include: INCLUDE_COTIZACION,
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
    return { ...conAlertas, estado: derivarEstadoCotizacion(cotizacion) };
  }

  async update(id: number, dto: UpdateCotizacionDto, editadoPorId: number) {
    const actual = await this.findOne(id);

    // No se puede marcar "cotización enviada" sin saber la proforma de KEYFACIL — o ya está
    // guardada de antes, o viene en este mismo PATCH.
    const proformaFinal = dto.numeroProforma !== undefined ? dto.numeroProforma.trim() : actual.numeroProforma;
    if (dto.cotizacionEnviadaEn && !proformaFinal) {
      throw new BadRequestException('Para marcar la cotización como enviada hace falta el número de proforma de KEYFACIL');
    }

    try {
      const cotizacion = await this.prisma.cotizacion.update({
        where: { id },
        data: {
          ...(dto.clienteId !== undefined && { clienteId: dto.clienteId }),
          ...(dto.numeroProforma !== undefined && { numeroProforma: dto.numeroProforma.trim() || null }),
          ...(dto.notas !== undefined && { notas: dto.notas.trim() || null }),
          ...(dto.requerimientoEn && { requerimientoEn: new Date(dto.requerimientoEn) }),
          ...(dto.cotizacionEnviadaEn && { cotizacionEnviadaEn: new Date(dto.cotizacionEnviadaEn) }),
          ...(dto.pedidoAprobadoEn && { pedidoAprobadoEn: new Date(dto.pedidoAprobadoEn) }),
          ...(dto.avisoAlmacenEn && { avisoAlmacenEn: new Date(dto.avisoAlmacenEn) }),
          ultimoEditadoPorId: editadoPorId,
        },
        include: INCLUDE_COTIZACION,
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
