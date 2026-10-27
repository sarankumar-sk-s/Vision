import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.resolve(__dirname, '../public');

if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

// Crisp SVG of the "V" Logo for VisionMate
const createSvg = (size, isMaskable = false) => {
  const _padding = isMaskable ? size * 0.15 : 0;
  const viewBoxSize = 512;

  return `
  <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${viewBoxSize} ${viewBoxSize}">
    <defs>
      <linearGradient id="vGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#38BDF8" />
        <stop offset="50%" stop-color="#2563EB" />
        <stop offset="100%" stop-color="#1D4ED8" />
      </linearGradient>
      <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#0F172A" />
        <stop offset="100%" stop-color="#070A11" />
      </linearGradient>
      <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="8" result="blur" />
        <feComposite in="SourceGraphic" in2="blur" operator="over" />
      </filter>
    </defs>

    <!-- Background -->
    <rect width="${viewBoxSize}" height="${viewBoxSize}" rx="${isMaskable ? 0 : 96}" fill="url(#bgGrad)" />

    <!-- Vision Aperture Orbit -->
    <circle cx="256" cy="230" r="140" fill="none" stroke="#1E293B" stroke-width="8" stroke-dasharray="12 12" />

    <!-- Geometric "V" Monogram -->
    <path 
      d="M 124 136 L 256 392 L 388 136" 
      fill="none" 
      stroke="url(#vGrad)" 
      stroke-width="52" 
      stroke-linecap="round" 
      stroke-linejoin="round"
      filter="url(#glow)"
    />

    <!-- Vision Core Eye Node -->
    <circle cx="256" cy="230" r="24" fill="#38BDF8" />
    <circle cx="256" cy="230" r="10" fill="#FFFFFF" />
  </svg>`;
};

async function generate() {
  const svg512 = createSvg(512, false);
  const svgMaskable = createSvg(512, true);

  // Write SVG favicon
  fs.writeFileSync(path.join(publicDir, 'favicon.svg'), svg512);

  // Generate PNG icons
  await sharp(Buffer.from(svg512))
    .resize(192, 192)
    .png()
    .toFile(path.join(publicDir, 'icon-192.png'));

  await sharp(Buffer.from(svg512))
    .resize(512, 512)
    .png()
    .toFile(path.join(publicDir, 'icon-512.png'));

  await sharp(Buffer.from(svgMaskable))
    .resize(512, 512)
    .png()
    .toFile(path.join(publicDir, 'icon-maskable.png'));

  await sharp(Buffer.from(svg512))
    .resize(180, 180)
    .png()
    .toFile(path.join(publicDir, 'apple-touch-icon.png'));

  console.log('PWA icons generated successfully in /public');
}

generate().catch(console.error);
