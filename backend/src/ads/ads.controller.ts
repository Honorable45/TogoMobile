import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { ApiConsumes, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsDate, IsInt, IsOptional, IsString, Length, Max, MaxLength, Min, ValidateIf, registerDecorator } from 'class-validator';
import { AuthUser, CurrentUser, Roles } from '../common/auth.decorators';
import { Trim, TrimOrNull } from '../common/validators';
import { imageUpload } from '../shops/shops.controller';
import { AdsService } from './ads.service';

/** Lien d'une publicité : https://… ou chemin interne (/catalogue?…). Jamais javascript:, data:, http: ni //hôte. */
export function isSafeAdLink(v: unknown) {
  if (typeof v !== 'string' || v.length > 500 || /\s/.test(v)) return false;
  if (v.startsWith('/')) return !v.startsWith('//') && !v.startsWith('/\\');
  try {
    const u = new URL(v);
    return u.protocol === 'https:' && !!u.hostname && !u.username && !u.password;
  } catch {
    return false;
  }
}

function IsAdLink() {
  return (object: object, propertyName: string) =>
    registerDecorator({
      name: 'isAdLink',
      target: object.constructor,
      propertyName,
      options: { message: 'Lien invalide : adresse https://… ou chemin du site commençant par /.' },
      validator: { validate: isSafeAdLink },
    });
}

// Les champs arrivent en texte dans un formulaire multipart, en JSON typé dans une modification.
const toBool = () => Transform(({ value }) => (value === 'true' ? true : value === 'false' ? false : value));
const toInt = () => Transform(({ value }) => (typeof value === 'string' && /^-?\d+$/.test(value.trim()) ? Number(value) : value));
const toDateOrNull = () =>
  Transform(({ value }) => {
    if (value === null || value === '') return null;
    if (typeof value === 'string') {
      const d = new Date(value);
      return Number.isNaN(d.getTime()) ? value : d;
    }
    return value;
  });

class AdFieldsDto {
  @ApiPropertyOptional({ description: 'Texte affiché sur la publicité' })
  @Trim() @IsOptional() @IsString() @Length(2, 80)
  title?: string;

  @ApiPropertyOptional() @TrimOrNull() @IsOptional() @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(140)
  subtitle?: string | null;

  @ApiPropertyOptional({ description: 'Annonceur (affiché avec la mention « Publicité »)' })
  @TrimOrNull() @IsOptional() @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(80)
  advertiser?: string | null;

  @ApiPropertyOptional({ description: 'https://… ou /chemin' })
  @TrimOrNull() @IsOptional() @ValidateIf((_, v) => v !== null) @IsAdLink()
  linkUrl?: string | null;

  @ApiPropertyOptional() @toDateOrNull() @IsOptional() @ValidateIf((_, v) => v !== null) @IsDate({ message: 'Date de début invalide.' })
  startsAt?: Date | null;

  @ApiPropertyOptional() @toDateOrNull() @IsOptional() @ValidateIf((_, v) => v !== null) @IsDate({ message: 'Date de fin invalide.' })
  endsAt?: Date | null;

  @ApiPropertyOptional() @toBool() @IsOptional() @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional() @toInt() @IsOptional() @IsInt() @Min(0) @Max(999)
  sortOrder?: number;
}

@ApiTags('Administration')
@Roles('ADMIN')
@Controller('admin/ads')
export class AdminAdsController {
  constructor(private readonly ads: AdsService) {}

  @Get()
  list() {
    return this.ads.adminList();
  }

  @ApiConsumes('multipart/form-data')
  @UseInterceptors(imageUpload())
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: AdFieldsDto, @UploadedFile() file?: { buffer: Buffer }) {
    if (!file) throw new BadRequestException('Ajoutez une image.');
    return this.ads.create(user.id, dto, file.buffer);
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: AdFieldsDto) {
    return this.ads.update(user.id, id, dto);
  }

  @ApiConsumes('multipart/form-data')
  @UseInterceptors(imageUpload())
  @HttpCode(200)
  @Post(':id/image')
  image(@CurrentUser() user: AuthUser, @Param('id') id: string, @UploadedFile() file?: { buffer: Buffer }) {
    if (!file) throw new BadRequestException('Ajoutez une image.');
    return this.ads.replaceImage(user.id, id, file.buffer);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.ads.remove(user.id, id);
  }
}
