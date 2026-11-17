# BotAI Telegram · KATSU AI

Bot Telegram Node.js yang menggunakan [KATSU AI Autopilot](https://ai.katsuvip.eu.cc/docs), melalui `POST /v1/chat/completions`. Mendukung model `auto`, konteks percakapan, balasan panjang, indikator mengetik, serta pembatasan pengguna.

## Persiapan

- Node.js **20 atau lebih baru**.
- Token bot Telegram dari **@BotFather** (buat dengan `/newbot`).
- API key KATSU AI dari pengelola/akun KATSU Anda.
- Mesin yang dapat mengakses API Telegram dan KATSU AI melalui HTTPS.

Jangan kirim token atau API key ke chat, dan jangan commit `.env`.

## Menjalankan

```bash
npm ci
cp .env.example .env
# Edit .env secara lokal, isi TELEGRAM_BOT_TOKEN dan KATSU_API_KEY
npm start
```

Buka bot Anda di Telegram, tekan **Start**, lalu kirim pertanyaan. Bot memakai **long polling** sehingga tidak memerlukan domain atau server webhook. Jalankan hanya satu instance per token. Jika token sebelumnya menggunakan webhook, hapus webhook melalui Telegram Bot API sebelum menjalankan bot ini.

## Perintah

| Perintah | Fungsi |
| --- | --- |
| `/start`, `/help` | Petunjuk penggunaan |
| `/reset` | Menghapus konteks percakapan lokal |
| `/model` | Menampilkan model aktif |

Bot hanya merespons **chat pribadi** untuk menghindari pengiriman isi grup secara tidak sengaja. Pesan nonteks belum didukung.

## Konfigurasi `.env`

| Variabel | Default / fungsi |
| --- | --- |
| `TELEGRAM_BOT_TOKEN` | Wajib; token dari BotFather |
| `KATSU_API_KEY` | Wajib; kredensial KATSU AI |
| `KATSU_BASE_URL` | `https://ai.katsuvip.eu.cc` (tanpa `/v1`) |
| `KATSU_AUTH_HEADER` | `Authorization` → `Bearer <key>`; alternatif `X-API-Key` |
| `KATSU_MODEL` | `auto`; bisa diganti model yang tersedia di layanan |
| `ALLOWED_USER_IDS` | ID pengguna Telegram dipisahkan koma; kosong berarti terbuka untuk semua |
| `SYSTEM_PROMPT` | Instruksi dasar AI |
| `HISTORY_TURNS` | `10`; jumlah pasangan pesan dalam konteks, maksimal 50 |
| `MAX_SESSIONS` | `500`; batas sesi di memori |
| `SESSION_TTL_MINUTES` | `60`; sesi dibersihkan saat pesan berikutnya diproses |
| `API_TIMEOUT_SECONDS` | `90`; batas tunggu respons API |

**Disarankan mengisi `ALLOWED_USER_IDS`** agar kuota API tidak digunakan orang lain. Semua pengguna bot menggunakan satu API key dan berbagi kuota. Tidak ada retry otomatis untuk menghindari permintaan/biaya ganda. Pemrosesan pesan berurutan; permintaan lama dapat menunda pesan pengguna lain. Untuk penggunaan pribadi atau skala kecil.

### Catatan integrasi API

Payload mengikuti skema OpenAPI KATSU: `model`, `messages` (`role` dan `content`), serta `stream: false`. Jawaban dibaca dari `choices[0].message.content` seperti format OpenAI-compatible. Skema publik tidak merinci autentikasi maupun struktur respons sukses; default Bearer dan format respons ini perlu dikonfirmasi dengan kredensial Anda. Jika deployment menggunakan header `X-API-Key`, ubah konfigurasi terkait.

## Privasi dan penyimpanan

Riwayat hanya disimpan sementara di RAM dan tidak ditulis ke disk. Restart menghapus semua sesi; `/reset` menghapus sesi pengguna. Konteks yang dikirim ke KATSU mencakup system prompt dan riwayat terbaru. Penghapusan lokal tidak menghapus data yang mungkin disimpan penyedia API. Jangan kirim informasi sensitif. Bot tidak memakai endpoint memory/knowledge bersama agar data pengguna tidak tercampur.

Jawaban dikirim sebagai teks biasa (tanpa parse Markdown), dibagi menjadi potongan aman untuk Telegram. Jawaban di atas 24.000 karakter dikirim sebagai file teks.

## Pemeriksaan

```bash
npm run check
npm test
```

Tes memakai mock dan tidak menghabiskan kuota. Pengujian end-to-end membutuhkan kredensial asli dan akses jaringan ke kedua layanan; belum dilakukan di lingkungan pengembangan ini.

## Pemecahan masalah

- **401/403**: periksa key, izin akun, dan jenis header autentikasi.
- **429**: kuota/rate limit KATSU tercapai; tunggu atau hubungi penyedia.
- **Gagal startup**: periksa token bot, akses jaringan, webhook lama, serta proses bot lain dengan token sama.
- **Timeout**: periksa ketersediaan layanan atau tingkatkan `API_TIMEOUT_SECONDS` (maksimal 300).
- **Format respons tidak sesuai**: pastikan server mengembalikan chat completion OpenAI-compatible.
