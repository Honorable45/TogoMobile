'use client';

/**
 * Vérifications des formulaires dans le navigateur, avant l'envoi au serveur.
 *
 * Pourquoi : la personne voit tout de suite ce qui ne va pas, champ par champ, sans attendre la réponse
 * du serveur. Le serveur refait toujours les mêmes vérifications : celles-ci sont un confort, pas une sécurité.
 * Les règles et les messages sont les mêmes que côté serveur (backend-django/core/validation.py).
 *
 * Utilisation dans un formulaire :
 *   const form = useFormCheck({ name: [rules.length(2, 80, 'Le nom…')], email: [rules.email()] });
 *   <form onSubmit={(e) => { e.preventDefault(); if (!form.check(e.currentTarget)) return; … }} onChange={form.onChange}>
 *   <Field error={form.errors.name}>…</Field>
 */
import { useCallback, useState, type FormEvent } from 'react';

/** Une règle reçoit la valeur du champ (et tout le formulaire) ; elle renvoie un message si c'est faux. */
export type Rule = (value: string, form: FormData) => string | undefined;
/** Règles de chaque champ, par nom de champ (attribut name). */
export type Schema = Record<string, Rule[]>;

export const MESSAGES = {
  password: 'Le mot de passe doit contenir au moins 8 caractères, dont une lettre et un chiffre.',
  phone: 'Numéro de téléphone invalide (ex. +228 90 12 34 56).',
  email: 'Adresse e-mail invalide.',
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const STRONG = /^(?=.*[A-Za-z])(?=.*\d).{8,128}$/s;
const TOGO = '228';

/**
 * Numéro valide ? Même règle que le serveur (core/phone.py) :
 * 8 chiffres = numéro togolais ; sinon indicatif international (+…, 00…), 8 à 15 chiffres.
 */
export function isPhone(value: string) {
  let digits = value.trim().replace(/[^\d+]/g, '');
  if (!digits) return false;
  if (digits.startsWith('00')) digits = `+${digits.slice(2)}`;
  let international: string;
  if (digits.startsWith('+')) international = digits.slice(1).replace(/\D/g, '');
  else {
    const local = digits.replace(/\D/g, '');
    if (local.length === 8) international = TOGO + local;
    else if (local.startsWith(TOGO) && local.length === 11) international = local;
    else return false;
  }
  if (international.length < 8 || international.length > 15 || international.startsWith('0')) return false;
  return !(international.startsWith(TOGO) && international.length !== 11);
}

/** Règles prêtes à l'emploi. Un champ vide n'est contrôlé que par `required` (les autres le laissent passer). */
export const rules = {
  required: (msg = 'Ce champ est obligatoire.'): Rule => (v) => (v.trim() ? undefined : msg),
  length: (min: number, max: number, msg?: string): Rule => (v) => {
    const n = v.trim().length;
    if (!n && min === 0) return undefined;
    return n < min || n > max ? (msg ?? `Entre ${min} et ${max} caractères.`) : undefined;
  },
  max: (max: number, msg?: string): Rule => (v) => (v.trim().length > max ? (msg ?? `${max} caractères au maximum.`) : undefined),
  email: (): Rule => (v) => (v.trim() && (!EMAIL.test(v.trim()) || v.trim().length > 160) ? MESSAGES.email : undefined),
  phone: (): Rule => (v) => (v.trim() && !isPhone(v) ? MESSAGES.phone : undefined),
  /** Un seul champ « e-mail ou téléphone » : l'arobase fait la différence. */
  emailOrPhone: (): Rule => (v) => {
    const t = v.trim();
    if (!t) return 'Indiquez votre e-mail ou votre numéro de téléphone.';
    return t.includes('@') ? rules.email()(t, new FormData()) : rules.phone()(t, new FormData());
  },
  password: (): Rule => (v) => (STRONG.test(v) ? undefined : MESSAGES.password),
  /** Doit être identique à un autre champ (confirmation du mot de passe). */
  sameAs: (field: string, msg: string): Rule => (v, form) => (v === String(form.get(field) ?? '') ? undefined : msg),
  /** Case à cocher obligatoire (conditions d'utilisation…). */
  checked: (msg: string): Rule => (v) => (v ? undefined : msg),
  /** Nombre entier entre min et max (prix, quantité…). */
  integer: (min: number, max: number, msg: string): Rule => (v) => {
    if (!v.trim()) return undefined;
    const n = Number(v.replace(/\s/g, ''));
    return Number.isInteger(n) && n >= min && n <= max ? undefined : msg;
  },
  /** Adresse web (https://…). */
  url: (msg = 'Adresse web invalide (elle doit commencer par https://).'): Rule => (v) => {
    if (!v.trim()) return undefined;
    try {
      const u = new URL(v.trim());
      return u.protocol === 'https:' || u.protocol === 'http:' ? undefined : msg;
    } catch {
      return msg;
    }
  },
};

/** Vérifie tout le formulaire : renvoie les erreurs, par nom de champ (vide = tout est bon). */
export function validate(formEl: HTMLFormElement, schema: Schema) {
  const data = new FormData(formEl);
  const errors: Record<string, string> = {};
  for (const [name, list] of Object.entries(schema)) {
    const value = String(data.get(name) ?? '');
    for (const rule of list) {
      const msg = rule(value, data);
      if (msg) {
        errors[name] = msg;
        break;
      }
    }
  }
  return errors;
}

/**
 * Gestion des erreurs d'un formulaire :
 * - check(form) : vérifie avant l'envoi, affiche les erreurs et place le curseur sur le premier champ faux ;
 * - onChange : dès qu'un champ en erreur est corrigé, son message disparaît (sans attendre l'envoi) ;
 * - setErrors : pour afficher aussi les erreurs renvoyées par le serveur.
 */
export function useFormCheck(schema: Schema) {
  const [errors, setErrors] = useState<Record<string, string>>({});

  const check = useCallback(
    (formEl: HTMLFormElement) => {
      const found = validate(formEl, schema);
      setErrors(found);
      const first = Object.keys(found)[0];
      if (first) (formEl.elements.namedItem(first) as HTMLElement | null)?.focus?.();
      return !first;
    },
    [schema],
  );

  const onChange = useCallback(
    (e: FormEvent<HTMLFormElement>) => {
      const name = (e.target as HTMLInputElement).name;
      const formEl = e.currentTarget; // à lire tout de suite : React le vide après l'événement
      setErrors((current) => {
        // On ne revérifie que les champs déjà signalés : pas de message rouge pendant la première saisie.
        if (!Object.keys(current).length) return current;
        const now = validate(formEl, schema);
        const next: Record<string, string> = {};
        for (const [k, msg] of Object.entries(current)) {
          if (k in schema) {
            if (now[k]) next[k] = now[k]; // règle du navigateur : message à jour, ou disparu si corrigé
          } else if (k !== name) {
            next[k] = msg; // erreur venue du serveur : elle disparaît quand on modifie ce champ
          }
        }
        return next;
      });
    },
    [schema],
  );

  return { errors, setErrors, check, onChange };
}
