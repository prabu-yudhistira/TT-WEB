# Konsep: Semesta di Atas Kertas

Status: rancangan, belum dibangun. Disusun 2026-08-19 dari dua putaran keputusan pemilik.

---

## 0. Ringkasan

Situs bergeser dari "atelier kertas" menjadi **halaman atlas langit yang digambar tangan**. Logo Tampa Taruno berhenti jadi sekadar tanda dan menjadi **pusat gravitasi**: usaha-usaha yang sejalan mengorbit di sekelilingnya, masing-masing meninggalkan jejak pensil di belakangnya. Kesan *from scratch* / penciptaan tidak hilang — justru menguat, karena semesta ini jelas **digambar**, bukan difoto: garis grafit, kertas, merah pensil.

---

## 1. Keputusan yang sudah terkunci

| Perkara | Putusan |
|---|---|
| Arah visual | Peta bintang di atas kertas. Token `tokens.css` yang ada dipertahankan (grafit, `--brand-paper-ref`, `--accent`). Bukan ruang angkasa gelap. |
| Kata konstelasi di hero | Diganti planet |
| Isi planet | Nama, kota, jenis usaha, link website, tahun berdiri |
| Makna planet | Usaha siapa saja yang sejalan dengan manifesto — bukan klaim klien |
| Kustomisasi | Pemilik usaha memilih sendiri rupa planet **dan** rupa jejaknya |
| Sumbu orbit | Tiga bidang berbeda untuk tahap awal |
| Kedalaman perubahan | Visual + copy ditulis ulang; struktur rute tetap |
| Peta di manifesto | SVG gambar tangan, tanpa layanan peta luar |
| Persetujuan | Pemilik menyetujui tiap submit satu per satu |
| Hosting/DB | Belum diputuskan — form publik ditunda, planet tahap awal diisi lewat admin |

---

## 2. Metafora inti

Tiga kata yang harus tetap terbaca di seluruh situs:

- **Tempa** — sudah ada, jangan dibuang. "Empu digital" tetap kalimat inti manifesto.
- **Orbit** — hubungan yang berulang dan punya jarak tetap. Bukan "pengikut", bukan "klien".
- **Jejak** — bekas yang ditinggalkan benda yang bergerak. Ini penghubung ke pensil: jejak orbit dan goresan grafit adalah hal yang sama.

Aturan keras: **tidak ada glow, tidak ada neon, tidak ada latar hitam.** Setiap benda langit di situs ini adalah benda yang digambar di atas kertas. Kalau sebuah elemen tidak bisa dijelaskan sebagai "ini digambar tangan", elemen itu salah.

---

## 3. Hero — sistem orbit

Menggantikan `src/components/hero/ConstellationField.tsx`. Mesin yang ada dipakai ulang, bukan dibuang: satu `requestAnimationFrame`, satu canvas 2D, elemen DOM digeser lewat `transform` — pola itu sudah terbukti dan tetap dipakai.

### 3.1 Tiga bidang orbit

Tiap bidang = satu elips yang diproyeksikan 2D, berpusat di `logoRect`. Radius dasar `R = max(logoRect.hw, logoRect.hh)`.

| Bidang | Kemiringan | Radius x | Radius y | Periode | Arah |
|---|---|---|---|---|---|
| A | −12° | 1.55 R | 0.42 R | 90 dtk | searah jarum jam |
| B | +34° | 2.15 R | 0.58 R | 140 dtk | berlawanan |
| C | −68° | 2.80 R | 0.35 R | 210 dtk | searah |

Tiga elips yang saling memotong dengan kemiringan berbeda adalah yang bikin gambar ini terbaca sebagai diagram langit, bukan sekadar lingkaran.

**Logo adalah Saturnus** (putusan pemilik, 2026-08-19). Tiap bidang orbit tidak digambar sebagai satu garis rambut, tapi sebagai **pita cincin**: enam busur sepusat (`RING_BANDS`) mengelilingi elips sejati, dengan satu celah lebar sebagai pembagian Cassini. Busur `k = 1` adalah jalur yang benar-benar ditempuh planet, jadi planet selalu berjalan di tengah pitanya sendiri.

Konsekuensi strukturalnya: **satu canvas tidak cukup**. Pita yang seluruhnya di belakang logo bukan cincin, itu cuma garis yang digambar mengelilingi sesuatu. Jadi ada dua canvas — `far` di `z-index: -1` dan `near` di `z-index: 2` — dan tiap pita dipotong di paruhnya: busur dengan `sin(t) < 0` ke canvas belakang, sisanya ke depan. Jejak planet ikut dipotong sama: tiap sampel jejak menyimpan kedalamannya, jadi jejak yang menyeberangi logo putus di titik yang persis sama dengan planetnya.

Parameter elips yang dipakai `ctx.ellipse()` adalah parameter yang sama dengan `orbitPoint`, jadi pemotongan ini cuma satu panggilan busur tambahan per pita — dan `placement.check.ts` menegaskan kedua jalur kode itu sepakat soal paruh mana yang di depan.

Kedalaman palsu: saat planet berada di paruh jauh elips (fase sinus negatif), skalanya turun ke 0.7, alpha ke 0.55, dan `z-index`-nya jatuh ke bawah logo — jadi planet benar-benar lewat di belakang logo. Ini yang menjual kesan 3D tanpa biaya 3D.

### 3.2 Planet

Node DOM, bukan gambar di canvas. Alasannya keras: hover, tap, fokus keyboard, dan pembaca layar semuanya dapat gratis, dan link website butuh elemen `<a>` betulan.

Tiap planet = `<a>` (kalau punya website) atau `<button>` (kalau tidak), ukuran 12 / 18 / 26 px.

**Bola sketsa 3D, dengan CSS — bukan WebGL** (putusan pemilik, 2026-08-19). Alasannya bukan selera: hero sudah punya satu komponen yang lenyap tanpa GPU (logo 3D), dan menambah empat puluh lagi berarti langit kosong di tiap mesin yang akselerasi hardware-nya mati. Span bersarang dengan `transform-style: preserve-3d` tidak butuh context sama sekali.

Susunannya: beberapa lingkaran meridian diputar `rotateY`, satu lingkaran khatulistiwa `rotateX(90deg)`, siluet statis di luar grup 3D supaya tepinya tidak pernah menipis jadi garis, dan arsiran pensil bertopeng sabit dengan cahaya tetap di kiri atas. **Tanpa `perspective`** — lingkaran yang diputar terhadap Y tanpa perspektif memproyeksi jadi elips selebar cos(θ), dan itu justru proyeksi ortografis meridian yang benar untuk benda selebar dua puluh piksel.

Sumbu miring dan periode putar diturunkan dari hash id (±28°, 7–16 detik) supaya empat puluh planet tidak terbaca sebagai satu benda yang diulang.

Karena semua bola bersiluet sama, `kind` pindah dari siluet ke permukaan: ia menentukan **jumlah garis meridian** (`KIND_MERIDIANS`). Pin di peta tetap memakai tujuh siluet datar — di sana simbol lebih terbaca daripada benda. Pilihan pola `ringed` juga berubah arti: cincin sudah jadi milik logo, jadi di planet ia menjadi **sabuk khatulistiwa**.

### 3.3 Jejak

Digambar di canvas. Tiap planet menyimpan *ring buffer* posisi (40 / 90 / 160 titik sesuai panjang jejak yang dipilih). Tiap frame canvas dibersihkan lalu jejak digambar ulang dengan alpha meruncing dari kepala ke ekor. Biaya untuk 40 planet × 160 titik masih ringan.

Cara ini dipilih ketimbang trik "timpa canvas dengan warna kertas semi-transparan", karena panjang dan gaya jejak harus bisa **berbeda per planet** — dan trik timpa hanya bisa satu laju pudar untuk semuanya.

Bobot tintanya dinaikkan 2026-08-19: versi pertama menggambar garis orbit di alpha 0,13 dan jejak di alpha 0,5 dengan tebal di bawah satu piksel, dengan alasan "panduan pensil sebaiknya berbisik". Di layar sungguhan pemilik **tidak melihatnya sama sekali**. Sekarang garis orbit 0,3 / 0,9px dan jejak 0,85 / 1,1px. Grafit di atas kertas punya gigit lebih dari yang diasumsikan versi pertama.

### 3.4 Sentuhan pengunjung

- Hover/fokus sebuah planet: planet itu **berhenti** di tempat, sisanya melambat ke 50%. Ini mewarisi idiom "hover membekukan kata" yang sudah ada, dan menyelesaikan masalah nyata: target yang bergerak susah diklik.
- Label muncul di atas planet: baris pertama nama usaha, baris kedua `kota · jenis` dengan ukuran lebih kecil.
- Klik membuka website di tab baru, `rel="nofollow ugc noopener noreferrer"`.
- Sentuh (mobile): tap pertama menampilkan label, tap kedua membuka link.

### 3.5 Kustomisasi oleh pemilik usaha

Pilihan **terbatas, dari daftar tetap**. Tidak ada pemilih warna bebas dan tidak ada unggah gambar. Dua alasan: warna bebas akan merusak palet kertas dalam satu submit, dan unggah gambar mengubah antrian persetujuan jadi pekerjaan berat.

**Planet**
- Ukuran: kecil / sedang / besar
- Isi: polos / arsir silang / titik-titik / cincin
- Tinta: grafit `#2B2A27` · merah pensil `var(--accent)` · sepia · biru tinta

**Jejak**
- Gaya: garis tipis / titik-titik / arsir melintang / tanpa jejak
- Panjang: pendek / sedang / panjang

4 tinta × 4 isi × 3 ukuran × 4 gaya jejak × 3 panjang = 576 kombinasi. Cukup untuk terasa milik sendiri, sempit untuk tetap satu halaman kertas.

### 3.6 Penempatan otomatis

- **Tahun berdiri** menentukan radius di dalam bidangnya: makin tua makin dekat ke logo. Ini memberi arti pada jarak, bukan sekadar acak.
- **Jenis usaha** menentukan bentuk dasar glyph (bulat, bercincin, bersudut, dst.) supaya dua planet berbeda tetap bisa dibedakan sekilas.
- **Bidang orbit** ditentukan otomatis dari hash nama, bisa ditimpa manual di admin.
- **Fase awal** dari hash juga, supaya planet tidak menumpuk di satu titik dan posisinya konsisten tiap muat halaman.

### 3.7 Mobile, reduced motion, performa

- Mobile: maksimum 12 planet, bidang C disembunyikan (terlalu lebar), kecepatan 1.5× lebih lambat.
- `prefers-reduced-motion`: tanpa rAF sama sekali. Planet digambar diam di fasenya, jejak digambar sebagai busur elips pudar yang utuh. Halaman tetap terbaca sebagai diagram.
- Batas desktop: 40 planet. Lewat itu, hero menampilkan cuplikan acak-tapi-stabil (benih per hari) dan **daftar lengkapnya hidup di peta manifesto**. Ini harus dirancang sekarang, bukan nanti — kalau fitur ini berhasil, 200 planet di hero akan membunuh halaman.

### 3.8 Nasib kata konstelasi

Commit `5be0b21` baru saja membuat kata-kata ini bisa diedit dari CMS. Planet menggantikannya **di hero**, tapi jangan dihapus dari basis kode: pindahkan ke halaman manifesto atau arsip supaya kolom CMS dan kerja admin itu tetap terpakai. Perlu putusan pemilik: dipindah ke mana.

---

## 4. Model data

Koleksi Payload baru: `businesses`.

| Field | Tipe | Catatan |
|---|---|---|
| `name` | text, wajib | maks 60 karakter |
| `city` | relationship → `cities` | butuh koordinat untuk peta |
| `kind` | select | daftar tetap: klinik, kuliner, kriya, ritel, jasa, pendidikan, lainnya |
| `website` | text, opsional | hanya skema `http`/`https`, divalidasi saat simpan |
| `foundedYear` | number | 1900 … tahun berjalan |
| `planet` | group | `size`, `pattern`, `ink` |
| `trail` | group | `style`, `length` |
| `orbit` | select | A / B / C, terisi otomatis, bisa ditimpa |
| `status` | select | `pending` / `approved` / `rejected`, default `pending`, hanya admin |
| `submittedAt` | date | otomatis |
| `contactEmail` | email, opsional | **tidak pernah** ikut di API publik; hanya supaya pemilik bisa mengabari |

Koleksi pendukung `cities`: `name`, `lat`, `lng`. Diisi awal dengan daftar kota Indonesia.

**Kunci keamanan:** akses `create` publik lewat REST/GraphQL Payload harus dimatikan. Satu-satunya jalan masuk adalah route handler Next yang memakai Local API dan memaksa `status: 'pending'`. Tanpa ini, siapa pun bisa POST langsung ke `/api/businesses` dan antrian persetujuan jadi tidak ada artinya.

Akses `read` publik hanya untuk `status === 'approved'`.

---

## 5. Manifesto — peta dan form

### 5.1 Peta

SVG garis tangan, tanpa tile dan tanpa API key. Kontur diturunkan dari GeoJSON domain publik (Natural Earth 110m), lalu diberi goresan pensil. Proyeksi ekuirektangular sederhana sudah cukup akurat untuk kotak Indonesia (bujur 94,5–141,8, lintang 6,2 LU – 11 LS): regangan timur-barat yang akan dikoreksi Mercator di sini di bawah 2%, lebih kecil dari kesalahan yang sudah melekat di kontur 110m.

Konsekuensi resolusi 110m, dan ini nyata di layar: **Bali tidak ada sama sekali di data sumbernya**, dan semenanjung barat daya Sulawesi disederhanakan melewati titik Makassar. Jadi pin Denpasar dan Makassar duduk sedikit di lepas pantai. Itu sifat konturnya, bukan bug pin — dan `projection.check.ts` menegaskan keduanya, supaya kalau suatu saat kontur yang lebih halus dipakai, dua assertion itu gagal dan minta dihapus.

Pin memakai glyph planet yang sama persis dengan hero — jadi mata langsung menghubungkan "planet di langit" dengan "titik di bumi". Hover pin menampilkan nama yang sama dengan hover planet.

Di bawah peta ada daftar teks lengkapnya. Itu bukan pelengkap: peta SVG sendirian tidak bisa dipakai pembaca layar, dan daftar itu juga rumah bagi planet yang tidak muat di hero.

### 5.2 Form

Ditaruh di manifesto, sesudah peta — posisinya sengaja: orang baru boleh minta tempat setelah membaca apa yang dia setujui.

Isian: nama, kota, jenis, tahun berdiri, website (opsional), lalu pemilih rupa planet dan jejak.

Bagian terbaiknya: **pratinjau langsung**. Sebuah canvas mini menampilkan planet pilihanmu benar-benar mengorbit dengan jejaknya, sebelum kamu kirim. Ini yang mengubah form dari formulir jadi sesuatu yang orang mau selesaikan.

Pengaman meski sudah ada persetujuan manual: kolom umpan (honeypot), tolak kiriman yang selesai di bawah 4 detik, satu kiriman per IP per jam, batas panjang di semua teks. Tujuannya bukan menghentikan spam — persetujuanmu yang menghentikan — tapi supaya antrianmu tidak pernah berisi 300 baris.

---

## 6. Copy seluruh situs

Ditulis ulang, struktur rute tetap. Pergeseran kosakata:

| Sekarang | Menjadi |
|---|---|
| studio / atelier | pusat gravitasi, tempa |
| klien | yang mengorbit |
| portofolio / karya | benda yang sudah berbentuk |
| daftar layanan | apa yang bisa ditempa |

Yang **tidak** boleh berubah: "Empu digital", arti nama Tampo/Taruno, kelima nilai. Itu isi manifesto yang bersumber dari dokumen strategi, dan tema semesta membingkainya — bukan menggantikannya.

Halaman terdampak: beranda, manifesto, work, archive, services, footer, 404. Dua bahasa (en/id) — tiap baris baru harus punya pasangannya.

---

## 7. Alur persetujuan

1. Pengunjung mengirim form → tersimpan `status: 'pending'`.
2. Pemilik membuka admin Payload, saring `status = pending`.
3. Baca nama + website, tekan setujui atau tolak.
4. Setujui memicu revalidate (`src/lib/revalidate.ts` sudah ada) → planet muncul di hero dan peta.

Ini pekerjaan berulang, dan itu memang yang kamu pilih. Perkiraan jujur: satu sampai tiga menit per kiriman, dan tidak akan pernah nol. Kalau suatu saat terasa berat, jalan keluarnya sudah dirancang di atas — matikan form dan tetap tambahkan planet lewat admin; semua bagian lain tetap hidup.

---

## 8. Risiko yang diterima

- **Link website.** Ini alasan nomor satu orang mengirim usaha palsu. `rel="nofollow ugc"` menghapus nilai SEO-nya, tapi tidak menghapus godaannya. Kamu akan melihat kiriman sampah.
- **Hosting belum ada.** SQLite berkas lokal tidak bisa menerima tulisan publik di lingkungan serverless. Fase 3 terkunci sampai ini diputuskan.
- **Hero jadi milik bersama.** Sesudah ini, hal pertama yang dilihat pengunjung sebagian ditentukan orang lain. Itu memang maksudnya, tapi berarti satu planet yang kamu setujui dengan gegabah muncul di halaman depan.
- **Kata konstelasi hilang dari hero.** Suara studio mundur dari halaman depan. Karena itu §3.8 minta kata-kata itu dipindah, bukan dibuang.

---

## 9. Fase pembangunan

**Fase 1 — SUDAH DIBANGUN (2026-08-19), tidak butuh keputusan hosting**

| Bagian | Berkas |
|---|---|
| Mesin orbit | `src/components/hero/OrbitField.tsx` |
| Rupa planet (bola CSS 3D) | `src/components/hero/PlanetSphere.tsx` |
| Siluet datar untuk pin peta | `src/components/hero/PlanetGlyph.tsx` |
| Logo pengganti tanpa WebGL | `src/components/hero/LogoStage.tsx` |
| Geometri + penempatan | `src/lib/orbit/` (+ `placement.check.ts`, ikut `npm run verify:config`) |
| Data | `src/collections/Businesses.ts`, `src/collections/Cities.ts` |
| Query | `getPlanets()` di `src/lib/cms.ts` |
| Kata konstelasi pindah | `src/components/blocks/MarginNotes.tsx`, di manifesto |
| Backfill + demo | `npm run seed:semesta`, `npm run seed:planets-demo` |

`ConstellationField.tsx` dihapus — mesinnya digantikan, riwayatnya tetap di git.

**Fase 2 — SUDAH DIBANGUN (2026-08-19), masih tanpa tulisan publik**

| Bagian | Berkas |
|---|---|
| Proyeksi + graticule | `src/lib/map/projection.ts` (+ `projection.check.ts`) |
| Kontur (hasil generate) | `src/lib/map/indonesiaOutline.ts` |
| Generator kontur | `src/lib/map/buildOutline.ts` — dijalankan manual, GeoJSON sumber tidak ikut di-commit |
| Peta + pin + daftar | `src/components/blocks/WorldMap.tsx` |
| Nama jenis usaha | `src/lib/orbit/labels.ts` |

Pin memakai tanda yang sama persis dengan planet di hero: `PlanetMark` dipecah keluar dari `PlanetGlyph` supaya satu gambar dipakai dua tempat. Pin adalah elemen HTML yang diposisikan persen di atas SVG, bukan `<text>` di dalam viewBox — di dalam viewBox tiap label ikut menyusut, jadi nama yang terbaca di laptop tinggal empat piksel di ponsel.

Ambang 40 planet hero sekarang satu konstanta bersama (`HERO_PLANET_LIMIT`), dan begitu jumlah usaha melewatinya, daftar di peta memberi tahu pembaca bahwa hero cuma memuat sebagian dan bergilir harian.

**Fase 3 — butuh hosting dan DB final**
Route handler kiriman, form dengan pratinjau langsung, pengaman anti-banjir, tampilan antrian di admin.

---

## 10. Yang sudah diputus sambil membangun

1. **Kata konstelasi pindah ke manifesto**, sebagai pita "Kosakata" di bawah bagian nilai. Pita, bukan posisi absolut: ia membungkus, jadi tidak ada kata yang terpotong di ponsel dan tata letaknya selamat saat bahasa berganti. Kolomnya pindah dari blok hero ke Site Settings → `marginNotes`.
2. **Batas 40 planet memakai rotasi harian** (`dailySubset`). Acak murni bikin hero berkedip tiap muat ulang; terbaru-menang mengunci yang datang awal. Kunci tanggal menahan gambar tetap diam sepanjang hari dan tetap memberi giliran ke semua.

## 11. Masih terbuka

1. Daftar jenis usaha final — tujuh yang terpasang baru usulan.
2. Apakah kiriman yang ditolak dikabari lewat email, atau diam saja? (Fase 3.)
3. **Pin berdesakan di ponsel.** Kota-kota Jawa terpaut sekitar satu derajat; di peta selebar 343px itu sekitar sepuluh piksel, jadi 8 dari 66 pasang pin bertumpuk. Pin sengaja **tidak** digeser saling menjauh — itu memindahkan usaha ke tempat yang salah demi gambar yang rapi. Yang dilakukan cuma mengecilkan tanda di bawah 640px, dan daftar di bawah peta yang menuntaskan. Kalau nanti terasa mengganggu, jalan keluarnya pengelompokan berbasis kedekatan dengan label "3 usaha di sini", bukan menggeser pin.
4. Sebaran bidang orbit dari hash bisa timpang pada jumlah kecil — 12 planet demo jatuh 1/5/6. Kolom `orbit` di sidebar admin sudah bisa menimpa manual; perlu diputuskan apakah itu cukup atau penempatannya harus diseimbangkan otomatis.
