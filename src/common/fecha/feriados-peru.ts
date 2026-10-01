// Mismo criterio que app/utils/feriadosPeru.ts en el frontend (duplicado a propósito: son
// paquetes npm separados, sin un tercero compartido todavía). Se usa acá para detectar alertas
// de integridad en Cotizaciones (ver cotizaciones.service.ts): una fecha de etapa que cae en
// fin de semana o feriado es imposible si de verdad la hizo Joel, porque la empresa no trabaja
// esos días.

function domingoDePascua(anio: number): Date {
  // Algoritmo de Gauss/Meeus.
  const a = anio % 19;
  const b = Math.floor(anio / 100);
  const c = anio % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(anio, mes - 1, dia);
}

const FERIADOS_FIJOS: [mes: number, dia: number][] = [
  [1, 1],
  [5, 1],
  [6, 29],
  [7, 28],
  [7, 29],
  [8, 30],
  [10, 8],
  [11, 1],
  [12, 8],
  [12, 9],
  [12, 25],
];

// Año/mes(1-12)/día puros, sin Date ni huso horario: la usan tanto esFeriadoPeru (con los
// getters locales de un Date, igual que siempre) como corte-aviso-almacen.ts (que ya hizo la
// conversión a hora Perú a mano y no quiere que un getMonth()/getDate() local la pise).
export function esFeriadoPeruYMD(anio: number, mes: number, dia: number): boolean {
  if (FERIADOS_FIJOS.some(([m, d]) => m === mes && d === dia)) return true;

  const pascua = domingoDePascua(anio);
  const juevesSanto = new Date(pascua);
  juevesSanto.setDate(pascua.getDate() - 3);
  const viernesSanto = new Date(pascua);
  viernesSanto.setDate(pascua.getDate() - 2);
  const esMismaFecha = (d: Date) => d.getFullYear() === anio && d.getMonth() + 1 === mes && d.getDate() === dia;
  return esMismaFecha(juevesSanto) || esMismaFecha(viernesSanto);
}

export function esFeriadoPeru(fecha: Date): boolean {
  return esFeriadoPeruYMD(fecha.getFullYear(), fecha.getMonth() + 1, fecha.getDate());
}

export function esDiaNoLaboral(fecha: Date): boolean {
  const dia = fecha.getDay(); // 0 domingo ... 6 sábado
  return dia === 0 || dia === 6 || esFeriadoPeru(fecha);
}
