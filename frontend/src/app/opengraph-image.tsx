import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';
import { brand } from '@/config/brand';

export const alt = brand.name;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/** Image de partage (WhatsApp, Facebook…) : logotype bonplan pour fond noir et accroche. */
export default async function OgImage() {
  const svg = await readFile(join(process.cwd(), 'public/brand/logo-inverse.svg'));
  const logo = `data:image/svg+xml;base64,${svg.toString('base64')}`;
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: 96, background: '#0A0B0D', color: '#F5F7FA' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logo} width={460} height={120} alt="" />
        <div style={{ fontSize: 44, marginTop: 44, color: '#a1a1a6', maxWidth: 940, lineHeight: 1.25 }}>{brand.tagline}</div>
      </div>
    ),
    size,
  );
}
