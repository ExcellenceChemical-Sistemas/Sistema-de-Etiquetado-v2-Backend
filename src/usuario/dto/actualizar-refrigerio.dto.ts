// src/usuario/dto/actualizar-refrigerio.dto.ts
import { z } from 'zod';

// Refrigerio en minutos desde medianoche (ej. 720 = 12:00pm). Los dos van juntos: se cargan o se
// limpian a la vez, nunca uno sin el otro — evitaría una ventana [null, 13:00) sin sentido.
export const actualizarRefrigerioSchema = z
  .object({
    refrigerioInicioMinutos: z.number().int().min(0).max(1439).nullable(),
    refrigerioFinMinutos: z.number().int().min(0).max(1439).nullable(),
  })
  .refine((d) => (d.refrigerioInicioMinutos === null) === (d.refrigerioFinMinutos === null), {
    message: 'Definí el inicio y el fin del refrigerio juntos, o dejá los dos vacíos',
  })
  .refine(
    (d) => d.refrigerioInicioMinutos === null || d.refrigerioFinMinutos! > d.refrigerioInicioMinutos!,
    { message: 'El fin del refrigerio tiene que ser después del inicio' },
  );

export type ActualizarRefrigerioDto = z.infer<typeof actualizarRefrigerioSchema>;
