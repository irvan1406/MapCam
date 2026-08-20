import { drawMiniMap } from '../services/map-service.js';
import { loadImageSource } from '../services/image-service.js';
import { formatCoordinate } from '../utils/geo.js';
import { formatDate, formatTime } from '../utils/date.js';

const FONT_STACK = 'Inter, ui-sans-serif, system-ui, -apple-system, sans-serif';

export async function renderProject(project, canvas, options = {}) {
  const source = options.source ?? await loadImageSource(project.sourceBlob);
  const target = options.targetSize ?? { width: source.width, height: source.height };
  canvas.width = target.width;
  canvas.height = target.height;
  const context = canvas.getContext('2d', { alpha: false, desynchronized: Boolean(options.preview) });
  if (!context) throw new Error('Canvas tidak tersedia pada perangkat ini.');
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = options.preview ? 'medium' : 'high';
  context.fillStyle = '#020617';
  context.fillRect(0, 0, target.width, target.height);
  context.drawImage(source.image, 0, 0, target.width, target.height);

  if (options.originalOnly) {
    if (!options.source) URL.revokeObjectURL(source.url);
    return { width: target.width, height: target.height, stampBounds: null };
  }

  const stampBounds = calculateStampBounds(project, target.width, target.height);
  await drawStamp(context, project, stampBounds, { preview: options.preview });
  await drawFloatingTexts(context, project, target.width, target.height);
  if (!options.source) URL.revokeObjectURL(source.url);
  return {
    width: target.width,
    height: target.height,
    stampBounds,
    stampBoundsNormalized: {
      x: stampBounds.x / target.width,
      y: stampBounds.y / target.height,
      width: stampBounds.width / target.width,
      height: stampBounds.height / target.height,
    },
  };
}

export function calculateStampBounds(project, canvasWidth, canvasHeight) {
  const overlay = project.overlay;
  const width = Math.max(canvasWidth * 0.34, Math.min(canvasWidth * 0.96, canvasWidth * overlay.width * overlay.scale));
  const isColumn = project.template.layout.direction === 'column';
  const contentLines = countContentLines(project);
  const estimatedRatio = isColumn ? 0.76 + contentLines * 0.045 : 0.31 + contentLines * 0.035;
  const height = Math.min(canvasHeight * 0.62, Math.max(canvasHeight * 0.13, width * estimatedRatio));
  const x = Math.min(canvasWidth - width, Math.max(0, canvasWidth * overlay.x));
  const y = Math.min(canvasHeight - height, Math.max(0, canvasHeight * overlay.y));
  return { x, y, width, height };
}

async function drawStamp(context, project, bounds, options) {
  const template = project.template;
  const panel = template.panel;
  const scaleBase = Math.max(0.58, bounds.width / 1050);
  const padding = Math.max(12, bounds.width * 0.032);
  const radius = Math.max(8, panel.radius * scaleBase);
  context.save();
  context.globalAlpha = project.overlay.opacity;
  context.fillStyle = hexWithAlpha(panel.background, panel.opacity);
  context.beginPath();
  context.roundRect(bounds.x, bounds.y, bounds.width, bounds.height, radius);
  context.fill();

  const layout = calculateInnerLayout(project, bounds, padding);
  if (template.fields.map) {
    await drawMiniMap(context, layout.map, project.displayData, {
      zoom: project.map.zoom,
      providerId: project.map.providerId,
      radius: radius * 0.72,
      preview: options.preview,
    });
  }
  drawTextContent(context, project, layout.text, scaleBase, panel);
  if (template.fields.logo && project.logoDataUrl) {
    await drawLogo(context, project.logoDataUrl, bounds.x + bounds.width - padding * 2.7, bounds.y + padding, padding * 1.8);
  }
  context.restore();
}

function calculateInnerLayout(project, bounds, padding) {
  const hasMap = project.template.fields.map;
  if (!hasMap) return {
    map: null,
    text: { x: bounds.x + padding, y: bounds.y + padding, width: bounds.width - padding * 2, height: bounds.height - padding * 2 },
  };
  const layout = project.template.layout;
  const mapRatio = Math.min(0.58, Math.max(0.22, layout.mapRatio * project.overlay.mapScale));
  if (layout.direction === 'column') {
    const mapHeight = Math.min(bounds.height * 0.58, bounds.height * mapRatio);
    return {
      map: { x: bounds.x + padding, y: bounds.y + padding, width: bounds.width - padding * 2, height: mapHeight - padding * 0.5 },
      text: { x: bounds.x + padding, y: bounds.y + mapHeight + padding, width: bounds.width - padding * 2, height: bounds.height - mapHeight - padding * 2 },
    };
  }
  const mapWidth = bounds.width * mapRatio;
  const mapOnRight = layout.mapPosition === 'right';
  return {
    map: {
      x: mapOnRight ? bounds.x + bounds.width - mapWidth - padding : bounds.x + padding,
      y: bounds.y + padding,
      width: mapWidth,
      height: bounds.height - padding * 2,
    },
    text: {
      x: mapOnRight ? bounds.x + padding : bounds.x + mapWidth + padding * 1.6,
      y: bounds.y + padding,
      width: bounds.width - mapWidth - padding * 2.6,
      height: bounds.height - padding * 2,
    },
  };
}

function drawTextContent(context, project, bounds, scaleBase, panel) {
  const fields = project.template.fields;
  const metadata = project.displayData;
  const scale = scaleBase * project.overlay.textScale;
  const baseSize = Math.max(11, 25 * scale);
  const smallSize = Math.max(9, 18 * scale);
  const titleSize = Math.max(12, 31 * scale);
  const lineGap = Math.max(4, 7 * scale);
  let cursorY = bounds.y;
  const align = project.overlay.alignment || project.template.layout.textAlign || 'left';
  const textX = align === 'center' ? bounds.x + bounds.width / 2 : align === 'right' ? bounds.x + bounds.width : bounds.x;

  context.textBaseline = 'top';
  context.textAlign = align;
  context.fillStyle = panel.foreground;

  if (fields.activity && project.activityName) {
    context.font = `700 ${titleSize}px ${FONT_STACK}`;
    cursorY += drawWrappedText(context, project.activityName, textX, cursorY, bounds.width, titleSize * 1.16, 2, align);
    cursorY += lineGap;
  }

  if (fields.address) {
    const addressLines = metadata.addressLines?.length ? metadata.addressLines : splitAddress(metadata.address);
    if (addressLines.length) {
      context.font = `700 ${titleSize}px ${FONT_STACK}`;
      cursorY += drawWrappedText(context, addressLines[0], textX, cursorY, bounds.width, titleSize * 1.15, 2, align);
      if (addressLines.slice(1).join(', ')) {
        context.font = `500 ${baseSize}px ${FONT_STACK}`;
        cursorY += drawWrappedText(context, addressLines.slice(1).join(', '), textX, cursorY, bounds.width, baseSize * 1.2, 2, align);
      }
      cursorY += lineGap;
    } else {
      context.font = `600 ${baseSize}px ${FONT_STACK}`;
      context.fillStyle = hexWithAlpha(panel.foreground, 0.72);
      cursorY += drawWrappedText(context, 'Alamat belum tersedia', textX, cursorY, bounds.width, baseSize * 1.2, 1, align);
      context.fillStyle = panel.foreground;
      cursorY += lineGap;
    }
  }

  const coordinateParts = [];
  if (fields.latitude) coordinateParts.push(`Lat ${formatCoordinate(metadata.latitude, project.coordinateFormat)}`);
  if (fields.longitude) coordinateParts.push(`Long ${formatCoordinate(metadata.longitude, project.coordinateFormat)}`);
  if (coordinateParts.length) {
    context.fillStyle = panel.accent;
    context.font = `700 ${smallSize}px ui-monospace, SFMono-Regular, monospace`;
    cursorY += drawWrappedText(context, coordinateParts.join('  •  '), textX, cursorY, bounds.width, smallSize * 1.25, 2, align);
    cursorY += lineGap;
  }

  if (metadata.dateTime && (fields.date || fields.time)) {
    const datePart = fields.date ? formatDate(metadata.dateTime, project.dateFormat ?? 'long-id') : '';
    const timePart = fields.time ? formatTime(metadata.dateTime, project.timeFormat ?? '24-seconds', fields.timezone) : '';
    context.fillStyle = panel.foreground;
    context.font = `600 ${baseSize}px ${FONT_STACK}`;
    cursorY += drawWrappedText(context, [datePart, timePart].filter(Boolean).join('  •  '), textX, cursorY, bounds.width, baseSize * 1.22, 2, align);
    cursorY += lineGap;
  } else if (fields.date || fields.time) {
    context.fillStyle = hexWithAlpha(panel.foreground, 0.72);
    context.font = `600 ${smallSize}px ${FONT_STACK}`;
    cursorY += drawWrappedText(context, 'Tanggal dan jam belum dipilih', textX, cursorY, bounds.width, smallSize * 1.2, 1, align);
  }

  if (fields.compass && Number.isFinite(metadata.compass)) {
    context.fillStyle = panel.foreground;
    context.font = `600 ${smallSize}px ${FONT_STACK}`;
    cursorY += drawWrappedText(context, `Arah ${Math.round(metadata.compass)}°`, textX, cursorY, bounds.width, smallSize * 1.2, 1, align);
  }

  if (fields.note && project.note) {
    cursorY += lineGap;
    context.fillStyle = hexWithAlpha(panel.foreground, 0.88);
    context.font = `italic 500 ${smallSize}px ${FONT_STACK}`;
    drawWrappedText(context, project.note, textX, cursorY, bounds.width, smallSize * 1.22, 2, align);
  }
}

async function drawFloatingTexts(context, project, canvasWidth, canvasHeight) {
  for (const text of project.texts ?? []) {
    if (!text.value) continue;
    context.save();
    context.globalAlpha = text.opacity ?? 1;
    context.translate(text.x * canvasWidth, text.y * canvasHeight);
    context.rotate((text.rotation ?? 0) * Math.PI / 180);
    context.fillStyle = text.color ?? '#ffffff';
    const fontSize = Math.max(12, (text.fontSize ?? 32) * (canvasWidth / 1080));
    context.font = `${text.italic ? 'italic ' : ''}${text.bold ? '700' : '500'} ${fontSize}px ${FONT_STACK}`;
    context.textAlign = text.alignment ?? 'left';
    context.textBaseline = 'top';
    context.shadowColor = 'rgba(0,0,0,.55)';
    context.shadowBlur = Math.max(2, fontSize * 0.12);
    drawWrappedText(context, text.value, 0, 0, Math.min(canvasWidth * 0.8, (text.width ?? 0.7) * canvasWidth), fontSize * 1.22, 6, text.alignment ?? 'left');
    context.restore();
  }
}

function drawWrappedText(context, value, x, y, maxWidth, lineHeight, maxLines = 3, align = 'left') {
  const words = String(value).trim().split(/\s+/);
  if (!words[0]) return 0;
  const lines = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (context.measureText(candidate).width <= maxWidth || !line) line = candidate;
    else { lines.push(line); line = word; }
  }
  if (line) lines.push(line);
  const visible = lines.slice(0, maxLines);
  if (lines.length > maxLines) {
    let last = `${visible[maxLines - 1]}…`;
    while (context.measureText(last).width > maxWidth && last.length > 2) last = `${last.slice(0, -2)}…`;
    visible[maxLines - 1] = last;
  }
  for (let index = 0; index < visible.length; index += 1) context.fillText(visible[index], x, y + index * lineHeight, maxWidth);
  return visible.length * lineHeight;
}

async function drawLogo(context, dataUrl, x, y, size) {
  try {
    const image = new Image();
    image.src = dataUrl;
    await image.decode();
    context.drawImage(image, x, y, size, size);
  } catch { /* Invalid logos do not block photo export. */ }
}

function splitAddress(address = '') {
  const segments = address.split(',').map((part) => part.trim()).filter(Boolean);
  if (!segments.length) return [];
  return [segments.slice(0, 2).join(', '), segments.slice(2, 5).join(', ')].filter(Boolean);
}

function countContentLines(project) {
  const fields = project.template.fields;
  return Number(fields.address) * 2
    + Number(fields.latitude || fields.longitude)
    + Number(fields.date || fields.time)
    + Number(fields.activity && project.activityName)
    + Number(fields.note && project.note);
}

function hexWithAlpha(color, opacity) {
  if (!color?.startsWith('#')) return color;
  const normalized = color.slice(1);
  const hex = normalized.length === 3 ? normalized.split('').map((part) => part + part).join('') : normalized.slice(0, 6);
  const alpha = Math.round(Math.max(0, Math.min(1, opacity)) * 255).toString(16).padStart(2, '0');
  return `#${hex}${alpha}`;
}
