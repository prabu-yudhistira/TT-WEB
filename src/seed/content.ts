/**
 * Real bilingual site content.
 *
 * Sources (every claim here traces to one of these — nothing invented):
 * - ../../Tampotaruno/laporan-strategi.md   — mission, values, brand story, tagline,
 *                                             public service list, website strategy
 * - ../../Tampotaruno/ask.md                — founders, base city, name etymology
 * - ../../WorldWideSaaS, WorldWideSaaSWeb   — Business OS, Homeslice
 * - ../../Samsara Atelier, ../../Samsara    — internal AI products
 * - ../../AgencyOS                          — AgencyAI
 *
 * Honesty constraints applied (Tampotaruno has zero paying clients as of 2026-08):
 * - No client names beyond the documented unpaid F&B deployments. Mie Ayam
 *   Sukarame was one of them but is off the site at the owner's request
 *   (2026-08-02) — the project counts below exclude it.
 * - No revenue, adoption, uptime, ROI or percentage figures anywhere.
 * - The only durations used are the ones written in the strategy report
 *   (§4: 30–45 days for Klinik OS, 2 weeks for the Starter website).
 * - `projectCount` counts only verified deliveries; Klinik OS and AI Automation
 *   are 0 because no clinic module and no WhatsApp integration exist yet.
 * - Works whose repos are internal-only say so via the `industry` field.
 */

type T2 = { en: string; id: string }
/** Must stay in sync with the `icon` select options in collections/Services.ts. */
type ServiceIcon = 'strategy' | 'grid' | 'motion' | 'code' | 'pen' | 'layers' | 'camera' | 'spark'

export const content = {
  siteName: 'TAMPA TARUNO',
  email: 'yuthista@gmail.com',
  // No verified public accounts yet — the owner adds real handles in /admin.
  socials: [] as { label: string; url: string }[],

  settings: {
    locationLine: { en: 'Surakarta, ID · GMT+7', id: 'Surakarta, ID · WIB' } as T2,
    navLabels: {
      home: { en: 'Home', id: 'Beranda' } as T2,
      manifesto: { en: 'Manifesto', id: 'Manifesto' } as T2,
      archive: { en: 'Archive', id: 'Arsip' } as T2,
    },
    archiveCountTemplate: { en: '{{count}} in the archive', id: '{{count}} di arsip' } as T2,
    // The studio's own vocabulary. It used to drift around the hero logo;
    // planets took that space (docs/CONCEPT-SEMESTA.md §3.8), so the words moved
    // to the manifesto, where the studio is the one talking.
    marginNotes: {
      en: [
        'empu', 'forged', 'precision', 'graphite',
        'clinic', 'tailored', 'surakarta', 'amanah',
        'keris', 'booking', 'records', 'proof',
      ],
      id: [
        'empu', 'ditempa', 'presisi', 'grafit',
        'klinik', 'tailor-made', 'surakarta', 'amanah',
        'keris', 'booking', 'pasien', 'bukti',
      ],
    },
    seo: {
      title: {
        en: 'Tampa Taruno — Tailor-Made Clinic Systems, Surakarta',
        id: 'Tampa Taruno — Sistem Klinik Tailor-Made, Surakarta',
      } as T2,
      description: {
        en: 'A two-person studio in Surakarta building tailor-made systems for clinics and premium SMEs — records, booking, cashier, WhatsApp reminders. Live in 30–45 days.',
        id: 'Studio dua orang di Surakarta yang membangun sistem tailor-made untuk klinik dan UKM — rekam medis, booking, kasir, reminder WhatsApp. Live dalam 30–45 hari.',
      } as T2,
    },
  },

  hero: {
    // Javanese mottos kept from the original build — deliberate, not placeholder.
    line1: { en: 'Mitreka Satata', id: 'Mitreka Satata' } as T2,
    line2: { en: 'Jer Basuki Mawa Bea', id: 'Jer Basuki Mawa Bea' } as T2,
    scrollCue: { en: 'Scroll', id: 'Scroll' } as T2,
  },

  /**
   * Cities a planet can be pinned to (docs/CONCEPT-SEMESTA.md §4).
   *
   * Coordinates are real — the manifesto map plots from them in phase 2, so a
   * rounded-off guess would put a business in the sea. The list is a starting
   * set, not a limit; the owner adds rows in /admin.
   */
  cities: [
    { name: 'Surakarta', region: 'Jawa Tengah', lat: -7.5755, lng: 110.8243 },
    { name: 'Yogyakarta', region: 'DI Yogyakarta', lat: -7.7956, lng: 110.3695 },
    { name: 'Semarang', region: 'Jawa Tengah', lat: -6.9667, lng: 110.4167 },
    { name: 'Jakarta', region: 'DKI Jakarta', lat: -6.2088, lng: 106.8456 },
    { name: 'Bandung', region: 'Jawa Barat', lat: -6.9175, lng: 107.6191 },
    { name: 'Surabaya', region: 'Jawa Timur', lat: -7.2575, lng: 112.7521 },
    { name: 'Malang', region: 'Jawa Timur', lat: -7.9666, lng: 112.6326 },
    { name: 'Denpasar', region: 'Bali', lat: -8.65, lng: 115.2167 },
    { name: 'Medan', region: 'Sumatera Utara', lat: 3.5952, lng: 98.6722 },
    { name: 'Makassar', region: 'Sulawesi Selatan', lat: -5.1477, lng: 119.4327 },
  ],

  // Section headings carry the universe rework's vocabulary
  // (docs/CONCEPT-SEMESTA.md §6). Only the framing moved — every claim below
  // this block is unchanged, because the honesty constraints at the top of this
  // file do not bend for a theme.
  headings: {
    featuredWorks: { en: 'WHAT HAS TAKEN FORM', id: 'YANG SUDAH BERBENTUK' } as T2,
    services: { en: 'WHAT WE CAN FORGE', id: 'APA YANG BISA DITEMPA' } as T2,
    contact: {
      en: 'The two people who read this are the two who build it.',
      id: 'Pesan ini dibaca dua orang — dan dua orang itu juga yang mengerjakan.',
    } as T2,
  },

  // Six verses, scroll-scrubbed one at a time. Each traces to a value in §1 or
  // the brand story in §8 of the strategy report.
  manifesto: [
    { en: 'Tampo: vessel. Taruno: youth. We are the forge.', id: 'Tampo: wadah. Taruno: pemuda. Kami adalah wadah tempa.' },
    { en: 'Forged, not cast. One system, one owner.', id: 'Ditempa, bukan dicetak. Satu sistem, satu pemilik.' },
    { en: 'Done means tested and documented.', id: 'Selesai berarti teruji dan terdokumentasi.' },
    { en: 'Nothing half-done leaves the bench. We turn work down.', id: 'Tak ada asal jadi. Kami berani bilang tidak.' },
    { en: 'We stay after launch. Your data guarded like life itself.', id: 'Sistem yang hidup. Data Anda dijaga seperti nyawa.' },
    { en: 'Proof over talk. Come see for yourself.', id: 'Bukti, bukan wacana. Silakan lihat sendiri.' },
  ] as T2[],

  services: [
    {
      name: { en: 'Klinik OS', id: 'Klinik OS' },
      tagline: {
        en: 'Your whole clinic runs on one system. Live in 30–45 days.',
        id: 'Seluruh operasional klinik dalam satu sistem. Live dalam 30–45 hari.',
      },
      description: {
        en: 'Registration and queue, patient records, doctor schedules, cashier, stock and owner reports — built on our own Business OS foundation, then configured for your clinic with data migration and staff training.',
        id: 'Pendaftaran dan antrean, rekam medis, jadwal dokter, kasir, stok, dan laporan owner — dibangun di atas fondasi Business OS kami, lalu disesuaikan untuk klinik Anda, lengkap dengan migrasi data dan training staf.',
      },
      capabilities: {
        en: ['Registration & queue', 'Patient records & history', 'Cashier, stock, reports', 'Data migration & training'],
        id: ['Pendaftaran & antrean', 'Rekam medis & riwayat', 'Kasir, stok, laporan', 'Migrasi data & training'],
      },
      icon: 'layers' as ServiceIcon,
      projectCount: 0, // no clinic module built, no clinic deployment
    },
    {
      name: { en: 'AI Automation', id: 'AI Automation' },
      tagline: {
        en: 'Your front desk stops chasing patients.',
        id: 'Resepsionis berhenti mengejar pasien satu per satu.',
      },
      description: {
        en: 'WhatsApp reminders and patient recall, an assistant that answers opening hours, prices and bookings, and a daily recap for the owner. We build only on official WhatsApp Business providers, and nothing goes out without a person approving it.',
        id: 'Reminder dan recall pasien lewat WhatsApp, asisten yang menjawab jam buka, harga, dan booking, serta rekap harian untuk owner. Kami hanya membangun di atas penyedia resmi WhatsApp Business, dan tidak ada pesan keluar tanpa persetujuan manusia.',
      },
      capabilities: {
        en: ['WhatsApp reminder & recall', 'Booking & FAQ assistant', 'Daily owner recap', 'Sent only after approval'],
        id: ['Reminder & recall WhatsApp', 'Asisten booking & FAQ', 'Rekap harian owner', 'Kirim hanya setelah disetujui'],
      },
      icon: 'spark' as ServiceIcon,
      projectCount: 0, // no WhatsApp integration shipped yet
    },
    {
      name: { en: 'Website & Booking', id: 'Website & Booking' },
      tagline: {
        en: 'A clinic site with online booking. Live in two weeks.',
        id: 'Situs klinik dengan booking online. Live dalam dua minggu.',
      },
      description: {
        en: 'A fast clinic site with online booking, a direct WhatsApp line and a Google Business Profile set up for local search. Copy, opening hours and prices stay editable by you — no redeploy, no developer in the loop.',
        id: 'Situs klinik yang cepat dengan booking online, tombol WhatsApp langsung, dan Google Business Profile yang disiapkan untuk pencarian lokal. Teks, jam buka, dan harga tetap bisa Anda ubah sendiri — tanpa deploy ulang, tanpa developer.',
      },
      capabilities: {
        en: ['Online booking', 'Direct WhatsApp line', 'Google Maps & local SEO', 'Owner-editable content'],
        id: ['Booking online', 'WhatsApp langsung', 'Google Maps & SEO lokal', 'Konten bisa diubah sendiri'],
      },
      icon: 'grid' as ServiceIcon,
      projectCount: 1, // Homeslice
    },
    {
      name: { en: 'Tailor-Made Systems', id: 'Sistem Tailor-Made' },
      tagline: {
        en: "Stop bending your business to fit someone else's software.",
        id: 'Berhenti menyesuaikan bisnis Anda dengan software orang lain.',
      },
      description: {
        en: 'For what falls outside the template: POS and back-office, internal tools, integrations. Postgres schema design, row-level security, roles and permissions, automated deploys — delivered in milestones, with maintenance included.',
        id: 'Untuk yang tidak tertampung dalam template: POS dan back-office, tools internal, integrasi. Desain skema Postgres, row-level security, role dan hak akses, deploy otomatis — dikerjakan per milestone, lengkap dengan maintenance.',
      },
      capabilities: {
        en: ['POS & back-office', 'Postgres schema & RLS', 'Roles & permissions', 'Auto deploy & backup'],
        id: ['POS & back-office', 'Skema Postgres & RLS', 'Role & hak akses', 'Deploy otomatis & backup'],
      },
      icon: 'code' as ServiceIcon,
      projectCount: 1, // Business OS
    },
  ],

  works: [
    {
      title: { en: 'Homeslice', id: 'Homeslice' },
      slug: 'homeslice',
      category: 'web' as const,
      year: 2026,
      oneLiner: {
        en: 'Data-driven restaurant site with online ordering and floor-plan table booking.',
        id: 'Situs restoran data-driven dengan online ordering dan booking meja lewat denah.',
      },
      servicesLine: {
        en: 'Web Design, Frontend, Supabase Integration',
        id: 'Desain Web, Frontend, Integrasi Supabase',
      },
      industry: { en: 'F&B — Restaurant', id: 'F&B — Restoran' },
      location: { en: 'Surakarta, Indonesia', id: 'Surakarta, Indonesia' },
      featured: true,
    },
    {
      title: { en: 'Business OS', id: 'Business OS' },
      slug: 'business-os',
      category: 'engineering' as const,
      year: 2026,
      oneLiner: {
        en: 'Multi-tenant data layer: one database per business, row-level security throughout.',
        id: 'Lapisan data multi-tenant: satu database per bisnis, row-level security menyeluruh.',
      },
      servicesLine: {
        en: 'Data Architecture, Backend, Security Engineering',
        id: 'Arsitektur Data, Backend, Security Engineering',
      },
      industry: { en: 'Internal Platform', id: 'Platform Internal' },
      location: { en: 'Surakarta, Indonesia', id: 'Surakarta, Indonesia' },
      featured: true,
    },
    {
      title: { en: 'Samsara Atelier', id: 'Samsara Atelier' },
      slug: 'samsara-atelier',
      category: 'engineering' as const,
      year: 2026,
      oneLiner: {
        en: 'Agent runtime behind a third-party job map: each node runs a Gemini agent with RAG.',
        id: 'Runtime agent untuk peta job pihak ketiga: tiap node menjalankan agent Gemini + RAG.',
      },
      servicesLine: {
        en: 'Full-stack, AI Agents, Product Definition',
        id: 'Full-stack, AI Agent, Definisi Produk',
      },
      industry: { en: 'Internal Product', id: 'Produk Internal' },
      location: { en: 'Surakarta, Indonesia', id: 'Surakarta, Indonesia' },
      featured: true,
    },
    {
      title: { en: 'Samsara Second Brain', id: 'Samsara Second Brain' },
      slug: 'samsara-second-brain',
      category: 'engineering' as const,
      year: 2026,
      oneLiner: {
        en: 'Private Telegram assistant: reads your files, answers, and confirms before acting.',
        id: 'Asisten Telegram pribadi: membaca file Anda, menjawab, konfirmasi sebelum bertindak.',
      },
      servicesLine: {
        en: 'Backend (Python), AI Agents, Automation',
        id: 'Backend (Python), AI Agent, Automation',
      },
      industry: { en: 'Internal Tooling', id: 'Tooling Internal' },
      location: { en: 'Surakarta, Indonesia', id: 'Surakarta, Indonesia' },
      featured: false,
    },
    {
      title: { en: 'AgencyAI', id: 'AgencyAI' },
      slug: 'agencyai',
      category: 'engineering' as const,
      year: 2026,
      oneLiner: {
        en: 'Telegram-first ingest backend with architecture boundaries enforced in CI.',
        id: 'Backend ingest berbasis Telegram; batas arsitektur dijaga otomatis di CI.',
      },
      servicesLine: {
        en: 'Software Architecture, Backend, DevOps',
        id: 'Arsitektur Software, Backend, DevOps',
      },
      industry: { en: 'Internal Platform', id: 'Platform Internal' },
      location: { en: 'Surakarta, Indonesia', id: 'Surakarta, Indonesia' },
      featured: false,
    },
  ],
}
