/**
 * PNG 아이콘 생성 스크립트 (외부 의존성 없음)
 * 포트/네트워크 테마의 앱 아이콘을 순수 Node.js로 생성
 */
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

// --- PNG 인코더 (최소 구현) ---
function createPng(width, height, pixels) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const ihdrChunk = makeChunk("IHDR", ihdr);

  // IDAT - raw pixel data with filter byte
  const rawData = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    rawData[y * (1 + width * 4)] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      const srcIdx = (y * width + x) * 4;
      const dstIdx = y * (1 + width * 4) + 1 + x * 4;
      rawData[dstIdx] = pixels[srcIdx];
      rawData[dstIdx + 1] = pixels[srcIdx + 1];
      rawData[dstIdx + 2] = pixels[srcIdx + 2];
      rawData[dstIdx + 3] = pixels[srcIdx + 3];
    }
  }
  const compressed = zlib.deflateSync(rawData);
  const idatChunk = makeChunk("IDAT", compressed);

  // IEND
  const iendChunk = makeChunk("IEND", Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function makeChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeB = Buffer.from(type, "ascii");
  const crcData = Buffer.concat([typeB, data]);

  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(crcData) >>> 0, 0);

  return Buffer.concat([len, typeB, data, crc]);
}

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return crc ^ 0xffffffff;
}

// --- 드로잉 헬퍼 ---
function createCanvas(size) {
  return new Uint8Array(size * size * 4);
}

function setPixel(pixels, size, x, y, r, g, b, a) {
  x = Math.round(x);
  y = Math.round(y);
  if (x < 0 || x >= size || y < 0 || y >= size) return;
  const idx = (y * size + x) * 4;
  // alpha blending
  const srcA = a / 255;
  const dstA = pixels[idx + 3] / 255;
  const outA = srcA + dstA * (1 - srcA);
  if (outA === 0) return;
  pixels[idx] = Math.round((r * srcA + pixels[idx] * dstA * (1 - srcA)) / outA);
  pixels[idx + 1] = Math.round((g * srcA + pixels[idx + 1] * dstA * (1 - srcA)) / outA);
  pixels[idx + 2] = Math.round((b * srcA + pixels[idx + 2] * dstA * (1 - srcA)) / outA);
  pixels[idx + 3] = Math.round(outA * 255);
}

function fillCircle(pixels, size, cx, cy, radius, r, g, b, a = 255) {
  const r2 = radius * radius;
  for (let y = Math.floor(cy - radius - 1); y <= Math.ceil(cy + radius + 1); y++) {
    for (let x = Math.floor(cx - radius - 1); x <= Math.ceil(cx + radius + 1); x++) {
      const dx = x - cx;
      const dy = y - cy;
      const dist2 = dx * dx + dy * dy;
      if (dist2 <= r2) {
        // 안티앨리어싱
        const edge = Math.sqrt(dist2) - radius;
        const aa = edge > -1 ? Math.max(0, Math.min(1, -edge)) : 1;
        setPixel(pixels, size, x, y, r, g, b, Math.round(a * aa));
      }
    }
  }
}

function strokeCircle(pixels, size, cx, cy, radius, thickness, r, g, b, a = 255) {
  const outerR2 = (radius + thickness / 2) ** 2;
  const innerR2 = (radius - thickness / 2) ** 2;
  for (let y = Math.floor(cy - radius - thickness); y <= Math.ceil(cy + radius + thickness); y++) {
    for (let x = Math.floor(cx - radius - thickness); x <= Math.ceil(cx + radius + thickness); x++) {
      const dx = x - cx;
      const dy = y - cy;
      const dist2 = dx * dx + dy * dy;
      if (dist2 <= outerR2 && dist2 >= innerR2) {
        const dist = Math.sqrt(dist2);
        const outerEdge = (radius + thickness / 2) - dist;
        const innerEdge = dist - (radius - thickness / 2);
        const aa = Math.min(1, outerEdge, innerEdge);
        if (aa > 0) setPixel(pixels, size, x, y, r, g, b, Math.round(a * aa));
      }
    }
  }
}

function fillRect(pixels, size, x, y, w, h, r, g, b, a = 255) {
  for (let py = Math.floor(y); py < Math.ceil(y + h); py++) {
    for (let px = Math.floor(x); px < Math.ceil(x + w); px++) {
      setPixel(pixels, size, px, py, r, g, b, a);
    }
  }
}

function fillRoundedRect(pixels, size, x, y, w, h, radius, r, g, b, a = 255) {
  // 꼭짓점 원
  const corners = [
    [x + radius, y + radius],
    [x + w - radius, y + radius],
    [x + radius, y + h - radius],
    [x + w - radius, y + h - radius],
  ];

  for (let py = Math.floor(y); py < Math.ceil(y + h); py++) {
    for (let px = Math.floor(x); px < Math.ceil(x + w); px++) {
      let inside = true;
      let aa = 1;

      // 코너 체크
      for (const [cx, cy] of corners) {
        const inCornerX = (px < x + radius && cx === corners[0][0]) || (px > x + w - radius && cx === corners[1][0]);
        const inCornerY = (py < y + radius && cy === corners[0][1]) || (py > y + h - radius && cy === corners[2][1]);
        if (inCornerX && inCornerY) {
          const dx = px - cx;
          const dy = py - cy;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist > radius) {
            inside = false;
          } else {
            aa = Math.min(aa, Math.max(0, radius - dist));
          }
        }
      }
      if (inside) setPixel(pixels, size, px, py, r, g, b, Math.round(a * Math.min(1, aa)));
    }
  }
}

function drawLine(pixels, size, x1, y1, x2, y2, thickness, r, g, b, a = 255) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  const steps = Math.ceil(len * 2);

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const cx = x1 + dx * t;
    const cy = y1 + dy * t;
    fillCircle(pixels, size, cx, cy, thickness / 2, r, g, b, a);
  }
}

// --- 아이콘 디자인 ---
function drawIcon(size) {
  const pixels = createCanvas(size);
  const s = size / 512; // 스케일 팩터
  const cx = size / 2;
  const cy = size / 2;

  // 배경 - 둥근 사각형 (macOS 스타일)
  const padding = 12 * s;
  const cornerR = 100 * s;

  // 그라데이션 배경 시뮬레이션 (위에서 아래로 어두워지는 효과)
  for (let y = 0; y < size; y++) {
    const t = y / size;
    const bgR = Math.round(20 + (10 - 20) * t);   // #14 → #0a
    const bgG = Math.round(20 + (22 - 20) * t);   // #14 → #16
    const bgB = Math.round(46 + (60 - 46) * t);   // #2e → #3c
    for (let x = 0; x < size; x++) {
      setPixel(pixels, size, x, y, bgR, bgG, bgB, 0); // 투명 배경 시작
    }
  }

  // 배경 둥근 사각형 (그라데이션)
  for (let py = Math.floor(padding); py < Math.ceil(size - padding); py++) {
    for (let px = Math.floor(padding); px < Math.ceil(size - padding); px++) {
      let inside = true;
      let aa = 1;
      const x = padding, y2 = padding, w = size - padding * 2, h = size - padding * 2;
      const radius = cornerR;

      const corners = [
        [x + radius, y2 + radius],
        [x + w - radius, y2 + radius],
        [x + radius, y2 + h - radius],
        [x + w - radius, y2 + h - radius],
      ];

      for (const [ccx, ccy] of corners) {
        const inCornerX = (px < x + radius && ccx === corners[0][0]) || (px > x + w - radius && ccx === corners[1][0]);
        const inCornerY = (py < y2 + radius && ccy === corners[0][1]) || (py > y2 + h - radius && ccy === corners[2][1]);
        if (inCornerX && inCornerY) {
          const ddx = px - ccx;
          const ddy = py - ccy;
          const dist = Math.sqrt(ddx * ddx + ddy * ddy);
          if (dist > radius) inside = false;
          else aa = Math.min(aa, Math.max(0, radius - dist));
        }
      }

      if (inside) {
        const t = (py - padding) / (size - padding * 2);
        const r = Math.round(18 + (12 - 18) * t);
        const g = Math.round(22 + (18 - 22) * t);
        const b = Math.round(52 + (68 - 52) * t);
        setPixel(pixels, size, px, py, r, g, b, Math.round(255 * Math.min(1, aa)));
      }
    }
  }

  // 중앙 원형 글로브 (네트워크 아이콘)
  const globeR = 120 * s;

  // 글로브 원 - 외곽선
  strokeCircle(pixels, size, cx, cy - 10 * s, globeR, 8 * s, 108, 99, 255); // #6c63ff

  // 가로선 (적도)
  drawLine(pixels, size, cx - globeR + 4 * s, cy - 10 * s, cx + globeR - 4 * s, cy - 10 * s, 6 * s, 108, 99, 255);

  // 세로 타원 (경도선)
  for (let angle = 0; angle < Math.PI; angle += 0.02) {
    const ex = Math.cos(angle) * globeR * 0.45;
    const ey = Math.sin(angle) * globeR;
    const px1 = cx + ex;
    const py1 = cy - 10 * s - ey;
    fillCircle(pixels, size, px1, py1, 2.5 * s, 108, 99, 255);
    const px2 = cx - ex;
    fillCircle(pixels, size, px2, py1, 2.5 * s, 108, 99, 255);
  }

  // 포트 노드들 (작은 원)
  const nodes = [
    { x: cx - 130 * s, y: cy + 120 * s, color: [46, 204, 113] },   // 초록 (개발)
    { x: cx + 130 * s, y: cy + 120 * s, color: [46, 204, 113] },   // 초록
    { x: cx, y: cy + 160 * s, color: [46, 204, 113] },              // 초록
    { x: cx - 170 * s, y: cy - 60 * s, color: [243, 156, 18] },    // 노랑 (기타)
    { x: cx + 170 * s, y: cy - 60 * s, color: [231, 76, 60] },     // 빨강 (시스템)
  ];

  // 노드 연결선
  for (const node of nodes) {
    drawLine(pixels, size, cx, cy - 10 * s, node.x, node.y, 3 * s, node.color[0], node.color[1], node.color[2], 100);
  }

  // 노드 원
  for (const node of nodes) {
    fillCircle(pixels, size, node.x, node.y, 18 * s, node.color[0], node.color[1], node.color[2]);
    // 내부 하이라이트
    fillCircle(pixels, size, node.x - 4 * s, node.y - 4 * s, 8 * s, 255, 255, 255, 60);
  }

  // 중앙 글로브 위에 밝은 하이라이트
  fillCircle(pixels, size, cx - 30 * s, cy - 50 * s, 30 * s, 255, 255, 255, 25);

  // "PORT" 텍스트 대신 간단한 포트 심볼 (:: 형태)
  const dotSize = 12 * s;
  const dotGap = 30 * s;
  const dotY = cy + 70 * s;
  // 콜론 두 개 (::) - 포트 번호 느낌
  fillCircle(pixels, size, cx - dotGap, dotY - dotGap / 3, dotSize, 255, 255, 255, 180);
  fillCircle(pixels, size, cx - dotGap, dotY + dotGap / 3, dotSize, 255, 255, 255, 180);
  fillCircle(pixels, size, cx + dotGap, dotY - dotGap / 3, dotSize, 255, 255, 255, 180);
  fillCircle(pixels, size, cx + dotGap, dotY + dotGap / 3, dotSize, 255, 255, 255, 180);

  return Buffer.from(pixels.buffer);
}

// --- 메인: 모든 사이즈 생성 ---
const iconsetDir = path.join(__dirname, "..", "icon.iconset");
if (!fs.existsSync(iconsetDir)) fs.mkdirSync(iconsetDir, { recursive: true });

const sizes = [16, 32, 64, 128, 256, 512];

for (const size of sizes) {
  console.log(`Generating ${size}x${size}...`);
  const pixels = drawIcon(size);
  const png = createPng(size, size, pixels);
  fs.writeFileSync(path.join(iconsetDir, `icon_${size}x${size}.png`), png);

  // @2x 버전 (Retina)
  if (size <= 256) {
    const size2x = size * 2;
    console.log(`Generating ${size}x${size}@2x (${size2x}px)...`);
    const pixels2x = drawIcon(size2x);
    const png2x = createPng(size2x, size2x, pixels2x);
    fs.writeFileSync(path.join(iconsetDir, `icon_${size}x${size}@2x.png`), png2x);
  }
}

// 512@2x는 1024px
console.log("Generating 512x512@2x (1024px)...");
const pixels1024 = drawIcon(1024);
const png1024 = createPng(1024, 1024, pixels1024);
fs.writeFileSync(path.join(iconsetDir, "icon_512x512@2x.png"), png1024);

console.log("Icon set created at:", iconsetDir);
console.log("Run: iconutil -c icns icon.iconset -o icon.icns");
