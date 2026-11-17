export class AIError extends Error {}

export async function complete(config, messages, fetcher = fetch) {
  let response;
  try {
    response = await fetcher(`${config.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [config.authHeader]: config.authHeader === 'Authorization' ? `Bearer ${config.apiKey}` : config.apiKey,
      },
      body: JSON.stringify({ model: config.model, messages, stream: false }),
      signal: AbortSignal.timeout(config.timeout),
    });
  } catch {
    throw new AIError('API tidak dapat dihubungi atau waktu tunggu habis. Coba lagi nanti.');
  }
  if (!response.ok) {
    const errors = {
      401: 'Kredensial KATSU AI tidak valid. Hubungi pengelola bot.',
      403: 'Akses KATSU AI ditolak. Hubungi pengelola bot.',
      429: 'Batas penggunaan API tercapai. Coba lagi nanti.',
    };
    throw new AIError(errors[response.status] || `Layanan AI sedang bermasalah (HTTP ${response.status}). Coba lagi nanti.`);
  }
  let data;
  try { data = await response.json(); } catch { throw new AIError('Format respons API tidak valid.'); }
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) throw new AIError('API tidak mengembalikan jawaban teks.');
  return content.trim();
}

// Batas konservatif, termasuk karakter surrogate pair seperti emoji.
export function splitMessage(text, limit = 4000) {
  const chunks = [];
  let chunk = '';
  for (const char of text) {
    if (chunk.length + char.length > limit) { chunks.push(chunk); chunk = ''; }
    chunk += char;
  }
  if (chunk) chunks.push(chunk);
  return chunks;
}
