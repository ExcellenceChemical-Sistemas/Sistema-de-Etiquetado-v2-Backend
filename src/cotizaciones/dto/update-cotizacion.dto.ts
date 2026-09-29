import { PartialType } from '@nestjs/mapped-types';
import { CreateCotizacionDto } from './create-cotizacion.dto';

// No incluye `estado`: marcar como enviada tiene su propio endpoint
// (POST /cotizaciones/:id/marcar-enviada), porque además registra quién y cuándo.
export class UpdateCotizacionDto extends PartialType(CreateCotizacionDto) {}
