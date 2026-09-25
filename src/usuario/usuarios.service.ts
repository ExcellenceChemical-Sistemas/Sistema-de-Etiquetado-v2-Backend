import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
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
import { coincideFirma } from '../common/firma-archivo';

/**
 * Shape que devuelven los dos endpoints del panel de KPIs/ISO (el GET de lectura
 * y el PATCH de guardado). Deliberadamente sin `permisos` ni `supabaseUserId`:
 * ambos endpoints los puede llamar un `esAdminKpis` que no es `esAdmin`, y ese
 * rol no tiene por qué ver permisos de los módulos CRUD (§1.1 punto 4).
 * Compartido para que las dos respuestas no se puedan desincronizar.
 */
export type AccionAuditoria =
  | 'USUARIO_DESACTIVADO'
  | 'USUARIO_REACTIVADO'
  | 'USUARIO_ELIMINADO'
  | 'PERMISOS_ACTUALIZADOS';

const AVATAR_BUCKET = 'avatars';
const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
const AVATAR_EXTENSIONES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpeg',
  'image/webp': 'webp',
};

/** Incluye el nombre de quién desactivó la cuenta (solo lo ve el admin en la lista). */
const INCLUDE_USUARIO_ADMIN = {
  permisos: true,
  accesosIndicador: true,
  accesoIso: true,
  desactivadoPor: { select: { id: true, nombre: true } },
} satisfies Prisma.UsuarioInclude;

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
  private readonly logger = new Logger(UsuariosService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Deja constancia de una acción de un admin sobre una cuenta. Nunca hace
   * fallar la acción principal: si no se pudo escribir, queda en el log.
   */
  private async registrar(
    accion: AccionAuditoria,
    actorId: number,
    objetivo: { id: number; nombre: string },
    detalle?: string,
  ) {
    try {
      const actor = await this.prisma.usuario.findUnique({
        where: { id: actorId },
        select: { nombre: true },
      });
      await this.prisma.registroAuditoria.create({
        data: {
          accion,
          actorId,
          actorNombre: actor?.nombre ?? `#${actorId}`,
          objetivoId: objetivo.id,
          objetivoNombre: objetivo.nombre,
          detalle,
        },
      });
    } catch (error) {
      this.logger.error(`No se pudo registrar la auditoría (${accion} sobre usuario ${objetivo.id}): ${error}`);
    }
  }

  /** Últimos movimientos sobre cuentas, del más nuevo al más viejo. */
  listarAuditoria(limite = 100) {
    return this.prisma.registroAuditoria.findMany({
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limite, 1), 500),
    });
  }

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
      include: INCLUDE_USUARIO_ADMIN,
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
    solicitanteId: number,
  ) {
    const usuario = await this.prisma.usuario.findUnique({
      where: { id: usuarioId },
    });
    if (!usuario) throw new NotFoundException('Usuario no encontrado');

    const resultado = await this.prisma.$transaction(async (tx) => {
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

    const resumen = permisos
      .filter((p) => p.puedeVer || p.puedeCrear || p.puedeEditar || p.puedeEliminar)
      .map((p) => {
        const acciones = [
          p.puedeVer && 'ver',
          p.puedeCrear && 'crear',
          p.puedeEditar && 'editar',
          p.puedeEliminar && 'eliminar',
        ].filter(Boolean);
        return `${p.recurso}: ${acciones.join('/')}`;
      })
      .join('; ');
    await this.registrar(
      'PERMISOS_ACTUALIZADOS',
      solicitanteId,
      usuario,
      resumen || 'sin permisos',
    );
    return resultado;
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

  /**
   * Elimina el usuario de la BD y de Supabase Auth. Permisos y accesos KPIs/ISO
   * caen en cascada; TrabajoImpresion, Pedido y Archivo referencian al usuario
   * sin cascada, así que si tiene historial Postgres rechaza el borrado (P2003)
   * y se responde 409.
   *
   * Orden: primero la BD, después Supabase. Si fuera al revés y la BD rechazara
   * el borrado, la cuenta ya no podría iniciar sesión pero el usuario seguiría
   * en el sistema, sin forma de deshacerlo.
   *
   * No hace falta chequear "último admin": el llamador es admin (EsAdminGuard)
   * y no puede borrarse a sí mismo, así que siempre queda al menos uno.
   */
  async eliminar(usuarioId: number, solicitanteId: number) {
    if (usuarioId === solicitanteId) {
      throw new BadRequestException('No podés eliminar tu propio usuario');
    }

    const usuario = await this.prisma.usuario.findUnique({
      where: { id: usuarioId },
    });
    if (!usuario) throw new NotFoundException('Usuario no encontrado');

    try {
      await this.prisma.usuario.delete({ where: { id: usuarioId } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
        throw new ConflictException(
          'No se puede eliminar: el usuario tiene historial (etiquetas impresas, pedidos o archivos subidos). Podés desactivarlo para quitarle el acceso.',
        );
      }
      throw error;
    }

    // La fila del usuario ya no existe: el registro de auditoría (sin claves
    // foráneas, con el nombre copiado) es lo que deja constancia de quién lo eliminó.
    this.logger.warn(`Usuario eliminado: id=${usuario.id} nombre="${usuario.nombre}" por usuarioId=${solicitanteId}`);
    await this.registrar('USUARIO_ELIMINADO', solicitanteId, usuario);

    const { error } = await supabaseAdmin.auth.admin.deleteUser(usuario.supabaseUserId);
    if (error) {
      throw new InternalServerErrorException(
        `El usuario se eliminó del sistema pero no de Supabase Auth: ${error.message}`,
      );
    }
  }

  /**
   * Desactiva o reactiva una cuenta. Desactivada, SupabaseAuthGuard le responde
   * 403 en cada request, pero la fila (y su historial) se conserva. Es la salida
   * para quien no se puede eliminar por tener etiquetas, pedidos o archivos.
   * Un admin no puede desactivarse a sí mismo (quedaría sin nadie que la reactive).
   */
  async actualizarActivo(usuarioId: number, activo: boolean, solicitanteId: number) {
    if (usuarioId === solicitanteId && !activo) {
      throw new BadRequestException('No podés desactivar tu propio usuario');
    }

    const usuario = await this.prisma.usuario.findUnique({ where: { id: usuarioId } });
    if (!usuario) throw new NotFoundException('Usuario no encontrado');

    const actualizado = await this.prisma.usuario.update({
      where: { id: usuarioId },
      // Queda registrado quién y cuándo; al reactivar se limpia.
      data: activo
        ? { activo, desactivadoEn: null, desactivadoPorId: null }
        : { activo, desactivadoEn: new Date(), desactivadoPorId: solicitanteId },
      include: INCLUDE_USUARIO_ADMIN,
    });
    await this.registrar(activo ? 'USUARIO_REACTIVADO' : 'USUARIO_DESACTIVADO', solicitanteId, usuario);
    return actualizado;
  }

  /**
   * Sube la foto de perfil del propio usuario. Se hace desde el backend (con la
   * clave de servicio) y no desde el navegador: así el bucket `avatars` no
   * necesita políticas de escritura para `authenticated`, que dejaban a cualquier
   * usuario logueado pisar la foto de otro. Cada foto vive en `<id>.<ext>`.
   */
  async subirAvatar(usuarioId: number, file: { mimetype: string; size: number; buffer: Buffer }) {
    const ext = AVATAR_EXTENSIONES[file.mimetype];
    if (!ext) throw new BadRequestException('Formato no permitido. Usá PNG, JPEG o WEBP.');
    if (!coincideFirma(file.mimetype, file.buffer)) throw new BadRequestException('El contenido no es una imagen válida.');
    if (file.size > AVATAR_MAX_BYTES) throw new BadRequestException('La imagen no puede superar 2 MB.');

    const bucket = supabaseAdmin.storage.from(AVATAR_BUCKET);
    const path = `${usuarioId}.${ext}`;
    const { error } = await bucket.upload(path, file.buffer, { upsert: true, contentType: file.mimetype });
    if (error) throw new InternalServerErrorException(`No se pudo subir la foto: ${error.message}`);

    // Si antes tenía la foto en otro formato, esa queda huérfana: se borra (sin frenar si falla).
    const otros = Object.values(AVATAR_EXTENSIONES)
      .filter((e) => e !== ext)
      .map((e) => `${usuarioId}.${e}`);
    await bucket.remove(otros).catch(() => undefined);

    // ?v= evita que el navegador siga mostrando la foto vieja: la URL base no cambia.
    const avatarUrl = `${bucket.getPublicUrl(path).data.publicUrl}?v=${Date.now()}`;
    await this.prisma.usuario.update({ where: { id: usuarioId }, data: { avatarUrl } });
    return { avatarUrl };
  }

  async actualizarPerfil(usuarioId: number, dto: ActualizarPerfilDto) {
    const usuario = await this.prisma.usuario.findUnique({
      where: { id: usuarioId },
    });
    if (!usuario) throw new NotFoundException('Usuario no encontrado');

    return this.prisma.usuario.update({
      where: { id: usuarioId },
      data: dto, // solo el nombre: la foto se sube por POST /usuarios/me/avatar
      include: { permisos: true },
    });
  }
}
