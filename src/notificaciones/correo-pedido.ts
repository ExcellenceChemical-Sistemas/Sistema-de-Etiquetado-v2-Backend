// Texto de los correos que se le mandan al cliente cuando su pedido cambia de etapa.
// Es lógica pura (sin red ni base) para poder probarla.
//
// Ojo con lo que escribe la gente: el número de proforma lo tipea alguien de la empresa,
// así que se trata como texto NO confiable: se le quitan los saltos de línea (evita
// inyectar cabeceras en el asunto) y se escapa antes de ponerlo en el HTML.

export type EtapaAviso = 'SALIO' | 'ENTREGADO';

export interface DatosCorreoPedido {
  etapa: EtapaAviso;
  proforma: string;
  /** Enlace público de seguimiento (/p/<token>). */
  enlace: string;
}

export interface CorreoArmado {
  asunto: string;
  texto: string;
  html: string;
}

const EMPRESA = 'Excellence Chemical';

const MENSAJES: Record<EtapaAviso, { asunto: (p: string) => string; titulo: string; cuerpo: string }> = {
  SALIO: {
    asunto: (p) => `Tu pedido ${p} salió de nuestro almacén`,
    titulo: 'Tu pedido va en camino',
    cuerpo: 'Tu pedido salió de nuestro almacén y está en camino.',
  },
  ENTREGADO: {
    asunto: (p) => `Tu pedido ${p} fue entregado`,
    titulo: 'Tu pedido fue entregado',
    cuerpo: 'Registramos la entrega de tu pedido. Gracias por confiar en nosotros.',
  },
};

/** Una sola línea, sin caracteres de control, de largo acotado. */
export function limpiarLinea(valor: string, max = 60): string {
  // eslint-disable-next-line no-control-regex
  return valor.replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

export function escaparHtml(valor: string): string {
  return valor
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function armarCorreoPedido({ etapa, proforma, enlace }: DatosCorreoPedido): CorreoArmado {
  const m = MENSAJES[etapa];
  const p = limpiarLinea(proforma) || 's/n';

  const texto = [
    m.titulo,
    '',
    m.cuerpo,
    `N° de proforma: ${p}`,
    '',
    `Sigue el estado de tu pedido aquí: ${enlace}`,
    '',
    `${EMPRESA} S.A.C.`,
    'Este es un aviso automático. Si tienes dudas, comunícate con nosotros indicando tu número de proforma.',
  ].join('\n');

  const html = `<!DOCTYPE html>
<html lang="es"><body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;color:#18181b">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:12px;padding:28px">
<tr><td>
<p style="margin:0 0 4px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#71717a">${EMPRESA}</p>
<h1 style="margin:0 0 16px;font-size:22px;line-height:1.3">${escaparHtml(m.titulo)}</h1>
<p style="margin:0 0 16px;font-size:15px;line-height:1.5">${escaparHtml(m.cuerpo)}</p>
<p style="margin:0 0 20px;font-size:15px"><span style="color:#71717a">N° de proforma</span><br><strong>${escaparHtml(p)}</strong></p>
<p style="margin:0 0 24px"><a href="${escaparHtml(enlace)}" style="display:inline-block;background:#0f766e;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-size:15px">Ver el estado de mi pedido</a></p>
<p style="margin:0;font-size:12px;line-height:1.5;color:#71717a">Este es un aviso automático. Si tienes dudas, comunícate con ${EMPRESA} S.A.C. indicando tu número de proforma.</p>
</td></tr></table>
</td></tr></table>
</body></html>`;

  return { asunto: m.asunto(p), texto, html };
}
