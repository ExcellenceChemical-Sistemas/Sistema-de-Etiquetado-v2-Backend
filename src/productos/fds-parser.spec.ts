import { clasificarDesdeTexto } from './fds-parser';

describe('clasificarDesdeTexto', () => {
  const fds = `SECCIÓN 1: Identificación Uso H2O y P2O5.
SECCIÓN 2: Identificación de los peligros
Palabra de advertencia: Peligro
Indicaciones de peligro
H314 Provoca quemaduras graves en la piel y lesiones oculares graves.
H315 Provoca irritación cutánea.
H410
Consejos de prudencia
P280 Llevar guantes de protección.
P305 + P351 + P338 EN CASO DE CONTACTO CON LOS OJOS: aclarar con agua.
2.3 Otros peligros: ninguno
SECCIÓN 3: Composición
H302 Nocivo en caso de ingestión.`;

  it('lee pictogramas, palabra y frases solo de la sección 2', () => {
    const r = clasificarDesdeTexto(fds);
    expect(r.pictogramasGhs).toEqual(['GHS05', 'GHS09']);
    expect(r.palabraAdvertencia).toBe('PELIGRO');
    expect(r.frasesH.map((f) => f.split(':')[0])).toEqual(['H314', 'H315', 'H410']);
    expect(r.frasesH[2]).toContain('Muy tóxico para los organismos acuáticos');
    expect(r.frasesP).toEqual([
      'P280: Llevar guantes de protección.',
      'P305+P351+P338: EN CASO DE CONTACTO CON LOS OJOS: aclarar con agua.',
    ]);
  });

  it('no repite exclamación por irritación si hay corrosivo, ni por nocivo si hay tóxico', () => {
    expect(clasificarDesdeTexto('SECCIÓN 2 H314 H319').pictogramasGhs).toEqual(['GHS05']);
    expect(clasificarDesdeTexto('SECCIÓN 2 H301 H302').pictogramasGhs).toEqual(['GHS06']);
  });

  it('sin clasificación devuelve vacío', () => {
    const r = clasificarDesdeTexto('SECCIÓN 2 Producto no peligroso');
    expect(r).toEqual({ pictogramasGhs: [], palabraAdvertencia: null, frasesH: [], frasesP: [] });
  });
});

// Fragmentos de fichas reales de proveedores, con los formatos distintos que se han visto.
describe('clasificarDesdeTexto con formatos de fichas reales', () => {
  it('ácido azelaico (Laboratorium Discounter): código entre paréntesis después del texto', () => {
    const fds = `SECCIÓN 2. IDENTIFICACIÓN DE LOS PELIGROS
2.1.Clasificación de la sustancia o de la mezcla
Skin Irrit. 2; H315, Provoca irritación cutánea.
Eye Irrit. 2; H319, Provoca irritación ocular grave.
2.2.Elementos de la etiqueta
Pictogramas de peligro:
Palabra de advertencia:Atención
Indicaciones de peligro:Provoca irritación cutánea. (H315)
Provoca irritación ocular grave. (H319)
Consejos de prudencia:
Generalidades:Si se necesita consejo médico, tener a mano 
el envase o la etiqueta. (P101)
Prevención:Lavarse los manos concienzudamente tras la 
manipulación. (P264)
Intervención:EN CASO DE CONTACTO CON LOS OJOS: 
Enjuagar con agua cuidadosamente. (P305+P351+P338)
Almacenamiento:-
2.3.Otros peligros
SECCIÓN 3. COMPOSICIÓN/INFORMACIÓN SOBRE LOS COMPONENTES`;
    const r = clasificarDesdeTexto(fds);
    expect(r.pictogramasGhs).toEqual(['GHS07']);
    expect(r.palabraAdvertencia).toBe('ATENCION');
    expect(r.frasesH).toEqual(['H315: Provoca irritación cutánea.', 'H319: Provoca irritación ocular grave.']);
    expect(r.frasesP[0]).toBe('P101: Si se necesita consejo médico, tener a mano el envase o la etiqueta.');
    expect(r.frasesP[1]).toBe('P264: Lavarse los manos concienzudamente tras la manipulación.');
    expect(r.frasesP[2]).toContain('P305+P351+P338: EN CASO DE CONTACTO CON LOS OJOS');
  });

  it('metanol (Contyquim): ignora el índice, lee H combinadas y la palabra sola en una línea', () => {
    const fds = `ÍNDICE
SECCIÓN 2: IDENTIFICACIÓN DE LOS PELIGROS
SECCIÓN 3: COMPOSICIÓN/INFORMACIÓN SOBRE LOS COMPONENTES
SECCIÓN 2: IDENTIFICACIÓN DE LOS PELIGROS
2.2Elementos de la señalización, incluidas los consejos de prudencia y pictogramas de precaución:
NOM-018-STPS-2015:
Peligro
Indicaciones de peligro:
Liq. Infl. 2: H225 - Líquido y vapores muy inflamables.
STOT única 1: H370 - Provoca daños en los órganos.
Tox. Agud. 3: H301+H311+H331 - Tóxico en caso de ingestión, en contacto con la piel o si se inhala.
Consejos de prudencia:
P210: Mantener alejado del calor, chispas, llamas al descubierto.
P501: Eliminar el contenido/recipiente de acuerdo con la normativa.
2.3Otros peligros que no contribuyen en la clasificación: ND/NA
SECCIÓN 3: COMPOSICIÓN/INFORMACIÓN SOBRE LOS COMPONENTES
H301 en la sección de composición no debe contarse dos veces`;
    const r = clasificarDesdeTexto(fds);
    expect(r.pictogramasGhs).toEqual(['GHS02', 'GHS06', 'GHS08']);
    expect(r.palabraAdvertencia).toBe('PELIGRO');
    expect(r.frasesH.map((f) => f.split(':')[0])).toEqual(['H225', 'H370', 'H301+H311+H331']);
    expect(r.frasesH[2]).toBe(
      'H301+H311+H331: Tóxico en caso de ingestión. Tóxico en contacto con la piel. Tóxico en caso de inhalación.',
    );
    expect(r.frasesP[1]).toBe('P501: Eliminar el contenido/recipiente de acuerdo con la normativa.');
  });

  it('metanol (YPF): encabezado sin la palabra "sección" y códigos con guion', () => {
    const fds = `1. Identificación del producto
2. Identificación de los peligros
Palabra de advertencia: PELIGRO
Indicaciones de peligro:
H225 - Líquido y vapores muy inflamables.
H301 - Tóxico en caso de ingestión.
H311 - Tóxico en contacto con la piel.
H331 - Tóxico en caso de inhalación.
H370 - Provoca daños en los órganos.
3. Composición e información sobre los componentes`;
    const r = clasificarDesdeTexto(fds);
    expect(r.pictogramasGhs).toEqual(['GHS02', 'GHS06', 'GHS08']);
    expect(r.palabraAdvertencia).toBe('PELIGRO');
    expect(r.frasesH).toHaveLength(5);
  });

  it('las frases P no arrastran encabezados de página ni otras secciones', () => {
    const fds = `SECCIÓN 2 Identificación de los peligros
Palabra de advertencia: PELIGRO
H314 Provoca quemaduras graves.
P301+P330+P331: EN CASO DE INGESTIÓN: Enjuagarse la boca. NO provocar el vómito. HOJA DE DATOS DE SEGURIDAD Acido Sulfúrico 98%
P405: Guardar bajo llave. Etiquetado (65/548/CEE) Frases R:R35`;
    const r = clasificarDesdeTexto(fds);
    expect(r.pictogramasGhs).toEqual(['GHS05']);
    expect(r.frasesP).toEqual([
      'P301+P330+P331: EN CASO DE INGESTIÓN: Enjuagarse la boca. NO provocar el vómito.',
      'P405: Guardar bajo llave.',
    ]);
  });
});
