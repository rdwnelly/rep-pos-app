import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

/**
 * Ubah satu elemen HTML menjadi berkas PDF A4 yang langsung terunduh.
 *
 * Perbedaannya dengan pembuatan PDF yang sudah ada di layar lain: isi
 * yang melebihi satu halaman DIPECAH menjadi beberapa halaman, bukan
 * dipotong. Pembuat PDF di Laporan Bulanan memakai
 *
 *     pdf.addImage(img, "PNG", 0, 0, lebar, Math.min(tinggiHalaman, tinggiGambar))
 *
 * yang diam-diam membuang segala sesuatu di bawah batas halaman
 * pertama. Untuk laporan yang panjangnya mengikuti jumlah data — daftar
 * daerah asal bisa 5 baris, bisa 50 — perilaku itu berarti kehilangan
 * data tanpa peringatan apa pun.
 */

const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;

export interface PdfExportOptions {
  /** Lebar render dalam piksel. 794 ≈ A4 pada 96 dpi. */
  renderWidth?: number;
  /** Skala html2canvas. 2 memberi teks yang tajam saat dicetak. */
  scale?: number;
}

/**
 * Cari titik potong yang tidak membelah satu pun elemen bertanda
 * `data-pdf-block`.
 *
 * html2canvas menghasilkan satu gambar panjang; CSS `break-inside`
 * tidak berlaku lagi di sana. Tanpa penyesuaian ini, batas halaman bisa
 * jatuh di tengah tabel atau — seperti yang terjadi pada cetakan
 * pertama — membelah blok tanda tangan, sehingga "Dibuat oleh,"
 * tertinggal di satu halaman dan namanya pindah ke halaman berikutnya.
 *
 * Batas yang jatuh di tengah sebuah blok dimundurkan ke awal blok itu,
 * sehingga blok utuh ikut ke halaman berikutnya. Blok yang memang lebih
 * tinggi dari satu halaman dibiarkan terpotong — tidak ada pilihan lain
 * untuk itu, dan memundurkannya akan membuat perulangan tak berujung.
 */
const batasAman = (
  idealEnd: number,
  pageStart: number,
  blocks: { top: number; bottom: number }[],
  canvasHeight: number,
): number => {
  if (idealEnd >= canvasHeight) return canvasHeight;

  let hasil = idealEnd;
  for (const b of blocks) {
    const terbelah = b.top > pageStart && b.top < idealEnd && b.bottom > idealEnd;
    if (!terbelah) continue;
    // Blok lebih tinggi dari satu halaman penuh: tidak mungkin dihindari.
    if (b.bottom - b.top > idealEnd - pageStart) continue;
    hasil = Math.min(hasil, b.top);
  }

  // Jaga agar selalu maju; kalau tidak, perulangannya tidak berhenti.
  return hasil > pageStart ? hasil : idealEnd;
};

export const exportElementToPdf = async (
  element: HTMLElement,
  fileName: string,
  options: PdfExportOptions = {},
): Promise<void> => {
  const { renderWidth = 794, scale = 2 } = options;

  // Posisi tiap blok diukur SEBELUM render, dalam koordinat elemen,
  // lalu dikalikan skala agar sebanding dengan piksel kanvas.
  const elementTop = element.getBoundingClientRect().top;
  const blocks = Array.from(element.querySelectorAll<HTMLElement>('[data-pdf-block]')).map(el => {
    const r = el.getBoundingClientRect();
    return { top: (r.top - elementTop) * scale, bottom: (r.bottom - elementTop) * scale };
  });

  const canvas = await html2canvas(element, {
    scale,
    useCORS: true,
    logging: false,
    backgroundColor: '#ffffff',
    windowWidth: renderWidth,
  });

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });

  // Tinggi satu halaman A4 bila diukur dalam piksel kanvas.
  const pageHeightPx = Math.floor((A4_HEIGHT_MM / A4_WIDTH_MM) * canvas.width);

  let offsetY = 0;
  let halaman = 0;
  while (offsetY < canvas.height) {
    const akhir = batasAman(offsetY + pageHeightPx, offsetY, blocks, canvas.height);
    const sliceHeight = Math.min(akhir, canvas.height) - offsetY;

    // Tiap halaman dipotong ke kanvas sendiri. Menggambar ulang seperti
    // ini lebih andal daripada menggeser satu gambar besar dengan
    // koordinat negatif, yang pada jsPDF menyisakan garis tepi.
    const slice = document.createElement('canvas');
    slice.width = canvas.width;
    slice.height = sliceHeight;
    const ctx = slice.getContext('2d');
    if (!ctx) break;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, slice.width, slice.height);
    ctx.drawImage(canvas, 0, offsetY, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight);

    const sliceHeightMm = (sliceHeight * A4_WIDTH_MM) / canvas.width;
    if (halaman > 0) pdf.addPage();
    pdf.addImage(slice.toDataURL('image/png'), 'PNG', 0, 0, A4_WIDTH_MM, sliceHeightMm);

    offsetY += sliceHeight;
    halaman += 1;
  }

  pdf.save(fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`);
};
