/**
 * Font Loader & Offline Resilience Engine for Vazirmatn
 *
 * Rules:
 * 1. Pre-registers core Vazirmatn weights locally from /webfonts (WOFF2) with fallback to /fonts (TTF).
 * 2. Avoids external CDN calls so Windows 7/11 offline installations render identically without install errors.
 */

export async function initVazirmatnFonts(): Promise<{ source: 'webfonts' | 'fonts' | 'system' }> {
  if (typeof document === 'undefined' || !document.fonts) {
    return { source: 'system' };
  }

  try {
    if (document.fonts.check('16px Vazirmatn') && document.fonts.check('700 16px Vazirmatn')) {
      return { source: 'webfonts' };
    }

    const weights: Array<{ weight: string; woff2: string; ttf?: string }> = [
      { weight: '400', woff2: '/webfonts/Vazirmatn-Regular.woff2', ttf: '/fonts/Vazirmatn-Light.ttf' },
      { weight: '700', woff2: '/webfonts/Vazirmatn-Bold.woff2', ttf: '/fonts/Vazirmatn-ExtraBold.ttf' }
    ];

    await Promise.all(
      weights.map(async (item) => {
        try {
          const src = item.ttf
            ? `url(${item.woff2}) format("woff2"), url(${item.ttf}) format("truetype")`
            : `url(${item.woff2}) format("woff2")`;
          const face = new FontFace('Vazirmatn', src, {
            weight: item.weight,
            style: 'normal',
            display: 'swap'
          });
          const loaded = await face.load();
          document.fonts.add(loaded);
        } catch {
          // Graceful fallback handled by CSS @font-face
        }
      })
    );

    return { source: 'webfonts' };
  } catch (err) {
    console.warn('[FontLoader] Fallback to system font stack:', err);
    return { source: 'system' };
  }
}
