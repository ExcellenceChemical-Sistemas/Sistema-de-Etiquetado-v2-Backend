import { z } from 'zod';

export const permisoSchema = z.object({
  // COA no es un recurso propio: subir/reemplazar/eliminar el COA de un lote
  // se controla con LOTES.puedeEditar (ver lotes.controller.ts). Se deja fuera
  // del enum para no ofrecer un permiso que ningún guard consulta.
  recurso: z.enum(['LOTES', 'PRODUCTOS', 'FABRICANTES', 'PLANTILLAS', 'USUARIOS', 'ETIQUETAS', 'PEDIDOS']),
  puedeVer: z.boolean().default(false),
  puedeCrear: z.boolean().default(false),
  puedeEditar: z.boolean().default(false),
  puedeEliminar: z.boolean().default(false),
});

// Misma regla que el frontend (utils/password.ts) para elegir una contraseña nueva:
// 10+ caracteres, con letras y números. Solo aplica al crear; las cuentas existentes
// no se tocan. El mínimo que Supabase realmente exige se configura en su panel.
export const PASSWORD_MIN = 10;

export const passwordNuevaSchema = z
  .string()
  .min(PASSWORD_MIN, `La contraseña debe tener al menos ${PASSWORD_MIN} caracteres`)
  .refine((p) => /[A-Za-z]/.test(p) && /\d/.test(p), 'La contraseña debe incluir letras y números');

export const crearUsuarioSchema = z.object({
  nombre: z.string().min(1),
  email: z.string().email(),
  password: passwordNuevaSchema,
  esAdmin: z.boolean().default(false),
  // si esAdmin=true, permisos puede venir vacío (el admin no los necesita)
  permisos: z.array(permisoSchema).default([]),
});

export type CrearUsuarioDto = z.infer<typeof crearUsuarioSchema>;