import { Controller, HttpCode, Param, Put, Req } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { Public } from '../common/auth.decorators';
import { MediaService } from './media.service';

/**
 * Réception des envois directs avec le pilote de stockage local (développement, tests).
 * En production (S3/R2), le navigateur envoie directement au stockage objet et cette route répond 404.
 * L'envoi est autorisé par un jeton aléatoire à usage unique, délivré au vendeur propriétaire du produit.
 */
@ApiExcludeController()
@Controller('uploads')
export class UploadsController {
  constructor(private readonly media: MediaService) {}

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @HttpCode(200)
  @Put(':token')
  async receive(@Param('token') token: string, @Req() req: Request) {
    const length = req.headers['content-length'] ? Number(req.headers['content-length']) : undefined;
    await this.media.receiveLocal(token, req, req.headers['content-type'], length);
    return { received: true };
  }
}
