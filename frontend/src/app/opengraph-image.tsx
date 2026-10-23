import { ImageResponse } from 'next/og';
import { brand } from '@/config/brand';

export const alt = brand.name;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OgImage() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: 80, background: '#0b583f', color: 'white' }}>
        <div style={{ fontSize: 76, fontWeight: 800 }}>{brand.name}</div>
        <div style={{ fontSize: 38, marginTop: 20, color: '#d6ece0', maxWidth: 900 }}>{brand.tagline}</div>
      </div>
    ),
    size,
  );
}
