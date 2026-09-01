import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

export async function POST(req: Request) {
  try {
    const { productName, category, hpp } = await req.json();

    if (!productName || !hpp) {
      return NextResponse.json({ error: 'Nama produk dan HPP wajib diisi.' }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'PLACEHOLDER_API_KEY') {
      return NextResponse.json({ error: 'GEMINI_API_KEY belum dikonfigurasi di file .env.local' }, { status: 500 });
    }

    const ai = new GoogleGenAI({ apiKey });

    const prompt = `Anda adalah seorang konsultan harga (Pricing Consultant) untuk sebuah kafe dan toko suvenir (Rumah Etnik Papua / REP) di Papua.
Target pasar mencakup pengunjung lokal, rombongan pelajar, hingga turis mancanegara.

Informasi Produk:
- Nama Produk: ${productName}
- Kategori: ${category || '-'}
- HPP (Harga Pokok Penjualan / Modal Murni per porsi): Rp ${hpp}

Tugas:
Berikan rekomendasi 3 tingkat harga jual (Ekonomis, Standar, Premium) berdasarkan HPP tersebut.
Aturan Margin:
- Ekonomis: Margin 15% - 25% (Fokus pada kuantitas / pelajar)
- Standar: Margin 30% - 45% (Harga normal wajar di buku menu)
- Premium: Margin 50%++ (Untuk turis internasional atau jika kemasan sangat eksklusif)

PENTING: Output Anda HARUS berupa murni valid JSON Array tanpa blok formatting markdown.
Format JSON yang diwajibkan:
[
  {
    "tier": "Ekonomis",
    "price": <angka harga bulat ribuan>,
    "marginPercentage": <angka persentase>,
    "reasoning": "<alasan singkat>"
  },
  {
    "tier": "Standar",
    "price": <angka harga bulat ribuan>,
    "marginPercentage": <angka persentase>,
    "reasoning": "<alasan singkat>"
  },
  {
    "tier": "Premium",
    "price": <angka harga bulat ribuan>,
    "marginPercentage": <angka persentase>,
    "reasoning": "<tips eksklusif>"
  }
]`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
      }
    });

    const responseText = response.text || "[]";
    const result = JSON.parse(responseText);

    return NextResponse.json({ success: true, data: result });
  } catch (error: any) {
    console.error('Gemini API Error:', error);
    return NextResponse.json({ error: 'Gagal menghubungi AI: ' + error.message }, { status: 500 });
  }
}
