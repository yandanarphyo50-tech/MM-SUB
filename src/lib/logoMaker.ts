import type { TextLogoStyleId } from './studioTypes';

/**
 * Normalizes any uploaded image (PNG, JPG, WebP, SVG, mobile gallery photos)
 * into a crisp max-720px transparent RGBA PNG with an ASCII filename
 * so FFmpeg overlay always succeeds cleanly.
 */
export async function prepareLogoFileForUpload(file: File): Promise<File> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () =>
        reject(new Error('Logo ပုံဖိုင်ကို ဖတ်၍မရပါ။ PNG သို့မဟုတ် JPG ပုံအဖြစ် ရွေးချယ်ပေးပါ။'));
      el.src = objectUrl;
    });

    const naturalW = img.naturalWidth || 512;
    const naturalH = img.naturalHeight || 512;
    const maxDim = 720;
    const scale = Math.min(1, maxDim / Math.max(naturalW, naturalH));
    const targetW = Math.max(32, Math.round(naturalW * scale));
    const targetH = Math.max(32, Math.round(naturalH * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Canvas context unavailable.');
    }
    ctx.clearRect(0, 0, targetW, targetH);
    ctx.drawImage(img, 0, 0, targetW, targetH);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((b) => {
        if (b) resolve(b);
        else reject(new Error('Logo PNG ပြောင်းလဲရာတွင် အမှားဖြစ်ပွားပါသည်။'));
      }, 'image/png');
    });

    const asciiStem =
      file.name
        .replace(/\.[^.]+$/, '')
        .replace(/[^\x20-\x7E]/g, '')
        .replace(/[^a-zA-Z0-9_-]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 32) || 'custom_logo';

    return new File([blob], `${asciiStem}.png`, { type: 'image/png' });
  } catch (err) {
    // Only fallback to raw file if it's already a small standard PNG/JPG
    const isSafeRaw =
      ['image/png', 'image/jpeg'].includes(file.type) && file.size <= 4 * 1024 * 1024;
    if (isSafeRaw) {
      return file;
    }
    throw err;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

export async function generateTextLogoPng(
  rawText: string,
  styleId: TextLogoStyleId,
  fontFamily = 'Noto Sans Myanmar'
): Promise<File> {
  const text = rawText.trim();
  if (!text) {
    throw new Error('Logo စာသား အရင်ထည့်ပေးပါ။');
  }

  const safeFamily = fontFamily.replace(/["\\]/g, '').trim() || 'Noto Sans Myanmar';
  const fontSize = 54;
  const fontSpec = `700 ${fontSize}px "${safeFamily}", "Plus Jakarta Sans", "Noto Sans Myanmar", sans-serif`;

  if (typeof document !== 'undefined' && document.fonts) {
    try {
      await document.fonts.load(fontSpec, text);
    } catch {
      // Ignore individual font load error
    }
    if (document.fonts.ready) {
      await document.fonts.ready;
    }
  }

  const measureCanvas = document.createElement('canvas');
  const measureCtx = measureCanvas.getContext('2d');
  if (!measureCtx) {
    throw new Error('Canvas unavailable.');
  }
  measureCtx.font = fontSpec;
  const metrics = measureCtx.measureText(text);

  const padX = styleId === 'minimal_white' ? 24 : 44;
  const padY = styleId === 'minimal_white' ? 20 : 28;
  const width = Math.min(1200, Math.max(220, Math.ceil(metrics.width + padX * 2)));
  const height = Math.ceil(fontSize * 1.4 + padY * 2);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas unavailable.');
  }

  ctx.clearRect(0, 0, width, height);

  if (styleId === 'dark_glass') {
    drawRoundedRect(ctx, 4, 4, width - 8, height - 8, 22);
    ctx.fillStyle = 'rgba(9, 11, 14, 0.78)';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.stroke();
  } else if (styleId === 'amber_gold') {
    drawRoundedRect(ctx, 4, 4, width - 8, height - 8, 22);
    const grad = ctx.createLinearGradient(0, 0, width, height);
    grad.addColorStop(0, '#f59e0b');
    grad.addColorStop(1, '#d97706');
    ctx.fillStyle = grad;
    ctx.fill();
  } else if (styleId === 'outline_badge') {
    drawRoundedRect(ctx, 6, 6, width - 12, height - 12, 18);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#fbbf24';
    ctx.stroke();
  }

  ctx.font = fontSpec;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  if (styleId === 'minimal_white') {
    ctx.shadowColor = 'rgba(0, 0, 0, 0.88)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 3;
    ctx.fillStyle = '#ffffff';
  } else if (styleId === 'amber_gold') {
    ctx.fillStyle = '#090b0e';
  } else {
    ctx.fillStyle = '#fafafa';
  }

  ctx.fillText(text, width / 2, height / 2 + 2, width - padX);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => {
      if (b) resolve(b);
      else reject(new Error('Logo ဖန်တီးရာတွင် အမှားဖြစ်ပွားပါသည်။'));
    }, 'image/png');
  });

  const safeSlug =
    text
      .replace(/[^a-zA-Z0-9_-]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 32) || 'channel_logo';

  return new File([blob], `${safeSlug}.png`, { type: 'image/png' });
}
