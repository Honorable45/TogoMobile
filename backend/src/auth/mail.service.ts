import { Injectable, Logger } from '@nestjs/common';
import { env } from '../config/env';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

/**
 * Envoi d'e-mails.
 * - console : développement uniquement (interdit en production, voir config/env.ts).
 * - resend : API HTTP Resend (https://resend.com), sans dépendance supplémentaire.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger('Mail');
  /** Dernier message envoyé avec le pilote console (utilisé par les tests). */
  lastMessage: MailMessage | null = null;

  async send(msg: MailMessage): Promise<void> {
    const { mail } = env();
    if (mail.driver === 'console') {
      this.lastMessage = msg;
      if (!env().isTest) this.logger.log(`[DEV] E-mail pour ${msg.to} — ${msg.subject}\n${msg.text}`);
      return;
    }
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${mail.resendApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: mail.from, to: [msg.to], subject: msg.subject, text: msg.text }),
    });
    if (!res.ok) {
      this.logger.error(`Échec d'envoi d'e-mail (statut ${res.status})`);
      throw new Error("Échec d'envoi de l'e-mail");
    }
  }
}
