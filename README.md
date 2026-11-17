# BotAI · ChatGPT versi Telegram (KATSU AI)

Bot Telegram berbahasa Indonesia yang mengubah chat pribadi menjadi pengalaman ala **ChatGPT** — ditenagai [KATSU AI Autopilot](https://ai.katsuvip.eu.cc/docs) melalui `POST /v1/chat/completions`.

## ✨ Fitur

- **Streaming ala ChatGPT** — jawaban muncul bertahap di satu pesan yang disunting berkala (SSE `stream: true`), dengan indikator "sedang mengetik".
- **Perenderan Markdown profesional** — teks tebal/miring, coret, tautan, daftar, heading, kutipan, dan blok kode dengan penanda bahasa (`<pre><code class="language-…">`). HTML di-escape sehingga jawaban AI tidak bisa merusak tampilan.
- **Pemecahan pesan cerdas** — jawaban panjang dipecah menjadi beberapa pesan tanpa pernah memotong blok kode atau entitas format.
- **Pemilih model inline** — `/model` mengambil daftar model langsung dari `GET /v1/models`, dengan navigasi halaman dan tanda ✅ pada model aktif.
- **Tombol aksi pada tiap jawaban** — 💬 Chat Baru, ♻️ Ulangi (susun ulang jawaban), 🗑️ hapus pesan.
- **Konteks percakapan** — riwayat tanya-jawab dibatasi `HISTORY_TURNS`; balas (reply) jawaban bot untuk menanyakan lanjutan dengan kutipan konteks.
- **Pengaturan per sesi** — `/settings`: gaya jawaban (suhu 0.3 / 0.7 / 1.0) dan on/off streaming.
- **Pembatas laju adil** — jendela geser per pengguna, plus antrean: satu generasi per pengguna, pesan berikutnya ditolak ramah selama proses.
- **Aman secara default** — hanya chat pribadi, allowlist ID Telegram opsional, token tidak pernah tercetak di log, galat API tidak membocorkan isi respons.

## 🚀 Menjalankan

- Node.js **20 atau lebih baru**.
- Token bot dari **@BotFather** (`/newbot`).
- API key KATSU AI.

```bash
npm ci
cp .env.example .env
# Edit .env, isi TELEGRAM_BOT_TOKEN dan KATSU_API_KEY
npm start
```

Bot memakai **long polling** — tidak butuh domain atau webhook. Jalankan **satu instance per token**; jika token sebelumnya dipakai webhook, hapus webhook dulu melalui Bot API Telegram.

### Docker

```bash
docker build -t botai .
docker run --env-file .env --restart unless-stopped botai
```

## 💬 Perintah

| Perintah | Fungsi |
| --- | --- |
| `/start` | Kartu sambutan + menu utama |
| `/help` | Panduan lengkap |
| `/new`, `/reset` | Percakapan baru (hapus konteks) |
| `/model` | Pilih model AI (tombol inline) |
| `/settings` | Gaya jawaban & streaming |
| `/status` | Model aktif, kuota, jumlah konteks |

## ⚙️ Konfigurasi `.env`

| Variabel | Default | Keterangan |
| --- | --- | --- |
| `TELEGRAM_BOT_TOKEN` | — | **Wajib**; token @BotFather |
| `KATSU_API_KEY` | — | **Wajib**; kredensial KATSU AI |
| `KATSU_BASE_URL` | `https://ai.katsuvip.eu.cc` | Tanpa `/v1`, harus HTTPS |
| `KATSU_AUTH_HEADER` | `Authorization` | Alternatif: `X-API-Key` |
| `KATSU_MODEL` | `auto` | Model bawaan; bisa diganti via `/model` |
| `TEMPERATURE` | `0.7` | Kreativitas jawaban (0–2) |
| `MAX_TOKENS` | *(kosong)* | Batas token keluaran per jawaban |
| `STREAM_ENABLED` | `true` | Streaming bertahap ala ChatGPT |
| `API_TIMEOUT_SECONDS` | `90` | Batas tunggu API (1–300) |
| `EDIT_INTERVAL_MS` | `2500` | Jeda penyuntingan pratinjau streaming |
| `SYSTEM_PROMPT` | *(lihat contoh)* | Instruksi dasar AI |
| `HISTORY_TURNS` | `10` | Pasangan tanya-jawab diingat (1–50) |
| `MAX_QUESTION_LENGTH` | `4000` | Batas panjang pertanyaan |
| `ALLOWED_USER_IDS` | *(kosong)* | Kosong = terbuka untuk semua |
| `RATE_LIMIT_REQUESTS` | `20` | Kuota permintaan per pengguna |
| `RATE_LIMIT_WINDOW_SECONDS` | `60` | Jendela pembatas laju |
| `MAX_SESSIONS` | `500` | Batas sesi di memori |
| `SESSION_TTL_MINUTES` | `60` | Sesi kedaluwarsa setelah diam |

Jangan kirim token/API key ke chat, dan jangan commit `.env`.

## 🧱 Arsitektur

```
src/
├── index.js      # Orkestrasi bot: perintah, tombol inline, alur generasi
├── ai.js         # Klien KATSU AI: chat (streaming SSE + fallback), daftar model
├── markdown.js   # Markdown → HTML Telegram + pemecah pesan aman blok kode
├── session.js    # Penyimpanan sesi & riwayat di memori (TTL, eviksi LRU)
├── ratelimit.js  # Pembatas laju jendela geser per pengguna
├── ui.js         # Teks & keyboard inline (satu tempat, mudah diubah)
└── config.js     # Validasi variabel lingkungan
```

Alur satu pertanyaan: **validasi & pembatas laju → placeholder "🧠 Sedang berpikir…" → streaming/pratinjau bertahap → render Markdown → potong aman → kirim + tombol aksi → simpan riwayat.**

## 🧪 Pengembangan

```bash
npm test   # unit test semua modul (node:test)
npm check  # pemeriksaan sintaks semua berkas src
```

## 🩺 Masalah umum

- **Bot tidak merespons** — pastikan hanya satu instance berjalan dan webhook lama sudah dihapus.
- `401/403 KATSU AI` — API key salah atau ditolak; periksa `KATSU_API_KEY`.
- Jawaban berhenti di tengah — koneksi API terputus; tekan ♻️ **Ulangi** untuk menyusun ulang.
