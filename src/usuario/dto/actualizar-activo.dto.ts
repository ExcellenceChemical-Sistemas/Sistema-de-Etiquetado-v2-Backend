// src/usuario/dto/actualizar-activo.dto.ts
import { z } from 'zod';

// Desactivar/reactivar una cuenta sin borrarla (conserva su historial).
export const actualizarActivoSchema = z.object({
  activo: z.boolean(),
});

export type ActualizarActivoDto = z.infer<typeof actualizarActivoSchema>;
