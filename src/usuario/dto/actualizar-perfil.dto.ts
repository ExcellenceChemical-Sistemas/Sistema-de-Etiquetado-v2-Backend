import { z } from 'zod'

export const actualizarPerfilSchema = z.object({
  nombre: z.string().min(1).optional(),
  // avatarUrl NO se acepta acá: la foto se sube por POST /usuarios/me/avatar, para que
  // nadie pueda apuntar su avatar a una URL externa arbitraria.
});

export type ActualizarPerfilDto = z.infer<typeof actualizarPerfilSchema>;