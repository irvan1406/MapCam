import { drawMiniMap } from '../services/map-service.js';
import { loadImageSource } from '../services/image-service.js';
import { formatCoordinate } from '../utils/geo.js';
import { formatDate, formatTime, parseDateTime } from '../utils/date.js';
import { createLocationQrValue, drawQrCode } from '../utils/qr-code.js';

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

  const stampBounds = hasVisibleStamp(project) ? calculateStampBounds(project, target.width, target.height) : null;
  if (stampBounds) await drawStamp(context, project, stampBounds, { preview: options.preview });
  await drawFloatingTexts(context, project, target.width, target.height);
  if (!options.source) URL.revokeObjectURL(source.url);
  return {
    width: target.width,
    height: target.height,
    stampBounds,
    stampBoundsNormalized: stampBounds ? {
      x: stampBounds.x / target.width,
      y: stampBounds.y / target.height,
      width: stampBounds.width / target.width,
      height: stampBounds.height / target.height,
    } : null,
  };
}

export function calculateStampBounds(project, canvasWidth, canvasHeight) {
  const overlay = project.overlay;
  const width = Math.max(canvasWidth * 0.34, Math.min(canvasWidth * 0.96, canvasWidth * overlay.width * overlay.scale));
  const isColumn = project.template.layout.direction === 'column';
  const variant = project.template.layout.variant ?? 'classic';
  const contentLines = countContentLines(project);
  const hasMap = project.template.fields.map;
  const variantRatio = { datetime: 0.26, qr: 0.30, report: 0.25, compass: 0.28, advanced: 0.25 }[variant];
  const rowRatio = variantRatio ?? Math.max(hasMap ? 0.24 : 0.13, Math.min(0.38, 0.115 + contentLines * 0.042));
  const estimatedRatio = isColumn ? 0.54 + Math.min(0.2, contentLines * 0.025) : rowRatio;
  const rowHeightLimit = canvasWidth > canvasHeight ? 0.28 : 0.34;
  const maximumHeight = canvasHeight * (isColumn ? 0.52 : rowHeightLimit);
  const height = Math.min(maximumHeight, Math.max(canvasHeight * 0.1, width * estimatedRatio));
  const margin = Math.max(8, Math.min(canvasWidth, canvasHeight) * 0.032);
  const anchored = anchoredPosition(overlay.anchor, canvasWidth, canvasHeight, width, height, margin);
  const x = anchored ? anchored.x : Math.min(canvasWidth - width, Math.max(0, canvasWidth * overlay.x));
  const y = anchored ? anchored.y : Math.min(canvasHeight - height, Math.max(0, canvasHeight * overlay.y));
  return { x, y, width, height };
}

function anchoredPosition(anchor, canvasWidth, canvasHeight, width, height, margin) {
  if (anchor === 'bottom-left') return { x: margin, y: canvasHeight - height - margin };
  if (anchor === 'bottom-right') return { x: canvasWidth - width - margin, y: canvasHeight - height - margin };
  if (anchor === 'top-left') return { x: margin, y: margin };
  if (anchor === 'top-right') return { x: canvasWidth - width - margin, y: margin };
  return null;
}

async function drawStamp(context, project, bounds, options) {
  const template = project.template;
  const panel = template.panel;
  const variant = template.layout.variant ?? 'classic';
  const scaleHeight = template.layout.direction === 'column' ? bounds.height / 600 : bounds.height / 320;
  const scaleBase = Math.max(0.58, Math.min(bounds.width / 1050, scaleHeight));
  const padding = Math.max(12, Math.min(bounds.width * 0.032, bounds.height * 0.11));
  const radius = Math.max(8, panel.radius * scaleBase);
  context.save();
  context.globalAlpha = project.overlay.opacity;
  context.fillStyle = hexWithAlpha(panel.background, panel.opacity);
  context.beginPath();
  context.roundRect(bounds.x, bounds.y, bounds.width, bounds.height, radius);
  context.fill();
  context.clip();

  if (variant === 'datetime') await drawDateTimeTemplate(context, project, bounds, padding, scaleBase, panel);
  else if (variant === 'qr') await drawQrTemplate(context, project, bounds, padding, scaleBase, panel, radius, options);
  else if (variant === 'report') await drawReportTemplate(context, project, bounds, padding, scaleBase, panel, radius, options);
  else if (variant === 'compass') await drawCompassTemplate(context, project, bounds, padding, scaleBase, panel, radius, options);
  else {
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
  }
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
  const mapWidth = Math.min(bounds.width * mapRatio, (bounds.height - padding * 2) * 1.15 * Math.max(0.75, project.overlay.mapScale));
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

async function drawDateTimeTemplate(context, project, bounds, padding, scaleBase, panel) {
  const metadata = project.displayData;
  const fields = project.template.fields;
  const inner = { x: bounds.x + padding, y: bounds.y + padding, width: bounds.width - padding * 2, height: bounds.height - padding * 2 };
  const headerHeight = Math.min(inner.height * 0.38, 118 * Math.max(0.62, scaleBase));
  const timeWidth = inner.width * 0.34;
  const dividerX = inner.x + timeWidth;
  context.save();
  context.textBaseline = 'top';
  context.fillStyle = panel.foreground;
  if (metadata.dateTime && fields.time) {
    const timeSize = Math.max(18, 54 * scaleBase * project.overlay.textScale);
    context.font = `750 ${timeSize}px ${FONT_STACK}`;
    context.fillText(formatTime(metadata.dateTime, project.timeFormat ?? '24-seconds', false), inner.x, inner.y, timeWidth - padding * 0.6);
  }
  if (metadata.dateTime && fields.date) {
    const date = parseDateTime(metadata.dateTime);
    const dateSize = Math.max(13, 29 * scaleBase * project.overlay.textScale);
    context.fillStyle = panel.accent;
    context.fillRect(dividerX, inner.y, Math.max(3, 5 * scaleBase), headerHeight * 0.9);
    context.fillStyle = panel.foreground;
    context.font = `750 ${dateSize}px ${FONT_STACK}`;
    const dateX = dividerX + padding * 0.65;
    context.fillText(formatDate(metadata.dateTime, project.dateFormat ?? 'long-id'), dateX, inner.y, inner.width - timeWidth - padding);
    context.font = `650 ${Math.max(11, 22 * scaleBase)}px ${FONT_STACK}`;
    context.fillText(new Intl.DateTimeFormat('id-ID', { weekday: 'long' }).format(date), dateX, inner.y + dateSize * 1.12, inner.width - timeWidth - padding);
  }
  context.restore();
  drawTextContent(context, project, {
    x: inner.x,
    y: inner.y + headerHeight,
    width: inner.width,
    height: inner.height - headerHeight,
  }, scaleBase * 0.9, panel, { hideDateTime: true });
}

async function drawQrTemplate(context, project, bounds, padding, scaleBase, panel, radius, options) {
  const innerHeight = bounds.height - padding * 2;
  const mapWidth = project.template.fields.map ? Math.min(bounds.width * 0.24, innerHeight * 1.06) : 0;
  const qrVisible = project.template.fields.qr;
  const qrSize = qrVisible ? Math.min(innerHeight, bounds.width * 0.24) : 0;
  const gap = padding * 0.65;
  const mapBounds = mapWidth ? { x: bounds.x + padding, y: bounds.y + padding, width: mapWidth, height: innerHeight } : null;
  const qrBounds = qrSize ? { x: bounds.x + bounds.width - padding - qrSize, y: bounds.y + padding, width: qrSize, height: innerHeight } : null;
  const textX = bounds.x + padding + (mapBounds ? mapWidth + gap : 0);
  const textRight = qrBounds ? qrBounds.x - gap : bounds.x + bounds.width - padding;
  if (mapBounds) {
    await drawMiniMap(context, mapBounds, project.displayData, {
      zoom: project.map.zoom, providerId: project.map.providerId, radius: radius * 0.65, preview: options.preview,
    });
  }
  drawTextContent(context, project, { x: textX, y: bounds.y + padding, width: Math.max(30, textRight - textX), height: innerHeight }, scaleBase * 0.95, panel);
  if (qrBounds) {
    const value = createLocationQrValue(project.displayData);
    if (value) drawQrCode(context, qrBounds, value);
    else drawQrPlaceholder(context, qrBounds, panel);
  }
}

async function drawReportTemplate(context, project, bounds, padding, scaleBase, panel, radius, options) {
  const innerHeight = bounds.height - padding * 2;
  const mapWidth = project.template.fields.map ? Math.min(bounds.width * 0.28, innerHeight * 1.08) : 0;
  const badgeHeight = Math.max(18, 31 * scaleBase);
  const mapBounds = mapWidth ? {
    x: bounds.x + padding,
    y: bounds.y + padding + badgeHeight + padding * 0.3,
    width: mapWidth,
    height: Math.max(24, innerHeight - badgeHeight - padding * 0.3),
  } : null;
  if (mapBounds) {
    const badgeText = project.activityName || project.template.layout.badgeText || 'Check In';
    context.fillStyle = panel.accent;
    context.beginPath();
    context.roundRect(bounds.x + padding, bounds.y + padding, mapWidth, badgeHeight, Math.max(4, radius * 0.35));
    context.fill();
    context.fillStyle = '#ffffff';
    context.font = `700 ${Math.max(9, 17 * scaleBase)}px ${FONT_STACK}`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(badgeText, bounds.x + padding + mapWidth / 2, bounds.y + padding + badgeHeight / 2, mapWidth - padding);
    await drawMiniMap(context, mapBounds, project.displayData, {
      zoom: project.map.zoom, providerId: project.map.providerId, radius: radius * 0.5, preview: options.preview,
    });
  }
  const textX = bounds.x + padding + (mapBounds ? mapWidth + padding * 0.65 : 0);
  drawTextContent(context, project, {
    x: textX,
    y: bounds.y + padding,
    width: bounds.x + bounds.width - padding - textX,
    height: innerHeight,
  }, scaleBase * 0.92, panel, { hideActivity: true });
}

async function drawCompassTemplate(context, project, bounds, padding, scaleBase, panel, radius, options) {
  const innerHeight = bounds.height - padding * 2;
  const compassWidth = project.template.fields.compass ? Math.min(bounds.width * 0.26, innerHeight * 0.9) : 0;
  const mapWidth = project.template.fields.map ? Math.min(bounds.width * 0.2, innerHeight * 0.72) : 0;
  const compassBounds = compassWidth ? { x: bounds.x + padding, y: bounds.y + padding, width: compassWidth, height: innerHeight } : null;
  if (compassBounds) drawCompass(context, compassBounds, project.displayData.compass, panel, scaleBase);
  const mapBounds = mapWidth ? {
    x: bounds.x + bounds.width - padding - mapWidth,
    y: bounds.y + padding,
    width: mapWidth,
    height: innerHeight,
  } : null;
  if (mapBounds) {
    await drawMiniMap(context, mapBounds, project.displayData, {
      zoom: project.map.zoom, providerId: project.map.providerId, radius: radius * 0.55, preview: options.preview,
    });
  }
  const textX = compassBounds ? compassBounds.x + compassBounds.width + padding * 0.7 : bounds.x + padding;
  const textRight = mapBounds ? mapBounds.x - padding * 0.7 : bounds.x + bounds.width - padding;
  drawTextContent(context, project, {
    x: textX,
    y: bounds.y + padding,
    width: Math.max(30, textRight - textX),
    height: innerHeight,
  }, scaleBase * 0.78, panel, { hideCompass: true });
}

function drawCompass(context, bounds, heading, panel, scaleBase) {
  const labelHeight = Math.max(18, 34 * scaleBase);
  const dialSize = Math.min(bounds.width, bounds.height - labelHeight);
  const centerX = bounds.x + bounds.width / 2;
  const centerY = bounds.y + dialSize / 2;
  const radius = dialSize * 0.38;
  context.save();
  context.strokeStyle = hexWithAlpha(panel.foreground, 0.55);
  context.lineWidth = Math.max(1, scaleBase * 1.5);
  context.beginPath();
  context.arc(centerX, centerY, radius, 0, Math.PI * 2);
  context.stroke();
  for (let degree = 0; degree < 360; degree += 15) {
    const angle = degree * Math.PI / 180 - Math.PI / 2;
    const longTick = degree % 90 === 0;
    const innerRadius = radius * (longTick ? 0.75 : 0.86);
    context.beginPath();
    context.moveTo(centerX + Math.cos(angle) * innerRadius, centerY + Math.sin(angle) * innerRadius);
    context.lineTo(centerX + Math.cos(angle) * radius, centerY + Math.sin(angle) * radius);
    context.stroke();
  }
  context.fillStyle = panel.foreground;
  context.font = `700 ${Math.max(8, 14 * scaleBase)}px ${FONT_STACK}`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  for (const [label, degree] of [['N', 0], ['E', 90], ['S', 180], ['W', 270]]) {
    const angle = degree * Math.PI / 180 - Math.PI / 2;
    context.fillText(label, centerX + Math.cos(angle) * radius * 0.58, centerY + Math.sin(angle) * radius * 0.58);
  }
  const safeHeading = Number.isFinite(heading) ? heading : 0;
  context.translate(centerX, centerY);
  context.rotate(safeHeading * Math.PI / 180);
  context.fillStyle = '#ef4444';
  context.beginPath();
  context.moveTo(0, -radius * 0.88);
  context.lineTo(-radius * 0.09, 0);
  context.lineTo(radius * 0.09, 0);
  context.closePath();
  context.fill();
  context.fillStyle = panel.foreground;
  context.beginPath();
  context.moveTo(0, radius * 0.72);
  context.lineTo(-radius * 0.07, 0);
  context.lineTo(radius * 0.07, 0);
  context.closePath();
  context.fill();
  context.restore();
  context.save();
  context.fillStyle = hexWithAlpha(panel.foreground, 0.16);
  context.beginPath();
  context.roundRect(bounds.x, bounds.y + bounds.height - labelHeight, bounds.width, labelHeight, Math.max(4, labelHeight * 0.22));
  context.fill();
  context.fillStyle = panel.foreground;
  context.font = `650 ${Math.max(8, 15 * scaleBase)}px ${FONT_STACK}`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(Number.isFinite(heading) ? `${Math.round(heading)}° ${bearingLabel(heading)}` : 'Kompas tidak tersedia', centerX, bounds.y + bounds.height - labelHeight / 2, bounds.width - 8);
  context.restore();
}

function drawQrPlaceholder(context, bounds, panel) {
  context.save();
  context.fillStyle = '#ffffff';
  context.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
  context.fillStyle = panel.background;
  context.font = `700 ${Math.max(8, bounds.width * 0.07)}px ${FONT_STACK}`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText('QR menunggu GPS', bounds.x + bounds.width / 2, bounds.y + bounds.height / 2, bounds.width * 0.82);
  context.restore();
}

function bearingLabel(value) {
  const labels = ['U', 'TL', 'T', 'TG', 'S', 'BD', 'B', 'BL'];
  return labels[Math.round((((Number(value) % 360) + 360) % 360) / 45) % 8];
}

function drawTextContent(context, project, bounds, scaleBase, panel, options = {}) {
  const fields = project.template.fields;
  const metadata = project.displayData;
  const scale = scaleBase * project.overlay.textScale;
  const baseSize = Math.max(11, 28 * scale);
  const smallSize = Math.max(9, 21 * scale);
  const titleSize = Math.max(12, 36 * scale);
  const lineGap = Math.max(4, 8 * scale);
  let cursorY = bounds.y;
  const align = project.overlay.alignment || project.template.layout.textAlign || 'left';
  const textX = align === 'center' ? bounds.x + bounds.width / 2 : align === 'right' ? bounds.x + bounds.width : bounds.x;

  context.textBaseline = 'top';
  context.textAlign = align;
  context.fillStyle = panel.foreground;

  if (fields.activity && project.activityName && !options.hideActivity) {
    context.font = `700 ${titleSize}px ${FONT_STACK}`;
    cursorY += drawWrappedText(context, project.activityName, textX, cursorY, bounds.width, titleSize * 1.16, 2, align);
    cursorY += lineGap;
  }

  if (fields.place) {
    const placeName = metadata.placeName || metadata.addressLines?.[1] || metadata.addressLines?.[0];
    if (placeName) {
      context.font = `700 ${titleSize}px ${FONT_STACK}`;
      const flag = countryFlag(metadata.countryCode);
      cursorY += drawWrappedText(context, `${placeName}${flag ? ` ${flag}` : ''}`, textX, cursorY, bounds.width, titleSize * 1.14, 2, align);
      cursorY += lineGap * 0.45;
    }
  }

  if (fields.address && metadata.address) {
    context.fillStyle = hexWithAlpha(panel.foreground, 0.9);
    context.font = `500 ${baseSize}px ${FONT_STACK}`;
    cursorY += drawWrappedText(context, metadata.address, textX, cursorY, bounds.width, baseSize * 1.18, 2, align);
    context.fillStyle = panel.foreground;
    cursorY += lineGap;
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

  const sensorParts = [];
  if (fields.accuracy && Number.isFinite(metadata.accuracy)) sensorParts.push(`Akurasi ±${Math.round(metadata.accuracy)} m`);
  if (fields.altitude && Number.isFinite(metadata.altitude)) sensorParts.push(`Alt ${Math.round(metadata.altitude)} m`);
  if (fields.speed && Number.isFinite(metadata.speed)) sensorParts.push(`${(metadata.speed * 3.6).toFixed(1)} km/j`);
  if (fields.compass && Number.isFinite(metadata.compass) && !options.hideCompass) sensorParts.push(`Arah ${Math.round(metadata.compass)}° ${bearingLabel(metadata.compass)}`);
  if (sensorParts.length) {
    context.fillStyle = hexWithAlpha(panel.foreground, 0.82);
    context.font = `500 ${smallSize}px ${FONT_STACK}`;
    cursorY += drawWrappedText(context, sensorParts.join('  •  '), textX, cursorY, bounds.width, smallSize * 1.22, 2, align);
    cursorY += lineGap;
  }

  if (metadata.dateTime && (fields.date || fields.time) && !options.hideDateTime) {
    const datePart = fields.date ? formatDate(metadata.dateTime, project.dateFormat ?? 'long-id') : '';
    const timePart = fields.time ? formatTime(metadata.dateTime, project.timeFormat ?? '24-seconds', fields.timezone, metadata.timeZone) : '';
    context.fillStyle = panel.foreground;
    context.font = `600 ${baseSize}px ${FONT_STACK}`;
    cursorY += drawWrappedText(context, [datePart, timePart].filter(Boolean).join('  •  '), textX, cursorY, bounds.width, baseSize * 1.22, 2, align);
    cursorY += lineGap;
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

function countContentLines(project) {
  const fields = project.template.fields;
  return Number(fields.place && Boolean(project.displayData.placeName || project.displayData.addressLines?.length))
    + Number(fields.address && Boolean(project.displayData.address)) * 2
    + Number(fields.latitude || fields.longitude)
    + Number((fields.accuracy && Number.isFinite(project.displayData.accuracy))
      || (fields.altitude && Number.isFinite(project.displayData.altitude))
      || (fields.speed && Number.isFinite(project.displayData.speed))
      || (fields.compass && Number.isFinite(project.displayData.compass)))
    + Number(fields.date || fields.time)
    + Number(fields.activity && project.activityName)
    + Number(fields.note && project.note);
}

function hasVisibleStamp(project) {
  const fields = project.template?.fields ?? {};
  return Object.values(fields).some(Boolean);
}

function countryFlag(countryCode) {
  const code = String(countryCode || '').toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return '';
  return String.fromCodePoint(...[...code].map((letter) => 127397 + letter.charCodeAt(0)));
}

function hexWithAlpha(color, opacity) {
  if (!color?.startsWith('#')) return color;
  const normalized = color.slice(1);
  const hex = normalized.length === 3 ? normalized.split('').map((part) => part + part).join('') : normalized.slice(0, 6);
  const alpha = Math.round(Math.max(0, Math.min(1, opacity)) * 255).toString(16).padStart(2, '0');
  return `#${hex}${alpha}`;
}
