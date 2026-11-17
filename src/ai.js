export class AIError extends Error {}

const ERROR_MAP = {
  400: 'Permintaan tidak dapat diproses oleh server AI. Coba ubah pertanyaan Anda.',
  401: 'Kredensial KATSU AI tidak valid. Hubungi pengelola bot.',
  403: 'Akses KATSU AI ditolak. Hubungi pengelola bot.',
  404: 'Endpoint AI tidak ditemukan. Periksa konfigurasi KATSU_BASE_URL.',
  429: 'Batas penggunaan API tercapai. Tunggu sebentar lalu coba lagi.',
  500: 'Server AI mengalami gangguan. Coba lagi nanti.',
  502: 'Server AI sedang tidak dapat dihubungi. Coba lagi nanti.',
  503: 'Server AI sedang kelebihan beban. Coba lagi beberapa saat.',
};

function errorFor(status) {
  return new AIError(ERROR_MAP[status] || `Layanan AI sedang bermasalah (HTTP ${status}). Coba lagi nanti.`);
}

function authHeaders(config) {
  const headers = { 'Content-Type': 'application/json' };
  if (config.authHeader === 'Authorization') headers.Authorization = `Bearer ${config.apiKey}`;
  else headers[config.authHeader] = config.apiKey;
  return headers;
}

function buildBody(config, messages, stream) {
  const body = { model: config.model, messages, stream };
  if (typeof config.temperature === 'number') body.temperature = config.temperature;
  if (config.maxTokens != null) body.max_tokens = config.maxTokens;
  return body;
}

async function postChat(config, messages, stream, fetcher) {
  try {
    return await fetcher(`${config.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: authHeaders(config),
      body: JSON.stringify(buildBody(config, messages, stream)),
      signal: AbortSignal.timeout(config.timeout),
    });
  } catch {
    throw new AIError('API tidak dapat dihubungi atau waktu tunggu habis. Coba lagi nanti.');
  }
}

async function readJsonAnswer(response) {
  let data;
  try { data = await response.json(); } catch { throw new AIError('Format respons API tidak valid.'); }
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) throw new AIError('API tidak mengembalikan jawaban teks.');
  return content;
}

/** Jawaban sekali ambil (tanpa streaming). Cocok untuk pengujian dan mode STREAM_ENABLED=false. */
export async function complete(config, messages, fetcher = fetch) {
  const response = await postChat(config, messages, false, fetcher);
  if (!response.ok) throw errorFor(response.status);
  return (await readJsonAnswer(response)).trim();
}

/**
 * Jawaban dengan streaming SSE. Mengembalikan { text, truncated }.
 * Jika server mengabaikan `stream: true` dan membalas JSON utuh, respons tetap ditangani.
 */
export async function chat(config, messages, { onDelta } = {}, fetcher = fetch) {
  const wantStream = config.streamEnabled !== false;
  const response = await postChat(config, messages, wantStream, fetcher);
  if (!response.ok) throw errorFor(response.status);
  const contentType = String(response.headers.get('content-type') || '');
  if (wantStream && contentType.includes('text/event-stream')) return consumeStream(response, onDelta);
  const text = await readJsonAnswer(response);
  return { text: text.trim(), truncated: false };
}

async function consumeStream(response, onDelta) {
  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';
  let truncated = false;

  // Mengembalikan true bila aliran sudah selesai (data: [DONE]).
  function handleLine(raw) {
    const line = raw.replace(/\r$/, '');
    if (!line.startsWith('data:')) return false;
    const payload = line.slice(5).trim();
    if (!payload) return false;
    if (payload === '[DONE]') return true;
    let parsed;
    try { parsed = JSON.parse(payload); } catch { return false; }
    if (parsed?.error) throw new AIError('Server AI mengembalikan galat saat streaming. Coba lagi nanti.');
    const choice = parsed?.choices?.[0];
    const delta = choice?.delta?.content ?? choice?.message?.content;
    if (typeof delta === 'string' && delta) {
      full += delta;
      onDelta?.(delta, full);
    }
    return false;
  }

  function processChunk(chunk) {
    buffer += decoder.decode(chunk, { stream: true });
    let index;
    while ((index = buffer.indexOf('\n')) !== -1) {
      if (handleLine(buffer.slice(0, index))) return true;
      buffer = buffer.slice(index + 1);
    }
    return false;
  }

  try {
    for await (const chunk of response.body) {
      if (processChunk(chunk)) break;
    }
    // Sirip akhir: sisa dekoder dan baris terakhir tanpa newline.
    buffer += decoder.decode();
    for (const line of buffer.split('\n')) {
      if (handleLine(line)) break;
    }
  } catch (error) {
    if (error instanceof AIError) throw error;
    if (full) truncated = true;
    else if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
      throw new AIError('API tidak dapat dihubungi atau waktu tunggu habis. Coba lagi nanti.');
    } else throw new AIError('Koneksi ke server AI terputus. Coba lagi nanti.');
  }
  if (!full.trim()) throw new AIError('API tidak mengembalikan jawaban teks.');
  return { text: full.trim(), truncated };
}

export function extractModelIds(data) {
  let list = [];
  if (Array.isArray(data)) list = data;
  else if (Array.isArray(data?.data)) list = data.data;
  else if (Array.isArray(data?.models)) list = data.models;
  const ids = list
    .map(item => (typeof item === 'string' ? item : item?.id ?? item?.name ?? item?.model))
    .filter(id => typeof id === 'string' && id.trim());
  return [...new Set(ids.map(id => id.trim()))];
}

/** Daftar id model dari GET /v1/models. Bila struktur tak dikenal, kembalikan array kosong. */
export async function listModels(config, fetcher = fetch) {
  let response;
  try {
    response = await fetcher(`${config.baseUrl}/v1/models`, {
      headers: authHeaders(config),
      signal: AbortSignal.timeout(config.timeout),
    });
  } catch {
    throw new AIError('API tidak dapat dihubungi. Periksa koneksi atau coba lagi nanti.');
  }
  if (!response.ok) throw errorFor(response.status);
  let data;
  try { data = await response.json(); } catch { return []; }
  return extractModelIds(data);
}
