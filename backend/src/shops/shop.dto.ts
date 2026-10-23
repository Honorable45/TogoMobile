import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsOptional, IsString, Length, MaxLength, ValidateNested, registerDecorator, ValidationOptions } from 'class-validator';
import { IsPhone, Trim, TrimOrNull } from '../common/validators';

/** Domaines autorisés par réseau social. Seuls des liens https vers ces domaines sont acceptés. */
export const SOCIAL_HOSTS: Record<string, string[]> = {
  facebook: ['facebook.com', 'fb.com', 'm.facebook.com', 'web.facebook.com'],
  instagram: ['instagram.com'],
  tiktok: ['tiktok.com', 'vm.tiktok.com'],
  youtube: ['youtube.com', 'youtu.be', 'm.youtube.com'],
  website: [], // tout domaine, https uniquement
};

export function normalizeSocialUrl(network: string, raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;
  if (url.username || url.password) return null;
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  const allowed = SOCIAL_HOSTS[network];
  if (!allowed) return null;
  if (allowed.length && !allowed.some((h) => host === h || host.endsWith('.' + h))) return null;
  if (!allowed.length && !host.includes('.')) return null;
  url.hash = '';
  return url.toString();
}

function IsSocialUrl(network: string, options?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isSocialUrl',
      target: object.constructor,
      propertyName,
      options: {
        message:
          network === 'website'
            ? 'Lien invalide : adresse https:// attendue.'
            : `Lien ${network} invalide : adresse https:// du site ${network} attendue.`,
        ...options,
      },
      validator: {
        validate: (v: unknown) => v === null || v === undefined || (typeof v === 'string' && !!normalizeSocialUrl(network, v)),
      },
    });
  };
}

export class SocialLinksDto {
  @ApiPropertyOptional() @TrimOrNull() @IsOptional() @MaxLength(300) @IsSocialUrl('facebook') facebook?: string | null;
  @ApiPropertyOptional() @TrimOrNull() @IsOptional() @MaxLength(300) @IsSocialUrl('instagram') instagram?: string | null;
  @ApiPropertyOptional() @TrimOrNull() @IsOptional() @MaxLength(300) @IsSocialUrl('tiktok') tiktok?: string | null;
  @ApiPropertyOptional() @TrimOrNull() @IsOptional() @MaxLength(300) @IsSocialUrl('youtube') youtube?: string | null;
  @ApiPropertyOptional() @TrimOrNull() @IsOptional() @MaxLength(300) @IsSocialUrl('website') website?: string | null;
}

export class CreateShopDto {
  @ApiProperty({ example: 'Galaxy Phones Lomé' })
  @Trim()
  @IsString()
  @Length(2, 60, { message: 'Le nom de la boutique doit contenir entre 2 et 60 caractères.' })
  name: string;

  @ApiPropertyOptional()
  @Trim()
  @IsOptional()
  @IsString()
  @MaxLength(600)
  description?: string;

  @ApiProperty({ example: 'Lomé' })
  @Trim()
  @IsString()
  @Length(2, 60)
  city: string;

  @ApiPropertyOptional({ example: 'Déckon' })
  @Trim()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  district?: string;

  @ApiPropertyOptional()
  @Trim()
  @IsOptional()
  @IsString()
  @MaxLength(160)
  address?: string;

  @ApiProperty({ example: '+228 90 12 34 56', description: 'Numéro WhatsApp professionnel utilisé pour les commandes' })
  @Trim()
  @IsPhone()
  whatsapp: string;

  @ApiPropertyOptional()
  @Trim()
  @IsOptional()
  @IsPhone()
  phone?: string;

  @ApiPropertyOptional({ type: SocialLinksDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => SocialLinksDto)
  socialLinks?: SocialLinksDto;

  @ApiPropertyOptional({ example: 'Lun–Sam 8 h–19 h' })
  @Trim()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  openingHours?: string;
}

export class UpdateShopDto {
  @ApiPropertyOptional() @Trim() @IsOptional() @IsString() @Length(2, 60) name?: string;
  @ApiPropertyOptional() @TrimOrNull() @IsOptional() @IsString() @MaxLength(600) description?: string | null;
  @ApiPropertyOptional() @Trim() @IsOptional() @IsString() @Length(2, 60) city?: string;
  @ApiPropertyOptional() @TrimOrNull() @IsOptional() @IsString() @MaxLength(80) district?: string | null;
  @ApiPropertyOptional() @TrimOrNull() @IsOptional() @IsString() @MaxLength(160) address?: string | null;
  @ApiPropertyOptional() @Trim() @IsOptional() @IsPhone() whatsapp?: string;
  @ApiPropertyOptional() @TrimOrNull() @IsOptional() @IsPhone() phone?: string | null;
  @ApiPropertyOptional() @TrimOrNull() @IsOptional() @IsString() @MaxLength(120) openingHours?: string | null;

  @ApiPropertyOptional({ type: SocialLinksDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => SocialLinksDto)
  socialLinks?: SocialLinksDto;
}
