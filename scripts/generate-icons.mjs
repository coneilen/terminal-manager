import sharp from 'sharp';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const resourcesDir = join(__dirname, '..', 'resources');

async function generateIcons() {
  const svgPath = join(resourcesDir, 'icon.svg');
  const svgBuffer = readFileSync(svgPath);

  // Generate PNG at different sizes
  const sizes = [16, 32, 64, 128, 256, 512, 1024];

  for (const size of sizes) {
    const outputPath = join(resourcesDir, `icon-${size}.png`);
    await sharp(svgBuffer)
      .resize(size, size)
      .png()
      .toFile(outputPath);
    console.log(`Generated ${outputPath}`);
  }

  // Generate main icon.png (512x512 for electron-builder)
  const iconPngPath = join(resourcesDir, 'icon.png');
  await sharp(svgBuffer)
    .resize(512, 512)
    .png()
    .toFile(iconPngPath);
  console.log(`Generated ${iconPngPath}`);

  console.log('Icons generated successfully!');
  console.log('Note: For .icns (macOS) and .ico (Windows), use electron-builder or online converters');
}

generateIcons().catch(console.error);
