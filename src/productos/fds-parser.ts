// Lee el texto de una ficha de datos de seguridad (FDS) y propone la clasificación
// GHS del producto: pictogramas, palabra de advertencia y frases H/P (sección 2).
// Es una PROPUESTA: siempre la revisa una persona antes de guardarla.

export interface ClasificacionFds {
  pictogramasGhs: string[];
  palabraAdvertencia: 'PELIGRO' | 'ATENCION' | null;
  frasesH: string[];
  frasesP: string[];
}

// Textos oficiales (CLP/SGA) de las indicaciones de peligro, para cuando la FDS solo trae el código.
const TEXTO_H: Record<string, string> = {
  H200: 'Explosivo inestable.',
  H201: 'Explosivo; peligro de explosión en masa.',
  H202: 'Explosivo; grave peligro de proyección.',
  H203: 'Explosivo; peligro de incendio, de onda expansiva o de proyección.',
  H204: 'Peligro de incendio o de proyección.',
  H205: 'Peligro de explosión en masa en caso de incendio.',
  H220: 'Gas extremadamente inflamable.',
  H221: 'Gas inflamable.',
  H222: 'Aerosol extremadamente inflamable.',
  H223: 'Aerosol inflamable.',
  H224: 'Líquido y vapores extremadamente inflamables.',
  H225: 'Líquido y vapores muy inflamables.',
  H226: 'Líquidos y vapores inflamables.',
  H228: 'Sólido inflamable.',
  H229: 'Recipiente presurizado: puede reventar si se calienta.',
  H240: 'Peligro de explosión en caso de calentamiento.',
  H241: 'Peligro de incendio o de explosión en caso de calentamiento.',
  H242: 'Peligro de incendio en caso de calentamiento.',
  H250: 'Se inflama espontáneamente en contacto con el aire.',
  H251: 'Se calienta espontáneamente; puede inflamarse.',
  H252: 'Se calienta espontáneamente en grandes cantidades; puede inflamarse.',
  H260: 'En contacto con el agua desprende gases inflamables que pueden inflamarse espontáneamente.',
  H261: 'En contacto con el agua desprende gases inflamables.',
  H270: 'Puede provocar o agravar un incendio; comburente.',
  H271: 'Puede provocar un incendio o una explosión; muy comburente.',
  H272: 'Puede agravar un incendio; comburente.',
  H280: 'Contiene gas a presión; puede explotar si se calienta.',
  H281: 'Contiene gas refrigerado; puede provocar quemaduras o lesiones criogénicas.',
  H290: 'Puede ser corrosivo para los metales.',
  H300: 'Mortal en caso de ingestión.',
  H301: 'Tóxico en caso de ingestión.',
  H302: 'Nocivo en caso de ingestión.',
  H304: 'Puede ser mortal en caso de ingestión y de penetración en las vías respiratorias.',
  H310: 'Mortal en contacto con la piel.',
  H311: 'Tóxico en contacto con la piel.',
  H312: 'Nocivo en contacto con la piel.',
  H314: 'Provoca quemaduras graves en la piel y lesiones oculares graves.',
  H315: 'Provoca irritación cutánea.',
  H317: 'Puede provocar una reacción alérgica en la piel.',
  H318: 'Provoca lesiones oculares graves.',
  H319: 'Provoca irritación ocular grave.',
  H330: 'Mortal en caso de inhalación.',
  H331: 'Tóxico en caso de inhalación.',
  H332: 'Nocivo en caso de inhalación.',
  H334: 'Puede provocar síntomas de alergia o asma o dificultades respiratorias en caso de inhalación.',
  H335: 'Puede irritar las vías respiratorias.',
  H336: 'Puede provocar somnolencia o vértigo.',
  H340: 'Puede provocar defectos genéticos.',
  H341: 'Se sospecha que provoca defectos genéticos.',
  H350: 'Puede provocar cáncer.',
  H351: 'Se sospecha que provoca cáncer.',
  H360: 'Puede perjudicar la fertilidad o dañar al feto.',
  H361: 'Se sospecha que perjudica la fertilidad o daña al feto.',
  H362: 'Puede perjudicar a los niños alimentados con leche materna.',
  H370: 'Provoca daños en los órganos.',
  H371: 'Puede provocar daños en los órganos.',
  H372: 'Provoca daños en los órganos tras exposiciones prolongadas o repetidas.',
  H373: 'Puede provocar daños en los órganos tras exposiciones prolongadas o repetidas.',
  H400: 'Muy tóxico para los organismos acuáticos.',
  H410: 'Muy tóxico para los organismos acuáticos, con efectos nocivos duraderos.',
  H411: 'Tóxico para los organismos acuáticos, con efectos nocivos duraderos.',
  H412: 'Nocivo para los organismos acuáticos, con efectos nocivos duraderos.',
  H413: 'Puede ser nocivo para los organismos acuáticos, con efectos nocivos duraderos.',
};

// Pictograma que corresponde a cada indicación de peligro (Anexo V del CLP / SGA).
function pictogramasDe(codigosH: string[]): string[] {
  const base = (c: string) => c.replace(/[A-Za-z]+$/, ''); // H360FD -> H360
  const h = new Set(codigosH.map(base));
  const tiene = (...cs: string[]) => cs.some((c) => h.has(c));
  const p = new Set<string>();

  if (tiene('H200', 'H201', 'H202', 'H203', 'H204', 'H205', 'H240', 'H241')) p.add('GHS01');
  if (tiene('H220', 'H221', 'H222', 'H223', 'H224', 'H225', 'H226', 'H228', 'H241', 'H242',
    'H250', 'H251', 'H252', 'H260', 'H261')) p.add('GHS02');
  if (tiene('H270', 'H271', 'H272')) p.add('GHS03');
  if (tiene('H280', 'H281')) p.add('GHS04');
  if (tiene('H290', 'H314', 'H318')) p.add('GHS05');
  if (tiene('H300', 'H301', 'H310', 'H311', 'H330', 'H331')) p.add('GHS06');
  if (tiene('H304', 'H334', 'H340', 'H341', 'H350', 'H351', 'H360', 'H361',
    'H370', 'H371', 'H372', 'H373')) p.add('GHS08');
  if (tiene('H400', 'H410', 'H411')) p.add('GHS09');

  // Signo de exclamación: no se pone si ya lo cubre un pictograma más grave.
  const irritacion = !p.has('GHS05') && tiene('H315', 'H319');
  const nocivo = !p.has('GHS06') && tiene('H302', 'H312', 'H332');
  if (irritacion || nocivo || tiene('H317', 'H335', 'H336')) p.add('GHS07');

  return [...p].sort();
}

// Se queda con la sección 2 ("Identificación de los peligros"): las secciones 3 y 16
// suelen listar frases H de los componentes que no son la clasificación del producto.
function seccion2(texto: string): string {
  const inicio = texto.search(/(secci[oó]n|section)\s*2\s*[:.\-–—]?/i);
  if (inicio < 0) return texto;
  const resto = texto.slice(inicio + 5);
  const fin = resto.search(/(secci[oó]n|section)\s*3\s*[:.\-–—]?/i);
  return fin < 0 ? resto : resto.slice(0, fin);
}

// Corta el texto de una frase donde empieza otro encabezado de la FDS.
const CORTE = /\s(?:consejos de prudencia|indicaciones de peligro|prevenci[oó]n:|respuesta:|almacenamiento:|eliminaci[oó]n:|otros peligros|\d{1,2}\.\d{1,2}\.?\s+[A-ZÁÉÍÓÚ]|pictogramas?|palabra de)/i;

function limpiar(t: string): string {
  const corte = t.search(CORTE);
  if (corte >= 0) t = t.slice(0, corte);
  return t.replace(/\s+/g, ' ').replace(/^[\s:.\-–—]+/, '').replace(/[\s;,]+$/, '').trim().slice(0, 270);
}

function palabraDe(texto: string): ClasificacionFds['palabraAdvertencia'] {
  const m = texto.match(
    /(palabra\s+de\s+(?:advertencia|se[nñ]al)|se[nñ]al\s+de\s+advertencia|signal\s+word)[\s:.\-–—]*([A-Za-zÁÉÍÓÚáéíóú]+)/i,
  );
  if (!m) return null;
  const w = m[2].toLowerCase();
  if (w === 'peligro' || w === 'danger') return 'PELIGRO';
  if (w === 'atención' || w === 'atencion' || w === 'warning') return 'ATENCION';
  return null;
}

export function clasificarDesdeTexto(textoCompleto: string): ClasificacionFds {
  const texto = seccion2(textoCompleto.replace(/\r/g, ''));
  const plano = texto.replace(/\s+/g, ' ');

  // Frases H: código (+ texto que la FDS pone a continuación, si lo hay).
  const reH = /\b(EUH\d{3}|H\s?\d{3}[A-Za-z]{0,2}(?:\s*\+\s*H\s?\d{3}[A-Za-z]{0,2})*)\b/g;
  const reP = /\b(P\s?\d{3}(?:\s*\+\s*P\s?\d{3})*)\b/g;
  const marcas: { i: number; fin: number; codigo: string; tipo: 'H' | 'P' }[] = [];
  for (const m of plano.matchAll(reH)) {
    marcas.push({ i: m.index!, fin: m.index! + m[0].length, codigo: m[1].replace(/\s/g, ''), tipo: 'H' });
  }
  for (const m of plano.matchAll(reP)) {
    marcas.push({ i: m.index!, fin: m.index! + m[0].length, codigo: m[1].replace(/\s/g, ''), tipo: 'P' });
  }
  marcas.sort((a, b) => a.i - b.i);

  const frasesH: string[] = [];
  const frasesP: string[] = [];
  const vistosH = new Set<string>();
  const vistosP = new Set<string>();
  const codigosH: string[] = [];

  marcas.forEach((m, k) => {
    const siguiente = marcas[k + 1]?.i ?? plano.length;
    let detalle = limpiar(plano.slice(m.fin, Math.min(siguiente, m.fin + 300)));
    // Un "H" suelto es ambiguo si no está en la lista (evita falsos positivos como "H2O").
    if (m.tipo === 'H' && !m.codigo.startsWith('EUH') && !m.codigo.includes('+') && !TEXTO_H[m.codigo.replace(/[A-Za-z]+$/, '')]) return;
    if (m.tipo === 'H') {
      const base = m.codigo.replace(/[A-Za-z]+$/, '');
      if (vistosH.has(m.codigo)) return;
      vistosH.add(m.codigo);
      if (!m.codigo.startsWith('EUH')) codigosH.push(...m.codigo.split('+'));
      if (!detalle || detalle.length < 8) detalle = TEXTO_H[base] ?? '';
      frasesH.push(detalle ? `${m.codigo}: ${detalle}` : m.codigo);
    } else {
      if (vistosP.has(m.codigo)) return;
      vistosP.add(m.codigo);
      frasesP.push(detalle ? `${m.codigo}: ${detalle}` : m.codigo);
    }
  });

  let pictogramas = pictogramasDe(codigosH);
  if (pictogramas.length === 0) {
    const explicitos = [...plano.matchAll(/\b(?:GHS|SGH)\s?0([1-9])\b/gi)].map((m) => `GHS0${m[1]}`);
    pictogramas = [...new Set(explicitos)].sort();
  }

  return {
    pictogramasGhs: pictogramas,
    palabraAdvertencia: palabraDe(plano),
    frasesH,
    frasesP,
  };
}
