/**
 * Manifesto page copy, bilingual.
 *
 * Page-level copy, not CMS-managed — same as the studio facts that already
 * lived in the page component. Sourced from Tampotaruno/laporan-strategi.md:
 * section 8 for the brand story and name, section 1 for the philosophy and the
 * five values, ask.md for the founders. The same honesty rules as
 * seed/content.ts apply: no clients, no metrics, no claims we cannot show.
 *
 * If the owner needs to edit this without a deploy, it should move to a Payload
 * global — see README.
 */

type T2 = { en: string; id: string }

export const manifesto = {
  name: {
    eyebrow: { en: 'The name', id: 'Nama' } as T2,
    parts: [
      { word: 'Tampo', gloss: { en: 'the vessel', id: 'wadah' } as T2 },
      { word: 'Taruno', gloss: { en: 'the young', id: 'pemuda' } as T2 },
    ],
    body: {
      en: 'An ancestral name, brought back into use. Tampa Taruno is the forge: young talent goes in with raw ability and comes out making systems that hold. Javanese inheritance, built to a global standard.',
      id: 'Nama leluhur yang dihidupkan kembali. Tampa Taruno adalah wadah tempa: bakat muda masuk mentah, keluar menghasilkan sistem yang bisa diandalkan. Warisan Jawa, standar global.',
    } as T2,
  },

  philosophy: {
    eyebrow: { en: 'How we work', id: 'Cara kami bekerja' } as T2,
    lead: { en: 'Empu digital.', id: 'Empu digital.' } as T2,
    body: {
      en: 'A keris is forged for one owner, never stamped out by the hundred. We work the same way — but the patience goes into the detail, not the schedule. Roughly four fifths of what you get is a platform we have already built and hardened; the last fifth is cut for your business alone. That is the only way tailor-made survives contact with a deadline.',
      id: 'Keris ditempa untuk satu pemilik, bukan dicetak massal. Cara kami sama — tapi kesabarannya ada di detail, bukan di jadwal. Kira-kira empat perlima dari yang Anda terima adalah platform yang sudah kami bangun dan uji; seperlima terakhir ditempa khusus untuk bisnis Anda. Hanya dengan begitu tailor-made sanggup menghadapi tenggat.',
    } as T2,
  },

  values: {
    eyebrow: { en: 'What we hold to', id: 'Yang kami pegang' } as T2,
    items: [
      {
        term: { en: 'Presisi', id: 'Presisi' } as T2,
        meaning: {
          en: 'Done means tested and documented. There is no "good enough for now".',
          id: 'Selesai berarti teruji dan terdokumentasi. Tidak ada "asal jadi".',
        } as T2,
      },
      {
        term: { en: 'Amanah', id: 'Amanah' } as T2,
        meaning: {
          en: 'Your data is your livelihood. Row-level security and backups are not optional extras.',
          id: 'Data Anda adalah nyawa usaha Anda. Row-level security dan backup bukan tambahan opsional.',
        } as T2,
      },
      {
        term: { en: 'Fokus', id: 'Fokus' } as T2,
        meaning: {
          en: 'We turn down work outside what we do well. Every stray yes is a no to the platform.',
          id: 'Kami menolak pekerjaan di luar fokus. Setiap ya yang melenceng adalah tidak untuk platform.',
        } as T2,
      },
      {
        term: { en: 'Leverage', id: 'Leverage' } as T2,
        meaning: {
          en: 'Two people on the right platform cover the ground of six. Repeating manual work by hand is a system failure, not diligence.',
          id: 'Dua orang di atas platform yang tepat menutup pekerjaan enam orang. Kerja manual berulang adalah kegagalan sistem, bukan ketekunan.',
        } as T2,
      },
      {
        term: { en: 'Karya nyata', id: 'Karya nyata' } as T2,
        meaning: {
          en: 'Proof beats talk. Ask to see the thing running.',
          id: 'Bukti mengalahkan wacana. Minta lihat sistemnya jalan.',
        } as T2,
      },
    ],
  },

  // Explains the planets in the hero (docs/CONCEPT-SEMESTA.md §6). Written for
  // what is true in phase 1: the owner adds planets from the admin. It promises
  // no public form, because there is not one yet.
  semesta: {
    eyebrow: { en: 'The universe', id: 'Semesta' } as T2,
    lead: {
      en: 'The logo is a centre of gravity, not an emblem.',
      id: 'Logo ini pusat gravitasi, bukan lambang.',
    } as T2,
    body: {
      en: 'Every planet orbiting the front page is one business standing behind this manifesto. Not a client list and not an advertisement — a statement that the way of working written on this page is theirs too. The oldest orbit closest, and each planet leaves a mark of its own. For now they are added from here, one at a time.',
      id: 'Setiap planet yang mengorbit di halaman depan adalah satu usaha yang berdiri di belakang manifesto ini. Bukan daftar klien, bukan iklan — pernyataan bahwa cara kerja yang tertulis di halaman ini juga cara kerja mereka. Yang paling tua mengorbit paling dekat, dan tiap planet meninggalkan jejaknya sendiri. Untuk sekarang planet ditambahkan dari sini, satu per satu.',
    } as T2,
  },

  // Copy for the drawn map (docs/CONCEPT-SEMESTA.md §5.1). The empty state is
  // written to be true on day one, when nothing has been approved yet.
  map: {
    eyebrow: { en: 'The map', id: 'Peta' } as T2,
    lead: {
      en: 'Those orbits have addresses.',
      id: 'Orbit itu punya alamat.',
    } as T2,
    empty: {
      en: 'No planet has been approved yet. This map fills in as the first businesses arrive.',
      id: 'Belum ada planet yang disetujui. Peta ini terisi begitu usaha pertama masuk.',
    } as T2,
    listHeading: { en: 'The full list', id: 'Daftar lengkap' } as T2,
    // Only rendered once there are more businesses than the hero can carry.
    // {{limit}} is replaced at render.
    overflow: {
      en: 'The hero carries {{limit}} planets at a time and rotates them daily. This list is all of them.',
      id: 'Hero hanya memuat {{limit}} planet sekaligus dan bergilir tiap hari. Daftar ini lengkap.',
    } as T2,
  },

  founders: {
    eyebrow: { en: 'Who you get', id: 'Siapa yang mengerjakan' } as T2,
    body: {
      en: 'Two people, and you deal with both of us. azin builds — full-stack, database, deployment. Prabu holds the business side and asks the hard questions early.',
      id: 'Dua orang, dan Anda berurusan dengan keduanya. azin yang membangun — full-stack, database, deployment. Prabu memegang sisi bisnis dan mengajukan pertanyaan sulit sejak awal.',
    } as T2,
  },
}
