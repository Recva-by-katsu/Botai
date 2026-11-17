/**
 * Merender Markdown jawaban AI menjadi HTML yang aman untuk Telegram (parse_mode HTML)
 * dan memecahnya menjadi potongan pesan yang tidak memotong blok kode/entitas.
 */

const CB_OPEN = '\u0000B';
const CB_CLOSE = '\u0000';
const IC_OPEN = '\u0000I';
const IC_CLOSE = '\u0000';

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, c => ESCAPES[c]);
}

export function visibleLength(html) {
  return html.replace(/<[^>]*>/g, '').length;
}

/** Pisahkan blok kode berpagar (``` ) sebelum pelolosan HTML agar isinya tetap utuh. */
function extractCodeBlocks(source) {
  const text = String(source).replace(/\r\n?/g, '\n');
  const blocks = [];
  const pieces = [];
  let rest = text;
  const fence = /```([^\n]*)\n?([\s\S]*?)(?:```|$)/;
  while (true) {
    const match = fence.exec(rest);
    if (!match) break;
    pieces.push(rest.slice(0, match.index));
    const lang = (match[1] || '').trim().split(/\s+/)[0].toLowerCase();
    blocks.push({ lang, code: match[2].replace(/\n$/, '') });
    pieces.push(`${CB_OPEN}${blocks.length - 1}${CB_CLOSE}`);
    rest = rest.slice(match.index + match[0].length);
  }
  pieces.push(rest);
  return { text: pieces.join('\n'), blocks };
}

function renderCodeBlock({ lang, code }) {
  const body = escapeHtml(code);
  if (lang && /^[a-z0-9+#._-]{1,32}$/.test(lang)) {
    return `<pre><code class="language-${lang}">${body}</code></pre>`;
  }
  return `<pre>${body}</pre>`;
}

/** Format inline: kode, tebal, miring, coret, tautan. Input sudah ter-escape. */
function inline(text) {
  const store = [];
  const stash = html => `${IC_OPEN}${store.push(html) - 1}${IC_CLOSE}`;

  let out = text.replace(/`([^`\n]+)`/g, (_, code) => stash(`<code>${code}</code>`));
  out = out.replace(/\*\*([^*\n]+?)\*\*/g, '<b>$1</b>');
  out = out.replace(/(^|[^\w\\])__([^_\n]+?)__(?=$|[\s).,!?;:'"»\s])/g, '$1<b>$2</b>');
  out = out.replace(/\*([^*\n]+?)\*/g, '<i>$1</i>');
  out = out.replace(/(^|[^\w\\])_([^_\n]+?)_(?=$|[\s).,!?;:'"»\s])/g, '$1<i>$2</i>');
  out = out.replace(/~~([^~\n]+?)~~/g, '<s>$1</s>');
  out = out.replace(/\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2">$1</a>');
  return out.replace(new RegExp(`${IC_OPEN}(\\d+)${IC_CLOSE}`, 'g'), (_, n) => store[Number(n)]);
}

const HR = '──────────────────';
const CB_RE = new RegExp(`^${CB_OPEN}(\\d+)${CB_CLOSE}$`);

/** Ubah satu dokumen Markdown menjadi array blok HTML mandiri (tiap blok valid sendirian). */
export function markdownToBlocks(markdown) {
  const { text, blocks } = extractCodeBlocks(markdown);
  const lines = escapeHtml(text).split('\n');
  const out = [];
  let para = [];
  let quote = [];

  const flushPara = () => {
    if (para.length) { out.push(inline(para.join('\n'))); para = []; }
  };
  const flushQuote = () => {
    if (quote.length) {
      const body = inline(quote.join('\n'));
      out.push(body.length > 400 ? `<blockquote expandable>${body}</blockquote>` : `<blockquote>${body}</blockquote>`);
      quote = [];
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    const cb = line.match(CB_RE);
    if (cb) {
      flushPara();
      flushQuote();
      out.push(renderCodeBlock(blocks[Number(cb[1])] ?? { lang: '', code: '' }));
      continue;
    }
    if (!line) { flushPara(); flushQuote(); continue; }
    const heading = line.match(/^#{1,6}\s+(.*)$/);
    if (heading) { flushPara(); flushQuote(); out.push(`<b>${inline(heading[1].trim())}</b>`); continue; }
    if (/^([-*_])\1{2,}$/.test(line)) { flushPara(); flushQuote(); out.push(HR); continue; }
    const bq = line.match(/^&gt;\s?(.*)$/);
    if (bq) { flushPara(); quote.push(bq[1]); continue; }
    flushQuote();
    para.push(line.replace(/^[-*+]\s+/, '• '));
  }
  flushPara();
  flushQuote();
  return out.filter(block => block.replace(/<[^>]*>/g, '').trim() || block.startsWith('<pre>'));
}

/** Pecah blok yang melebihi batas menjadi beberapa blok valid. */
function splitBigBlock(block, limit) {
  const quote = block.match(/^<blockquote( expandable)?>([\s\S]*)<\/blockquote>$/);
  if (quote) {
    return groupLines(quote[2].split('\n'), limit - 30)
      .map(part => `<blockquote${quote[1] ?? ''}>${part}</blockquote>`);
  }
  const pre = block.match(/^<pre>(?:<code class="language-([\w+#.-]+)">)?([\s\S]*?)<\/code><\/pre>$|^<pre>([\s\S]*?)<\/pre>$/);
  if (pre) {
    const lang = pre[1] ?? '';
    const code = pre[2] ?? pre[3] ?? '';
    return groupLines(code.split('\n'), limit - 50).map(part =>
      lang ? `<pre><code class="language-${lang}">${part}</code></pre>` : `<pre>${part}</pre>`,
    );
  }
  // Baris tunggal raksasa: buang format untuk potongan itu agar HTML tetap valid.
  const plain = block.replace(/<[^>]*>/g, '');
  const pieces = [];
  for (let i = 0; i < plain.length; i += limit) {
    let end = Math.min(i + limit, plain.length);
    if (end < plain.length) {
      const space = plain.lastIndexOf(' ', end);
      if (space > i + limit / 2) end = space;
    }
    pieces.push(plain.slice(i, end));
  }
  return pieces;
}

function groupLines(lines, limit) {
  const groups = [];
  let current = [];
  let length = 0;
  for (const line of lines) {
    const len = visibleLength(line) + 1;
    if (current.length && length + len > limit) { groups.push(current.join('\n')); current = []; length = 0; }
    current.push(line);
    length += len;
  }
  if (current.length) groups.push(current.join('\n'));
  return groups;
}

/** Gabungkan blok menjadi potongan pesan ≤ limit karakter terlihat (Telegram 4096). */
export function packBlocks(blocks, limit = 3800) {
  const chunks = [];
  let current = [];
  let length = 0;
  const flush = () => { if (current.length) { chunks.push(current.join('\n\n')); current = []; length = 0; } };
  for (const block of blocks) {
    const size = visibleLength(block);
    if (size > limit) { flush(); chunks.push(...splitBigBlock(block, limit)); continue; }
    if (current.length && length + size + 2 > limit) flush();
    current.push(block);
    length += size + 2;
  }
  flush();
  return chunks;
}

/** Kemudahan pakai: Markdown → potongan pesan siap kirim. */
export function markdownToChunks(markdown, limit = 3800) {
  return packBlocks(markdownToBlocks(markdown), limit);
}
