import { z } from 'zod';

export const permisoSchema = z.object({
  recurso: z.enum(['LOTES', 'PRODUCTOS', 'FABRICANTES', 'PLANTILLAS', 'COA', 'USUARIOS', 'ETIQUETAS', 'PEDIDOS']),
  puedeVer: z.boolean().default(false),
  puedeCrear: z.boolean().default(false),
  puedeEditar: z.boolean().default(false),
  puedeEliminar: z.boolean().default(false),
});

export const crearUsuarioSchema = z.object({
  nombre: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  esAdmin: z.boolean().default(false),
  // si esAdmin=true, permisos puede venir vacío (el admin no los necesita)
  permisos: z.array(permisoSchema).default([]),
});

export type CrearUsuarioDto = z.infer<typeof crearUsuarioSchema>;