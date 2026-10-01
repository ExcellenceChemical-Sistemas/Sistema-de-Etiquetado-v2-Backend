// Respaldo para cuando la FDS es un PDF escaneado (sin texto embebido): renderiza las
// primeras páginas a imagen con poppler (pdftoppm) y les pasa OCR con tesseract. La ruta
// normal (texto embebido, ver productos.controller.ts) es más confiable y se intenta primero;
// esto solo corre cuando esa falla. Requiere los paquetes `poppler-utils` y `tesseract-ocr` +
// `tesseract-ocr-spa` instalados en el sistema (ver Dockerfile) — no son dependencias npm.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const execFileAsync = promisify(execFile);

// La sección 2 ("Identificación de los peligros") de una FDS siempre está cerca del
// principio del documento: no hace falta OCR-ear fichas enteras de 20+ páginas.
const PAGINAS_MAX = 4;

export async function textoPorOcr(pdfBuffer: Buffer): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'ficha-ocr-'));
  try {
    const pdfPath = join(dir, 'ficha.pdf');
    await writeFile(pdfPath, pdfBuffer);

    const prefijo = join(dir, 'pagina');
    await execFileAsync('pdftoppm', ['-png', '-r', '200', '-l', String(PAGINAS_MAX), pdfPath, prefijo]);

    const paginas = (await readdir(dir)).filter((f) => f.startsWith('pagina') && f.endsWith('.png')).sort();

    let texto = '';
    for (const pagina of paginas) {
      const { stdout } = await execFileAsync('tesseract', [join(dir, pagina), 'stdout', '-l', 'spa+eng']);
      texto += `\n${stdout}`;
    }
    return texto;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
