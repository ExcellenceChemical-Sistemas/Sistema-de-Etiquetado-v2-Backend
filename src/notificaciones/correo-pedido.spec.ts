import { armarCorreoPedido, escaparHtml, limpiarLinea } from './correo-pedido';

const ENLACE = 'https://excellencechemical.vercel.app/p/abc123';

describe('armarCorreoPedido', () => {
  it('SALIO: avisa que va en camino, con proforma y enlace', () => {
    const c = armarCorreoPedido({ etapa: 'SALIO', proforma: 'PF-0042', enlace: ENLACE });
    expect(c.asunto).toBe('Tu pedido PF-0042 salió de nuestro almacén');
    expect(c.texto).toContain('PF-0042');
    expect(c.texto).toContain(ENLACE);
    expect(c.html).toContain(`href="${ENLACE}"`);
    expect(c.html).toContain('Tu pedido va en camino');
  });

  it('ENTREGADO: confirma la entrega', () => {
    const c = armarCorreoPedido({ etapa: 'ENTREGADO', proforma: 'PF-0042', enlace: ENLACE });
    expect(c.asunto).toBe('Tu pedido PF-0042 fue entregado');
    expect(c.html).toContain('Tu pedido fue entregado');
  });

  it('no filtra nada interno: solo proforma, estado y enlace', () => {
    const c = armarCorreoPedido({ etapa: 'SALIO', proforma: 'PF-0042', enlace: ENLACE });
    expect(c.texto + c.html).not.toMatch(/observaci|cancel|precio|usuario|cliente/i);
  });

  it('la proforma es texto no confiable: no puede inyectar HTML', () => {
    const c = armarCorreoPedido({
      etapa: 'SALIO',
      proforma: '<script>alert(1)</script><img src=x onerror=1>',
      enlace: ENLACE,
    });
    expect(c.html).not.toContain('<script>');
    expect(c.html).not.toContain('<img');
    expect(c.html).toContain('&lt;script&gt;');
  });

  it('la proforma no puede inyectar cabeceras en el asunto (saltos de línea)', () => {
    const c = armarCorreoPedido({ etapa: 'SALIO', proforma: 'PF-1\r\nBcc: otro@x.com', enlace: ENLACE });
    expect(c.asunto).not.toMatch(/[\r\n]/);
    expect(c.asunto).toContain('PF-1 Bcc: otro@x.com');
  });

  it('una proforma vacía no deja el asunto roto', () => {
    expect(armarCorreoPedido({ etapa: 'SALIO', proforma: '  ', enlace: ENLACE }).asunto).toContain('s/n');
  });
});

describe('limpiarLinea / escaparHtml', () => {
  it('limpiarLinea quita controles, colapsa espacios y acota el largo', () => {
    expect(limpiarLinea('a\n\tb   c')).toBe('a b c');
    expect(limpiarLinea('x'.repeat(200)).length).toBe(60);
  });

  it('escaparHtml cubre los cinco caracteres peligrosos', () => {
    expect(escaparHtml(`<a href="x">&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;');
  });
});
