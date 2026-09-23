// El guard de auth no puede cargar el cliente de Supabase real (necesita env).
jest.mock('../../infrastructure/supabase/supabase-admin.client', () => ({ supabaseAdmin: {} }));

import 'reflect-metadata';
import { RequestMethod } from '@nestjs/common';
import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { Recurso } from '../../generated/prisma';
import { PERMISO_KEY, PermisoRequerido } from '../decorators/requiere-permiso.decorator';
import { ACCESO_CARPETA_KEY } from '../decorators/requiere-acceso-carpeta.decorator';
import { SupabaseAuthGuard } from './supabase-auth.guard';
import { PermisosGuard } from './permisos.guard';
import { EsAdminGuard } from './es-admin.guard';
import { EsAdminKpisGuard } from './es-admin-kpis.guard';
import { AccesoCarpetaGuard } from './acceso-carpeta.guard';
import { AgentTokenGuard } from './agent-token.guard';

import { AppController } from '../../app.controller';
import { ArchivosController } from '../../carpetas/archivos.controller';
import { CarpetasController } from '../../carpetas/carpetas.controller';
import { ClientesController } from '../../clientes/clientes.controller';
import { EtiquetasPublicasController } from '../../etiquetas/etiquetas-publicas.controller';
import { EtiquetasController } from '../../etiquetas/etiquetas.controller';
import { FabricantesController } from '../../fabricantes/fabricantes.controller';
import { LotesController } from '../../lotes/lotes.controller';
import { PedidosController } from '../../pedidos/pedidos.controller';
import { PlantillasController } from '../../plantillas/plantillas.controller';
import { ProductosController } from '../../productos/productos.controller';
import { UsuariosController } from '../../usuario/usuarios.controller';

/**
 * Red de seguridad contra el error más caro de este sistema: una ruta nueva
 * (o vieja) que queda sin guard o con un guard que no restringe nada.
 *
 * No levanta la app ni toca la BD: lee la metadata de Nest (@UseGuards,
 * @RequierePermiso, ...) de cada método de cada controller. Si agregás un
 * controller, sumalo a CONTROLLERS (el test de cantidad de rutas ayuda a
 * notar si dejó de leer algo, pero un controller olvidado no se detecta solo).
 */
const CONTROLLERS: any[] = [
  AppController,
  ArchivosController,
  CarpetasController,
  ClientesController,
  EtiquetasPublicasController,
  EtiquetasController,
  FabricantesController,
  LotesController,
  PedidosController,
  PlantillasController,
  ProductosController,
  UsuariosController,
];

/** Rutas que a propósito NO piden sesión (públicas). */
const PUBLICAS = new Set([
  'GET /', // health check
  'GET /salud', // chequeo de salud para el monitoreo: sin datos, solo dice si el servidor y la base responden
  'GET /publico/etiquetas/:token', // página del QR: la abre quien escanea la etiqueta
  'GET /publico/etiquetas/:token/coa',
  'GET /publico/etiquetas/:token/fds',
]);

/**
 * Rutas que piden sesión pero a propósito NO un permiso de módulo. Cada una
 * lleva su motivo: agregar una acá es una decisión, no un descuido.
 */
const SOLO_SESION = new Map<string, string>([
  ['GET /usuarios/me', 'el frontend necesita saber quién es y qué puede hacer'],
  ['PATCH /usuarios/me', 'cada quien edita su propio perfil'],
  ['GET /carpetas/raiz', 'lista solo las carpetas a las que el usuario tiene acceso (se filtra en el servicio)'],
  ['GET /etiquetas/agente/estado', 'el controller exige ETIQUETAS.puedeVer o puedeCrear dentro del método (no usa PermisosGuard porque acepta cualquiera de las dos)'],
  ['GET /etiquetas/vista-previa/:id', 'VistaPreviaService.obtener solo la devuelve a quien la pidió (o admin); quien genera puede no tener ETIQUETAS.puedeVer'],
  ['GET /etiquetas/trabajos/:id', 'TrabajosImpresionService.obtenerEstado solo lo devuelve a su creador (o admin) y da 404 si es ajeno; tiene tests'],
]);

type Ruta = {
  id: string;
  metodo: string;
  clase: any;
  handler: Function;
  guards: any[];
};

function unir(...partes: (string | undefined)[]) {
  const s = partes
    .filter((x) => x)
    .map((x) => String(x).replace(/^\/+|\/+$/g, ''))
    .filter((x) => x)
    .join('/');
  return '/' + s;
}

function rutas(): Ruta[] {
  const out: Ruta[] = [];
  for (const clase of CONTROLLERS) {
    const prefijo = Reflect.getMetadata(PATH_METADATA, clase);
    const guardsClase: any[] = Reflect.getMetadata(GUARDS_METADATA, clase) ?? [];
    for (const nombre of Object.getOwnPropertyNames(clase.prototype)) {
      const handler = clase.prototype[nombre];
      if (nombre === 'constructor' || typeof handler !== 'function') continue;
      const metodo = Reflect.getMetadata(METHOD_METADATA, handler);
      if (metodo === undefined) continue; // no es una ruta
      const path = Reflect.getMetadata(PATH_METADATA, handler);
      out.push({
        id: `${RequestMethod[metodo]} ${unir(prefijo, path)}`,
        metodo: RequestMethod[metodo],
        clase,
        handler,
        // los guards de clase corren antes que los del método
        guards: [...guardsClase, ...(Reflect.getMetadata(GUARDS_METADATA, handler) ?? [])],
      });
    }
  }
  return out;
}

const TODAS = rutas();
const privadas = TODAS.filter((r) => !PUBLICAS.has(r.id));

function permisoDe(r: Ruta): PermisoRequerido | undefined {
  return Reflect.getMetadata(PERMISO_KEY, r.handler) ?? Reflect.getMetadata(PERMISO_KEY, r.clase);
}

describe('cobertura de guards en los controllers', () => {
  it('encuentra rutas (si falla, el test dejó de leer la metadata)', () => {
    expect(TODAS.length).toBeGreaterThan(40);
  });

  it('las listas de excepciones no tienen rutas que ya no existen', () => {
    const ids = new Set(TODAS.map((r) => r.id));
    for (const id of [...PUBLICAS, ...SOLO_SESION.keys()]) {
      expect({ id, existe: ids.has(id) }).toEqual({ id, existe: true });
    }
  });

  it.each(privadas.map((r) => [r.id, r] as const))('%s pide sesión y una restricción', (_id, r) => {
    const g = r.guards;

    // Token del agente de impresión: mecanismo propio, sin Supabase.
    if (g.includes(AgentTokenGuard)) {
      expect(g).not.toContain(SupabaseAuthGuard);
      return;
    }

    // Sin SupabaseAuthGuard no hay request.usuario y los demás guards no sirven.
    expect(g).toContain(SupabaseAuthGuard);

    // Y tiene que ir PRIMERO: los otros leen lo que él carga.
    expect(g.indexOf(SupabaseAuthGuard)).toBe(0);

    if (SOLO_SESION.has(r.id)) return;

    const restringe =
      g.includes(PermisosGuard) ||
      g.includes(EsAdminGuard) ||
      g.includes(EsAdminKpisGuard) ||
      g.includes(AccesoCarpetaGuard);
    // Si falla: la ruta acepta a cualquier usuario logueado. Agregale un guard
    // o, si es a propósito, sumala a SOLO_SESION con su motivo.
    expect(restringe).toBe(true);
  });

  it.each(privadas.filter((r) => r.guards.includes(PermisosGuard)).map((r) => [r.id, r] as const))(
    '%s: PermisosGuard tiene un @RequierePermiso válido',
    (_id, r) => {
      // PermisosGuard sin @RequierePermiso deja pasar a todos (ver permisos.guard.ts).
      const permiso = permisoDe(r);
      expect(permiso).toBeDefined();
      expect(Object.values(Recurso)).toContain(permiso!.recurso);
      expect(['puedeVer', 'puedeCrear', 'puedeEditar', 'puedeEliminar']).toContain(permiso!.accion);
    },
  );

  it.each(
    privadas
      .filter((r) => r.guards.includes(AccesoCarpetaGuard) && !SOLO_SESION.has(r.id))
      .map((r) => [r.id, r] as const),
  )('%s: AccesoCarpetaGuard tiene @RequiereAccesoCarpeta', (_id, r) => {
    // Sin la metadata el guard devuelve true y no controla nada.
    const req =
      Reflect.getMetadata(ACCESO_CARPETA_KEY, r.handler) ?? Reflect.getMetadata(ACCESO_CARPETA_KEY, r.clase);
    expect(req).toBeDefined();
  });

  it('ninguna ruta que escribe se conforma con puedeVer', () => {
    // Detecta el copy-paste típico: un POST/PATCH/DELETE que quedó con puedeVer.
    // Las acciones de "consulta" que usan POST van en EXCEPCIONES, con motivo.
    const EXCEPCIONES = new Set<string>([
      'POST /productos/analizar-ficha', // lee un PDF y propone datos, no guarda nada
    ]);
    const sospechosas = privadas
      .filter((r) => ['POST', 'PATCH', 'PUT', 'DELETE'].includes(r.metodo))
      .filter((r) => permisoDe(r)?.accion === 'puedeVer' && !EXCEPCIONES.has(r.id))
      .map((r) => r.id);
    expect(sospechosas).toEqual([]);
  });
});
