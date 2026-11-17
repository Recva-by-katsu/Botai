import test from 'node:test';
import assert from 'node:assert/strict';
import { escapeHtml, markdownToBlocks, markdownToChunks, packBlocks, visibleLength } from '../src/markdown.js';

test('escapeHtml', () => {
  assert.equal(escapeHtml('<b> "a" & \'c\'</b>'), '&lt;b&gt; &quot;a&quot; &amp; &#39;c&#39;&lt;/b&gt;');
});

test('heading, pemisah, dan poin daftar', () => {
  const blocks = markdownToBlocks('## Judul\n\n- satu\n* dua\n3. tiga\n\n---');
  assert.equal(blocks[0], '<b>Judul</b>');
  assert.equal(blocks[1], '• satu\n• dua\n3. tiga');
  assert.ok(blocks[2].startsWith('──'));
});

test('format inline: tebal, miring, coret, kode, tautan', () => {
  const blocks = markdownToBlocks('**tebal** dan _miring_ dan *juga* dan ~~hapus~~');
  assert.equal(blocks[0], '<b>tebal</b> dan <i>miring</i> dan <i>juga</i> dan <s>hapus</s>');
  const code = markdownToBlocks('pakai `npm test` ya')[0];
  assert.equal(code, 'pakai <code>npm test</code> ya');
  const link = markdownToBlocks('[dokumen](https://example.com/a?b=1&c=2)')[0];
  assert.equal(link, '<a href="https://example.com/a?b=1&amp;c=2">dokumen</a>');
});

test('snake_case tidak dianggap miring', () => {
  assert.equal(markdownToBlocks('variabel foo_bar_baz begitu')[0], 'variabel foo_bar_baz begitu');
});

test('blok kode dengan bahasa dan pelolosan HTML', () => {
  const blocks = markdownToBlocks('```python\nprint("<b>")\n```');
  assert.equal(blocks[0], '<pre><code class="language-python">print(&quot;&lt;b&gt;&quot;)</code></pre>');
});

test('blok kode tanpa bahasa dan pagar tak ditutup', () => {
  assert.equal(markdownToBlocks('```\nhalo\n```')[0], '<pre>halo</pre>');
  assert.equal(markdownToBlocks('```js\nlet a = 1;')[0], '<pre><code class="language-js">let a = 1;</code></pre>');
});

test('teks tebal di dalam baris kode tidak diproses', () => {
  const blocks = markdownToBlocks('contoh `**ini kode**` ya');
  assert.equal(blocks[0], 'contoh <code>**ini kode**</code> ya');
});

test('blockquote menjadi tag blockquote', () => {
  const blocks = markdownToBlocks('> baris satu\n> baris dua');
  assert.equal(blocks[0], '<blockquote>baris satu\nbaris dua</blockquote>');
});

test('karakter HTML di teks biasa di-escape', () => {
  assert.equal(markdownToBlocks('bandingkan a < b & c > d')[0], 'bandingkan a &lt; b &amp; c &gt; d');
});

test('markdownToChunks: potongan ≤ limit dan tidak kehilangan isi', () => {
  const md = [
    '# Laporan',
    '',
    'Paragraf pembuka dengan **teks tebal**.',
    '',
    '```js\n' + Array.from({ length: 50 }, (_, i) => `console.log(${i});`).join('\n') + '\n```',
    '',
    'Penutup.',
  ].join('\n');
  const chunks = markdownToChunks(md, 300);
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every(c => visibleLength(c) <= 300));
  assert.ok(chunks.some(c => c.includes('console.log(49);')));
  assert.ok(chunks[0].includes('<b>Laporan</b>'));
  assert.equal(chunks.at(-1), 'Penutup.');
});

test('blok kode raksasa dipecah tanpa merusak tag pre', () => {
  const md = '```js\n' + Array.from({ length: 400 }, (_, i) => `x${i} = ${i};`).join('\n') + '\n```';
  const chunks = markdownToChunks(md, 1000);
  assert.ok(chunks.length > 1);
  for (const chunk of chunks) {
    assert.ok(chunk.startsWith('<pre><code class="language-js">'));
    assert.ok(chunk.endsWith('</code></pre>'));
    assert.ok(visibleLength(chunk) <= 1000);
  }
});

test('packBlocks menggabungkan blok kecil dan memecah blok besar', () => {
  const packed = packBlocks(['a'.repeat(100), 'b'.repeat(100), 'c'.repeat(5000)], 1000);
  assert.equal(packed[0], 'a'.repeat(100) + '\n\n' + 'b'.repeat(100));
  assert.ok(packed.length > 2);
});
