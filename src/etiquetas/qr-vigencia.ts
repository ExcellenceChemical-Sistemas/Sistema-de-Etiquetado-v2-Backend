// Cuánto dura el enlace del QR impreso en una etiqueta (2 años por defecto).
// Pasado ese plazo la página deja de abrir y la limpieza diaria borra el
// trabajo, para que la tabla no crezca sin límite.
export const QR_VIGENCIA_DIAS = Number(process.env.QR_VIGENCIA_DIAS ?? 730);

export function limiteVigenciaQr(): Date {
  const limite = new Date();
  limite.setDate(limite.getDate() - QR_VIGENCIA_DIAS);
  return limite;
}
