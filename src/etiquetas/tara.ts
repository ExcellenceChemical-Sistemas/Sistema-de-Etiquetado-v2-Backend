const GRAMOS_POR_UNIDAD: Record<string, number> = { KG: 1000, GR: 1 };
const MILILITROS_POR_UNIDAD: Record<string, number> = { L: 1000, ML: 1 };

function aNumero(texto: string): number {
  return Number(texto.trim().replace(',', '.'));
}

/**
 * Tara = peso bruto - peso neto, expresada en la misma unidad del peso bruto
 * (KG con 3 decimales, GR sin ceros de más). Devuelve null cuando no se puede
 * calcular de forma confiable:
 *  - no hay cantidad neta;
 *  - la cantidad neta es un VOLUMEN (ML/L) y el producto no tiene densidad
 *    (g/ml): sin ella no se puede pasar el volumen a peso, y un valor inventado
 *    quedaría impreso en la etiqueta. Con densidad, neto en peso = volumen × densidad;
 *  - el resultado no es un número o es negativo (bruto menor que neto).
 */
export function calcularTara(
  pesoBruto: string,
  unidadBruto: string,
  cantidadNeta: string | undefined,
  unidadNeta: string,
  densidad?: number | null,
): string | null {
  if (!cantidadNeta?.trim()) return null;
  const factorBruto = GRAMOS_POR_UNIDAD[unidadBruto];
  if (!factorBruto) return null;

  let netoG: number;
  const factorPeso = GRAMOS_POR_UNIDAD[unidadNeta];
  const factorVolumen = MILILITROS_POR_UNIDAD[unidadNeta];
  if (factorPeso) {
    netoG = aNumero(cantidadNeta) * factorPeso;
  } else if (factorVolumen) {
    if (!densidad || densidad <= 0) return null;
    netoG = aNumero(cantidadNeta) * factorVolumen * densidad;
  } else {
    return null;
  }

  const brutoG = aNumero(pesoBruto) * factorBruto;
  if (!Number.isFinite(brutoG) || !Number.isFinite(netoG)) return null;

  const taraG = Math.round((brutoG - netoG) * 1000) / 1000;
  if (taraG < 0) return null;

  return unidadBruto === 'KG'
    ? (taraG / 1000).toFixed(3)
    : String(Number(taraG.toFixed(3)));
}
