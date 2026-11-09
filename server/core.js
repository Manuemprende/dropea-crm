import { createHmac, timingSafeEqual } from 'node:crypto';

export const markets = ['CL', 'MX', 'ES', 'PT', 'IT'];
export const topics = ['order.created', 'order.status.changed', 'order.cancelled', 'issue.created', 'issue.status.changed', 'issue.resolved'];

export function verifySignature(raw, signature, secret) {
  if (!secret || !signature) return false;
  const expected = 'sha256=' + createHmac('sha256', secret).update(raw).digest('base64');
  const actual = Buffer.from(signature);
  return actual.length === Buffer.byteLength(expected) && timingSafeEqual(actual, Buffer.from(expected));
}

export async function requestDropea(config, path, { method = 'GET', body, fetcher = fetch, idempotencyKey, acceptAsync = false } = {}) {
  if (!config.apiKey) throw Object.assign(new Error('Conecta tu API Key de Dropea para sincronizar.'), { status: 409 });
  if (!markets.includes(config.market)) throw new Error('Mercado no válido');
  const response = await fetcher(`https://${config.market.toLowerCase()}.public-api.dropea.com/dropshipper/${path}`, {
    method, headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json', ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}) },
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(20000), redirect: 'error',
  });
  const json = await response.json().catch(() => ({}));
  if (acceptAsync && response.status === 504 && json.data?.operation_id) return { operation_id: json.data.operation_id, status: 'in_progress' };
  if (!response.ok || json.success === false) {
    const messages = { 401: 'Dropea rechazó la API Key. Revisa que esté vigente y corresponda al mercado seleccionado. Tu sesión del CRM sigue activa.', 403: 'La API Key no tiene permisos para este recurso.', 429: 'Dropea alcanzó el límite de consultas. Reintenta después de un minuto.' };
    throw Object.assign(new Error(messages[response.status] || 'Dropea no pudo completar la solicitud.'), { status: response.status >= 400 ? response.status : 502, code: response.status === 401 ? 'DROPEA_UNAUTHORIZED' : 'DROPEA_REQUEST_FAILED' });
  }
  return json.data;
}

export async function fetchAll(config, path, fetcher = fetch, { onPage } = {}) {
  const result = [];
  for (let page = 1; page <= 500; page++) {
    const data = await requestDropea(config, `${path}?page=${page}&limit=100`, { fetcher });
    if (!Array.isArray(data?.items)) throw new Error(`Respuesta de ${path} no reconocida.`);
    result.push(...data.items);
    onPage?.({ loaded: result.length, total: data.pagination?.total ?? null, page });
    const pagination = data.pagination;
    const hasMetadata = Number.isFinite(pagination?.total_pages) || typeof pagination?.has_next_page === 'boolean' || Number.isFinite(pagination?.total);
    if (hasMetadata ? page >= pagination.total_pages || pagination.has_next_page === false || result.length >= pagination.total : data.items.length < 100) return result;
    if (!data.items.length) throw new Error(`Dropea devolvió una página vacía antes de completar ${path}. Reintenta la sincronización.`);
    // Reserve capacity under the documented rolling 60 requests/minute limit.
    await new Promise(resolve => setTimeout(resolve, 1200));
  }
  throw new Error('La sincronización excedió el límite de páginas; no se reemplazó la copia anterior.');
}
