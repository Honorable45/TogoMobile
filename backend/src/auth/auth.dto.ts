import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, Length, MaxLength } from 'class-validator';
import { IsPhone, IsStrongPassword, Trim } from '../common/validators';

export class RegisterDto {
  @ApiProperty({ example: 'Kossi Mensah' })
  @Trim()
  @IsString()
  @Length(2, 80, { message: 'Le nom doit contenir entre 2 et 80 caractères.' })
  name: string;

  @ApiPropertyOptional({ example: 'kossi@example.com' })
  @Trim()
  @IsOptional()
  @IsEmail({}, { message: 'Adresse e-mail invalide.' })
  @MaxLength(160)
  email?: string;

  @ApiPropertyOptional({ example: '+228 90 12 34 56' })
  @Trim()
  @IsOptional()
  @IsPhone()
  phone?: string;

  @ApiProperty({ minLength: 8 })
  @IsStrongPassword()
  password: string;
}

export class LoginDto {
  @ApiProperty({ description: 'Adresse e-mail ou numéro de téléphone' })
  @Trim()
  @IsString()
  @Length(3, 160)
  identifier: string;

  @ApiProperty()
  @IsString()
  @Length(1, 128)
  password: string;
}

export class ForgotPasswordDto {
  @ApiProperty()
  @Trim()
  @IsEmail({}, { message: 'Adresse e-mail invalide.' })
  email: string;
}

export class ResetPasswordDto {
  @ApiProperty()
  @IsString()
  @Length(20, 100)
  token: string;

  @ApiProperty()
  @IsStrongPassword()
  password: string;
}

export class ChangePasswordDto {
  @ApiProperty()
  @IsString()
  @Length(1, 128)
  currentPassword: string;

  @ApiProperty()
  @IsStrongPassword()
  newPassword: string;
}

export class UpdateProfileDto {
  @ApiPropertyOptional()
  @Trim()
  @IsOptional()
  @IsString()
  @Length(2, 80)
  name?: string;

  @ApiPropertyOptional()
  @Trim()
  @IsOptional()
  @IsEmail({}, { message: 'Adresse e-mail invalide.' })
  email?: string;

  @ApiPropertyOptional()
  @Trim()
  @IsOptional()
  @IsPhone()
  phone?: string;
}
