const GRAMOS_POR_UNIDAD: Record<string, number> = { KG: 1000, GR: 1 };

function aNumero(texto: string): number {
  return Number(texto.trim().replace(',', '.'));
}

/**
 * Tara = peso bruto - peso neto, expresada en la misma unidad del peso bruto
 * (KG con 3 decimales, GR sin ceros de más). Devuelve null cuando no se puede
 * calcular de forma confiable:
 *  - no hay cantidad neta;
 *  - la cantidad neta es un VOLUMEN (ML/L): restar un volumen de un peso
 *    necesita la densidad del producto, que el sistema no tiene, y un valor
 *    inventado quedaría impreso en la etiqueta;
 *  - el resultado no es un número o es negativo (bruto menor que neto).
 */
export function calcularTara(
  pesoBruto: string,
  unidadBruto: string,
  cantidadNeta: string | undefined,
  unidadNeta: string,
): string | null {
  if (!cantidadNeta?.trim()) return null;
  const factorBruto = GRAMOS_POR_UNIDAD[unidadBruto];
  const factorNeto = GRAMOS_POR_UNIDAD[unidadNeta];
  if (!factorBruto || !factorNeto) return null;

  const brutoG = aNumero(pesoBruto) * factorBruto;
  const netoG = aNumero(cantidadNeta) * factorNeto;
  if (!Number.isFinite(brutoG) || !Number.isFinite(netoG)) return null;

  const taraG = Math.round((brutoG - netoG) * 1000) / 1000;
  if (taraG < 0) return null;

  return unidadBruto === 'KG'
    ? (taraG / 1000).toFixed(3)
    : String(Number(taraG.toFixed(3)));
}
