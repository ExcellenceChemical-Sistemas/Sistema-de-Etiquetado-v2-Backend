import { Type } from 'class-transformer';
import { IsString, IsUrl, ValidateNested } from 'class-validator';

class PushKeysDto {
  @IsString()
  p256dh: string;

  @IsString()
  auth: string;
}

// Shape exacto de PushSubscription.toJSON() del navegador.
export class SuscripcionPushDto {
  @IsUrl({ require_tld: false })
  endpoint: string;

  @ValidateNested()
  @Type(() => PushKeysDto)
  keys: PushKeysDto;
}

export class DesuscripcionPushDto {
  @IsUrl({ require_tld: false })
  endpoint: string;
}
