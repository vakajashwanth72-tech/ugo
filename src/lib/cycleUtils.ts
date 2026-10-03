import { apiClient, API_BASE_URL } from './apiClient';

/**
 * Normalizes any image URL, base64 payload, or storage path for a cycle into a valid, renderable image URI.
 */
export function getCycleImageUrl(img?: any): string {
  if (!img) return '';

  // 1. If an array is passed, find the first valid image URL
  if (Array.isArray(img)) {
    for (const item of img) {
      const resolved = getCycleImageUrl(item);
      if (resolved) return resolved;
    }
    return '';
  }

  let raw: any = '';

  // 2. If an object is passed, check all possible field names across backend and database schemas
  if (typeof img === 'object') {
    raw =
      img.image_url ||
      img.imageUrl ||
      img.image ||
      img.url ||
      img.storage_path ||
      img.storagePath ||
      img.photo ||
      img.picture ||
      img.uri ||
      img.file_path ||
      img.filePath ||
      img.path ||
      img.image1 ||
      img.image2 ||
      img.image3 ||
      img.image_data ||
      img.imageData ||
      img.data ||
      img.base64 ||
      img.link ||
      img.src ||
      img.src_url ||
      img.images ||
      img.cycle_images ||
      '';

    // If the extracted value is itself an array or nested object, recurse
    if (Array.isArray(raw)) {
      for (const sub of raw) {
        const resolved = getCycleImageUrl(sub);
        if (resolved) return resolved;
      }
      return '';
    } else if (raw && typeof raw === 'object') {
      return getCycleImageUrl(raw);
    }
  } else if (typeof img === 'string') {
    raw = img;
  }

  if (!raw || typeof raw !== 'string') return '';
  let trimmed = raw.trim();

  // Strip wrapping single or double quotes if stringified JSON e.g. "\"https://...\""
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    trimmed = trimmed.slice(1, -1).trim();
  }

  // Handle JSON string array e.g. "[\"https://...\"]"
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return getCycleImageUrl(parsed[0]);
      }
    } catch {
      // Ignore JSON parse error
    }
  }

  // Handle JSON string object e.g. "{\"image_url\":\"...\"}"
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsed = JSON.parse(trimmed);
      return getCycleImageUrl(parsed);
    } catch {
      // Ignore JSON parse error
    }
  }

  if (!trimmed) return '';

  const lowercase = trimmed.toLowerCase();
  if (
    lowercase === 'image' ||
    lowercase === 'images' ||
    lowercase === 'cycle_images' ||
    lowercase === 'cycle_image' ||
    lowercase === 'photo' ||
    lowercase === 'photos' ||
    lowercase === 'picture' ||
    lowercase === 'pictures' ||
    lowercase === 'storage_path' ||
    lowercase === 'file_path' ||
    lowercase === 'null' ||
    lowercase === 'undefined' ||
    lowercase === 'none' ||
    lowercase === '[object object]'
  ) {
    return '';
  }

  // 3. Absolute URLs or local schemes
  if (
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('file://') ||
    trimmed.startsWith('content://') ||
    trimmed.startsWith('ph://') ||
    trimmed.startsWith('data:')
  ) {
    return trimmed;
  }

  // 4. Raw base64 string without data: URI prefix
  // JPEG markers: /9j/ or 9j/
  if (trimmed.startsWith('/9j/') || trimmed.startsWith('9j/')) {
    const clean = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
    return `data:image/jpeg;base64,${clean}`;
  }
  // PNG marker: iVBOR
  if (trimmed.startsWith('iVBORw0KGgo') || trimmed.startsWith('iVBOR')) {
    return `data:image/png;base64,${trimmed}`;
  }
  // WebP marker: UklGR
  if (trimmed.startsWith('UklGR')) {
    return `data:image/webp;base64,${trimmed}`;
  }
  // GIF marker: R0lGOD
  if (trimmed.startsWith('R0lGOD')) {
    return `data:image/gif;base64,${trimmed}`;
  }
  // General base64 heuristic: long string (>60 chars) of base64 characters
  const sanitized = trimmed.replace(/[\r\n\s]/g, '');
  if (
    sanitized.length > 60 &&
    !sanitized.includes(' ') &&
    !sanitized.includes('\\') &&
    /^[A-Za-z0-9+/=]+$/.test(sanitized)
  ) {
    return `data:image/jpeg;base64,${sanitized}`;
  }

  return '';
}

/**
 * Extracts an array of valid, normalized image URLs from any cycle or container object.
 */
export function extractCycleImages(cycle: any): string[] {
  if (!cycle) return [];

  // If array is passed directly, extract from every item
  if (Array.isArray(cycle)) {
    const list = cycle.map((item) => getCycleImageUrl(item)).filter(Boolean);
    return Array.from(new Set(list));
  }

  // If string is passed, wrap in single array
  if (typeof cycle === 'string') {
    const resolved = getCycleImageUrl(cycle);
    return resolved ? [resolved] : [];
  }

  const rawList: any[] = [];

  // 1. Check cycle_images container (can be array or single object row from PostgreSQL)
  const cycleImages = cycle.cycle_images ?? cycle.cycleImages ?? cycle.cycle_image;
  if (Array.isArray(cycleImages) && cycleImages.length > 0) {
    const sorted = [...cycleImages].sort(
      (a: any, b: any) => (a.display_order ?? a.order ?? 0) - (b.display_order ?? b.order ?? 0)
    );
    rawList.push(...sorted);
  } else if (cycleImages && typeof cycleImages === 'object' && Object.keys(cycleImages).length > 0) {
    rawList.push(cycleImages);
  }

  // 2. Check images container (array or string)
  if (Array.isArray(cycle.images) && cycle.images.length > 0) {
    rawList.push(...cycle.images);
  } else if (typeof cycle.images === 'string' && cycle.images.trim()) {
    try {
      const parsed = JSON.parse(cycle.images);
      if (Array.isArray(parsed)) rawList.push(...parsed);
      else rawList.push(cycle.images);
    } catch {
      if (cycle.images.includes(',')) {
        rawList.push(...cycle.images.split(',').map((s: string) => s.trim()));
      } else {
        rawList.push(cycle.images);
      }
    }
  }

  // 3. Check photos and pictures arrays
  if (Array.isArray(cycle.photos) && cycle.photos.length > 0) {
    rawList.push(...cycle.photos);
  }
  if (Array.isArray(cycle.pictures) && cycle.pictures.length > 0) {
    rawList.push(...cycle.pictures);
  }

  // 4. Check explicit photo fields
  if (cycle.image) rawList.push(cycle.image);
  if (cycle.image_url) rawList.push(cycle.image_url);
  if (cycle.imageUrl) rawList.push(cycle.imageUrl);
  if (cycle.photo) rawList.push(cycle.photo);
  if (cycle.picture) rawList.push(cycle.picture);
  if (cycle.storage_path) rawList.push(cycle.storage_path);
  if (cycle.storagePath) rawList.push(cycle.storagePath);
  if (cycle.image1) rawList.push(cycle.image1);
  if (cycle.image2) rawList.push(cycle.image2);
  if (cycle.image3) rawList.push(cycle.image3);
  if (cycle.data) rawList.push(cycle.data);
  if (cycle.image_data) rawList.push(cycle.image_data);
  if (cycle.base64) rawList.push(cycle.base64);
  if (cycle.file_path) rawList.push(cycle.file_path);
  if (cycle.filePath) rawList.push(cycle.filePath);
  if (cycle.link) rawList.push(cycle.link);
  if (cycle.url) rawList.push(cycle.url);

  // 5. Deduplicate and normalize
  const seen = new Set<string>();
  const result: string[] = [];

  for (const item of rawList) {
    const resolved = getCycleImageUrl(item);
    if (resolved && !seen.has(resolved)) {
      seen.add(resolved);
      result.push(resolved);
    }
  }

  return result;
}
