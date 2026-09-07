// src/usuario/dto/actualizar-rol-kpis.dto.ts
import { z } from 'zod';

// Asignar/quitar el rol de Admin de KPIs (§1.1). Es potestad exclusiva del
// Admin general: el propio Admin de KPIs no puede repartir el flag.
export const actualizarRolKpisSchema = z.object({
  esAdminKpis: z.boolean(),
});

export type ActualizarRolKpisDto = z.infer<typeof actualizarRolKpisSchema>;
