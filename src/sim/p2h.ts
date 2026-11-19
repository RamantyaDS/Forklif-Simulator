// P2H (Pemeriksaan Pra-penggunaan Harian): the operator's daily walk-around before the shift. Each point has what a
// good unit shows and what a faulty one shows; a few faults are hidden at random. Some faults also act on the
// simulation (no horn, an air leak that keeps the parking brake on, a dead lamp, a flat tyre).

export interface P2hItem {
  id: string;
  label: string;
  where: [number, number, number]; // body frame (x left, y up, z toward the forks) for the marker
  needs?: 'engine' | 'lights';
  ok: string;
  bad: string;
}

export const P2H_ITEMS: P2hItem[] = [
  { id: 'tyreFL', label: 'Ban depan kiri', where: [1.35, 0.7, 0], ok: 'Tekanan 9,8 bar (standar 10). Tapak rata, tidak ada sobekan.', bad: 'Tekanan 6,1 bar, ban terlihat kempis. Dinding samping menggembung.' },
  { id: 'tyreFR', label: 'Ban depan kanan', where: [-1.35, 0.7, 0], ok: 'Tekanan 10,1 bar. Mur roda lengkap dan kencang.', bad: 'Sobekan 12 cm di dinding samping, benang ban terlihat.' },
  { id: 'tyreR', label: 'Ban belakang (kemudi)', where: [1.25, 0.7, -3.95], ok: 'Tekanan 9,9 bar, tapak masih 18 mm.', bad: 'Satu mur roda hilang, dua lainnya longgar (bekas karat di sekeliling mur).' },
  { id: 'fork', label: 'Garpu (heel & ujung)', where: [0.8, 0.35, 1.4], ok: 'Tidak ada retak di tekukan (heel). Ketebalan heel 98 mm (aus 2%).', bad: 'Retak rambut di tekukan garpu kiri. Garpu retak WAJIB diganti, tidak boleh dilas.' },
  { id: 'chain', label: 'Rantai mast', where: [0.5, 2.2, 0.75], ok: 'Pemanjangan rantai 0,8% (batas 2%). Tegangan kiri-kanan sama.', bad: 'Pemanjangan rantai 3,4% (batas 2%), satu pin terlihat menonjol.' },
  { id: 'leak', label: 'Kebocoran oli hidrolik', where: [0, 0.15, 0.45], ok: 'Lantai di bawah mast kering. Selang dan fitting tidak rembes.', bad: 'Genangan oli di bawah mast; selang silinder angkat kiri rembes.' },
  { id: 'oil', label: 'Oli mesin (dipstick)', where: [-1.45, 1.4, -2.6], ok: 'Level di antara L dan H, warna cokelat jernih.', bad: 'Level di bawah tanda L. Tambah oli SAE 15W-40 sebelum operasi.' },
  { id: 'coolant', label: 'Air radiator', where: [0, 2.0, -4.9], ok: 'Level di garis FULL tangki cadangan.', bad: 'Tangki cadangan kosong, ada bekas rembesan di selang bawah radiator.' },
  { id: 'belt', label: 'Sabuk pengaman', where: [0, 2.2, -0.9], ok: 'Mengunci saat ditarik cepat, anyaman utuh.', bad: 'Anyaman sabuk sobek dekat gesper, tidak mengunci saat ditarik cepat.' },
  { id: 'apar', label: 'APAR (pemadam api)', where: [1.45, 1.8, -1.6], ok: 'Jarum manometer di zona hijau, segel utuh, label inspeksi bulan ini.', bad: 'Jarum manometer di zona merah (tekanan habis).' },
  { id: 'horn', label: 'Klakson', where: [0, 2.5, -0.55], needs: 'engine', ok: 'Klakson berbunyi keras (tekan B / tombol Klakson).', bad: 'Klakson tidak berbunyi saat ditekan.' },
  { id: 'lamp', label: 'Lampu kerja & rotary', where: [0.9, 3.5, 0.2], needs: 'lights', ok: 'Semua lampu kerja dan lampu rotary menyala.', bad: 'Lampu kerja depan kanan mati.' },
  { id: 'air', label: 'Tekanan angin rem', where: [0.3, 2.3, -0.5], needs: 'engine', ok: 'Naik ke 8,3 bar lalu kompresor berhenti (governor).', bad: 'Jarum tertahan di ±5 bar: ada kebocoran. Rem parkir tidak bisa lepas.' },
];

/** 2 or 3 random faults for a P2H run. */
export function pickDefects(rand = Math.random) {
  const ids = P2H_ITEMS.map((i) => i.id);
  const n = 2 + (rand() < 0.5 ? 1 : 0);
  const out: string[] = [];
  while (out.length < n) {
    const id = ids[Math.floor(rand() * ids.length)];
    if (!out.includes(id)) out.push(id);
  }
  return out;
}
