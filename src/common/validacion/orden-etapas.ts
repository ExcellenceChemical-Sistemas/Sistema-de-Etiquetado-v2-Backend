import { BadRequestException } from '@nestjs/common';

export interface EtapaOrdenada {
  label: string;
  valor: Date | null;
}

// Pedidos y Cotizaciones son, cada uno, una secuencia de etapas que deben pasar en orden (no se
// puede "preparar" antes de "recibir"). Hubo errores reales de carga donde una etapa posterior
// quedó con una fecha anterior a la etapa previa — esto los rechaza, tanto si vienen del
// formulario (marcar/corregir una fecha) como de cualquier otro cliente del API. Ignora las
// etapas que todavía no se marcaron (null): la secuencia no exige que estén todas presentes,
// solo que las que SÍ están, estén en orden entre sí.
export function validarOrdenCronologico(etapas: EtapaOrdenada[]): void {
  let anterior: EtapaOrdenada | null = null;
  for (const etapa of etapas) {
    if (!etapa.valor) continue;
    if (anterior && etapa.valor.getTime() < anterior.valor!.getTime()) {
      const formato = (d: Date) => d.toLocaleString('es-PE', { timeZone: 'America/Lima' });
      throw new BadRequestException(
        `"${etapa.label}" no puede quedar antes de "${anterior.label}" — el proceso debe respetar su orden ` +
          `(${anterior.label}: ${formato(anterior.valor!)}, ${etapa.label}: ${formato(etapa.valor)}).`,
      );
    }
    anterior = etapa;
  }
}
