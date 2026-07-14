/**
 * CREO Icon Generator
 * Generates properly sized PWA icons from the 2000x2000 source logo.
 *
 * Usage: node generate-icons.js
 * Requires: npm install sharp (or run: npx sharp-cli)
 *
 * If sharp is not available, use any image editor to resize
 * assets/logo-icon.png to:
 *   - assets/icon-192.png (192x192)
 *   - assets/icon-192-maskable.png (192x192 with 20% padding)
 *   - assets/icon-512.png (512x512)
 *   - assets/icon-512-maskable.png (512x512 with 20% padding)
 */

const fs = require('fs');
const path = require('path');

async function generateIcons() {
  let sharp;
  try {
    sharp = require('sharp');
  } catch {
    console.log('sharp not found. Installing...');
    require('child_process').execSync('npm install sharp', { stdio: 'inherit' });
    sharp = require('sharp');
  }

  const src = path.join(__dirname, 'assets', 'logo-icon.png');
  if (!fs.existsSync(src)) {
    console.error('Source logo not found at assets/logo-icon.png');
    process.exit(1);
  }

  const sizes = [192, 512];

  for (const size of sizes) {
    // Regular icon (any)
    await sharp(src)
      .resize(size, size, { fit: 'contain', background: { r: 26, g: 10, b: 62, alpha: 1 } })
      .png()
      .toFile(path.join(__dirname, 'assets', `icon-${size}.png`));
    console.log(`Created assets/icon-${size}.png`);

    // Maskable icon (20% safe zone padding)
    const innerSize = Math.round(size * 0.8);
    const padding = Math.round(size * 0.1);
    const inner = await sharp(src)
      .resize(innerSize, innerSize, { fit: 'contain', background: { r: 26, g: 10, b: 62, alpha: 1 } })
      .png()
      .toBuffer();

    await sharp({
      create: { width: size, height: size, channels: 4, background: { r: 26, g: 10, b: 62, alpha: 1 } }
    })
      .composite([{ input: inner, left: padding, top: padding }])
      .png()
      .toFile(path.join(__dirname, 'assets', `icon-${size}-maskable.png`));
    console.log(`Created assets/icon-${size}-maskable.png`);
  }

  console.log('\nAll icons generated! Ready for PWA manifest.');
}

generateIcons().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
