// El `mimetype` de una subida lo declara el cliente: cualquiera puede mandar un
// ejecutable o un HTML diciendo que es "application/pdf". Acá se comprueba que los
// primeros bytes (la "firma" del formato) coincidan con lo que dice ser.

import { BadRequestException } from '@nestjs/common';

const ZIP = [0x50, 0x4b, 0x03, 0x04]; // docx / xlsx / pptx son ZIP
const OLE2 = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]; // doc / xls / ppt antiguos

function empiezaCon(buffer: Buffer, firma: number[], desde = 0): boolean {
  return buffer.length >= desde + firma.length && firma.every((b, i) => buffer[desde + i] === b);
}

/** true si el contenido es del formato que declara `mimetype`; false si no coincide o no se conoce. */
export function coincideFirma(mimetype: string, buffer: Buffer): boolean {
  switch (mimetype) {
    case 'application/pdf':
      // El estándar tolera basura antes de "%PDF-" dentro de los primeros 1024 bytes.
      return buffer.subarray(0, 1024).includes('%PDF-');
    case 'image/png':
      return empiezaCon(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case 'image/jpeg':
      return empiezaCon(buffer, [0xff, 0xd8, 0xff]);
    case 'image/webp':
      return empiezaCon(buffer, [0x52, 0x49, 0x46, 0x46]) && empiezaCon(buffer, [0x57, 0x45, 0x42, 0x50], 8);
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
    case 'application/vnd.openxmlformats-officedocument.presentationml.presentation':
      return empiezaCon(buffer, ZIP);
    case 'application/msword':
    case 'application/vnd.ms-excel':
    case 'application/vnd.ms-powerpoint':
      return empiezaCon(buffer, OLE2);
    default:
      return false;
  }
}

/** Lanza 400 si el archivo no es realmente del tipo que declara. */
export function exigirFirma(file: { mimetype: string; buffer: Buffer }): void {
  if (!coincideFirma(file.mimetype, file.buffer)) {
    throw new BadRequestException('El contenido del archivo no coincide con su formato');
  }
}
