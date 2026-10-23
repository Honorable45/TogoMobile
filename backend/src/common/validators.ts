import { Transform } from 'class-transformer';
import { registerDecorator, ValidationOptions } from 'class-validator';
import { isValidPhone } from './phone';

/** Supprime les espaces en début et fin ; une chaîne vide devient undefined. */
export const Trim = () =>
  Transform(({ value }) => {
    if (typeof value !== 'string') return value;
    const t = value.trim();
    return t === '' ? undefined : t;
  });

/** Comme Trim, mais une chaîne vide devient null (permet d'effacer un champ facultatif). */
export const TrimOrNull = () =>
  Transform(({ value }) => {
    if (typeof value !== 'string') return value;
    const t = value.trim();
    return t === '' ? null : t;
  });

export function IsPhone(options?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isPhone',
      target: object.constructor,
      propertyName,
      options: { message: 'Numéro de téléphone invalide (ex. +228 90 12 34 56).', ...options },
      validator: { validate: (v: unknown) => typeof v === 'string' && isValidPhone(v) },
    });
  };
}

const STRONG = /^(?=.*[A-Za-z])(?=.*\d).{8,128}$/;
export function IsStrongPassword(options?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isStrongPasswordTM',
      target: object.constructor,
      propertyName,
      options: {
        message: 'Le mot de passe doit contenir au moins 8 caractères, dont une lettre et un chiffre.',
        ...options,
      },
      validator: { validate: (v: unknown) => typeof v === 'string' && STRONG.test(v) },
    });
  };
}
