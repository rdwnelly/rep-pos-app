import { useState } from 'react';

/**
 * Jumlah baris yang ditampilkan pada daftar bergulir, yang kembali ke
 * awal setiap kali penyaringnya berubah.
 *
 * Tujuh layar menulis pola yang sama persis:
 *
 *     const [visibleCount, setVisibleCount] = useState(20);
 *     useEffect(() => { setVisibleCount(20); }, [search, kategori]);
 *
 * Pola itu bekerja, tapi caranya mahal dan menipu mata: React merender
 * dulu dengan jumlah LAMA, menampilkannya, menjalankan efek, lalu
 * merender ulang dengan jumlah yang benar. Pada daftar panjang di HP,
 * render pertama itu sempat terlihat — pengguna mengganti filter dan
 * melihat sekilas hasil lama sebelum daftarnya melompat ke atas.
 *
 * Di sini penyesuaiannya dilakukan SAAT RENDER. Itu pola yang
 * dianjurkan React untuk "menyesuaikan state ketika masukannya
 * berubah": React membuang hasil render yang belum sempat dipakai dan
 * langsung mengulang dengan nilai baru, tanpa commit perantara dan
 * tanpa efek. Perbandingannya memastikan ini berhenti setelah satu kali,
 * bukan lingkaran.
 *
 * Kuncinya diserialkan supaya penyaring berupa objek — `sortConfig`,
 * misalnya — dibandingkan menurut isinya, bukan menurut identitas
 * referensinya yang berubah tiap render.
 */
export const useDaftarBertahap = (
  awal: number,
  penyaring: unknown[],
): readonly [number, React.Dispatch<React.SetStateAction<number>>] => {
  const kunci = JSON.stringify(penyaring);

  const [kunciTerakhir, setKunciTerakhir] = useState(kunci);
  const [jumlahTampil, setJumlahTampil] = useState(awal);

  if (kunciTerakhir !== kunci) {
    setKunciTerakhir(kunci);
    setJumlahTampil(awal);
  }

  return [jumlahTampil, setJumlahTampil] as const;
};
