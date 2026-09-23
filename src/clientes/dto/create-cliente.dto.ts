import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { TipoDocumentoCliente } from '../../generated/prisma';

export class CreateClienteDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  nombre: string;

  @IsOptional()
  @IsEnum(TipoDocumentoCliente)
  tipoDocumento?: TipoDocumentoCliente;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  numeroDocumento?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  direccion?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  celular?: string;
}
