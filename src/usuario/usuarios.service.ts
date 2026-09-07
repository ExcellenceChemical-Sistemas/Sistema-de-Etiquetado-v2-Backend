import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../generated/prisma';
import { supabaseAdmin } from '../infrastructure/supabase/supabase-admin.client';
import { CrearUsuarioDto } from './dto/usuarios.dto';
import { ActualizarPermisosDto } from './dto/actualizar-permisos.dto';
import { ActualizarPerfilDto } from './dto/actualizar-perfil.dto';
import { ActualizarAccesosKpisIsoDto } from './dto/actualizar-accesos-kpis-iso.dto';
import { ActualizarRolKpisDto } from './dto/actualizar-rol-kpis.dto';

/**
 * Shape que devuelven los dos endpoints del panel de KPIs/ISO (el GET de lectura
 * y el PATCH de guardado). Deliberadamente sin `permisos` ni `supabaseUserId`:
 * ambos endpoints los puede llamar un `esAdminKpis` que no es `esAdmin`, y ese
 * rol no tiene por qué ver permisos de los módulos CRUD (§1.1 punto 4).
 * Compartido para que las dos respuestas no se puedan desincronizar.
 */
const SELECT_ACCESOS_KPIS_ISO = {
  id: true,
  nombre: true,
  avatarUrl: true,
  accesosIndicador: { orderBy: { proceso: 'asc' } },
  accesoIso: true,
} satisfies Prisma.UsuarioSelect;

/**
 * Shape de `PATCH /usuarios/:id/rol-kpis`. Ese endpoint solo da vuelta un
 * booleano, asi que devolver la fila entera con `permisos`, `accesosIndicador`,
 * `accesoIso` y `supabaseUserId` era traer (y exponer) muchisimo mas de lo que
 * el caller necesita para refrescar la lista de usuarios.
 *
 * No es una fuga de privilegios — detras de `EsAdminGuard`, el llamador ya
 * puede ver todo eso por `GET /usuarios` — pero el criterio de acceso minimo
 * vale igual: una respuesta se limita a lo que el endpoint cambia.
 */
const SELECT_ROL_KPIS = {
  id: true,
  nombre: true,
  avatarUrl: true,
  esAdmin: true,
  esAdminKpis: true,
} satisfies Prisma.UsuarioSelect;

@Injectable()
export class UsuariosService {
  constructor(private readonly prisma: PrismaService) {}

  async crear(dto: CrearUsuarioDto) {
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email: dto.email,
      password: dto.password,
      email_confirm: true,
    });

    if (error || !data.user) {
      throw new BadRequestException(
        `Error creando usuario en Supabase: ${error?.message}`,
      );
    }

    try {
      return await this.prisma.usuario.create({
        data: {
          supabaseUserId: data.user.id,
          nombre: dto.nombre,
          esAdmin: dto.esAdmin,
          permisos: {
            create: dto.esAdmin ? [] : dto.permisos,
          },
        },
        include: { permisos: true, accesosIndicador: true, accesoIso: true }, // ← agregado
      });
    } catch {
      await supabaseAdmin.auth.admin.deleteUser(data.user.id);
      throw new InternalServerErrorException(
        'Error guardando usuario en la base de datos',
      );
    }
  }

  async listar() {
    return this.prisma.usuario.findMany({
      include: { permisos: true, accesosIndicador: true, accesoIso: true }, // ← agregado
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Vista reducida para el panel de accesos de KPIs/ISO (§1.1 punto 4).
   * Devuelve solo lo mínimo para elegir a quién asignarle accesos — a diferencia
   * de `listar()`, NO expone permisos de otros módulos ni los accesos actuales.
   */
  async listarBasico() {
    return this.prisma.usuario.findMany({
      select: { id: true, nombre: true, avatarUrl: true },
      orderBy: { nombre: 'asc' },
    });
  }

  async actualizarPermisos(
    usuarioId: number,
    permisos: ActualizarPermisosDto['permisos'],
  ) {
    const usuario = await this.prisma.usuario.findUnique({
      where: { id: usuarioId },
    });
    if (!usuario) throw new NotFoundException('Usuario no encontrado');

    return this.prisma.$transaction(async (tx) => {
      await tx.permiso.deleteMany({ where: { usuarioId } });

      if (permisos.length > 0) {
        await tx.permiso.createMany({
          data: permisos.map((p) => ({ ...p, usuarioId })),
        });
      }

      return tx.usuario.findUnique({
        where: { id: usuarioId },
        include: { permisos: true, accesosIndicador: true, accesoIso: true }, // ← agregado
      });
    });
  }

  /**
   * Asigna/quita el rol de Admin de KPIs (§1.1). Solo cambia la capacidad de
   * gestionar accesos ajenos — NO otorga acceso propio al contenido de KPIs/ISO,
   * eso se sigue asignando por separado con actualizarAccesosKpisIso().
   */
  async actualizarRolKpis(usuarioId: number, dto: ActualizarRolKpisDto) {
    const usuario = await this.prisma.usuario.findUnique({
      where: { id: usuarioId },
    });
    if (!usuario) throw new NotFoundException('Usuario no encontrado');

    return this.prisma.usuario.update({
      where: { id: usuarioId },
      data: { esAdminKpis: dto.esAdminKpis },
      select: SELECT_ROL_KPIS,
    });
  }

  /**
   * Lectura de los accesos de KPIs/ISO de un usuario, para precargar el panel de
   * la Admin de KPIs (contraparte de `actualizarAccesosKpisIso`).
   *
   * Mismo criterio de acceso mínimo que `listarBasico()` (§1.1 punto 4): el
   * `select` deja afuera `permisos` (Lotes, Productos, etc.) y `supabaseUserId`
   * — quien tiene `esAdminKpis` sin ser `esAdmin` no debe ver nada fuera de
   * KPIs/ISO. Por eso es un método aparte y NO se agrega al select de
   * `listarBasico()`, que a propósito tampoco expone los accesos actuales.
   *
   * `accesoIso` es una relación 1:1 opcional: Prisma devuelve `null` cuando el
   * usuario no tiene fila, así que el campo siempre viaja en la respuesta.
   */
  async obtenerAccesosKpisIso(usuarioId: number) {
    const usuario = await this.prisma.usuario.findUnique({
      where: { id: usuarioId },
      select: SELECT_ACCESOS_KPIS_ISO,
    });
    if (!usuario) throw new NotFoundException('Usuario no encontrado');

    return usuario;
  }

  async actualizarAccesosKpisIso(
    usuarioId: number,
    dto: ActualizarAccesosKpisIsoDto,
  ) {
    const usuario = await this.prisma.usuario.findUnique({
      where: { id: usuarioId },
    });
    if (!usuario) throw new NotFoundException('Usuario no encontrado');

    return this.prisma.$transaction(async (tx) => {
      await tx.accesoIndicador.deleteMany({ where: { usuarioId } });

      if (dto.accesosIndicador.length > 0) {
        await tx.accesoIndicador.createMany({
          data: dto.accesosIndicador.map((a) => ({ ...a, usuarioId })),
        });
      }

      if (dto.accesoIso === null) {
        await tx.accesoISO.deleteMany({ where: { usuarioId } });
      } else {
        await tx.accesoISO.upsert({
          where: { usuarioId },
          update: { ...dto.accesoIso },
          create: { ...dto.accesoIso, usuarioId },
        });
      }

      // Mismo shape reducido que `obtenerAccesosKpisIso` — a propósito NO usa
      // `include: { permisos: true }`: este endpoint lo puede llamar un
      // `esAdminKpis` que no es `esAdmin`, y los permisos de los módulos CRUD
      // (Lotes, Productos, etc.) quedan fuera de su alcance (§1.1 punto 4).
      return tx.usuario.findUnique({
        where: { id: usuarioId },
        select: SELECT_ACCESOS_KPIS_ISO,
      });
    });
  }

  async actualizarPerfil(usuarioId: number, dto: ActualizarPerfilDto) {
    const usuario = await this.prisma.usuario.findUnique({
      where: { id: usuarioId },
    });
    if (!usuario) throw new NotFoundException('Usuario no encontrado');

    return this.prisma.usuario.update({
      where: { id: usuarioId },
      data: dto, // solo nombre y/o avatarUrl, ambos opcionales
      include: { permisos: true },
    });
  }
}
