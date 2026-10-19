import { ArrayMaxSize, Equals, IsArray, IsEmail, IsIn, IsOptional, IsString, Length, MaxLength, MinLength } from 'class-validator';
import { SELF_SIGNUP_ROLES } from '@fm/shared';

export class RegisterDto {
  @IsEmail()
  @MaxLength(254)
  email: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password: string;

  @IsString()
  @Length(2, 80)
  name: string;

  @IsIn(SELF_SIGNUP_ROLES)
  role: 'EMPLOYER' | 'FREELANCER';

  @IsIn(['ru', 'en'])
  locale: 'ru' | 'en';

  @IsOptional()
  @IsString()
  @Length(2, 2)
  country?: string;

  /** Keys of the legal documents the user ticked. Must cover SIGNUP_REQUIRED_DOCS. */
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(32, { each: true })
  acceptedDocs: string[];

  /** User confirms they are 18+ (legal capacity to enter the offer). */
  @Equals(true)
  confirmAdult: boolean;
}

export class ChangePasswordDto {
  @IsString()
  @MaxLength(128)
  currentPassword: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  newPassword: string;
}

export class ChangeEmailDto {
  @IsString()
  @MaxLength(128)
  currentPassword: string;

  @IsEmail()
  @MaxLength(254)
  newEmail: string;
}

export class LoginDto {
  @IsEmail()
  @MaxLength(254)
  email: string;

  @IsString()
  @MaxLength(128)
  password: string;
}
