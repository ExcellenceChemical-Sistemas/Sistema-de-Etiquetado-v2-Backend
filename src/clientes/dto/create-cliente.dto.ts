import { IsBoolean, IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
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

  // Correo para los avisos del pedido. Opcional; solo se valida el formato.
  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  email?: string;

  // El personal confirma que informó al cliente y este autoriza el uso de sus datos de
  // contacto. El backend guarda la fecha (autorizaContactoEn), no este booleano.
  @IsOptional()
  @IsBoolean()
  autorizaContacto?: boolean;
}
