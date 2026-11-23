/**
 * Menghapus visitor log yang BUKAN dari penjualan Tiket Masuk.
 * Menggunakan token Firebase CLI via REST API Firestore.
 *
 * Pemakaian:
 *   node scripts/cleanup-non-ticket-visitors.mjs            # laporan saja
 *   node scripts/cleanup-non-ticket-visitors.mjs --apply    # hapus dokumen
 */
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const apply = process.argv.includes('--apply');
const PROJECT_ID = 'rep-pos-app';

// Ambil token dari Firebase CLI configstore
const configPath = join(homedir(), '.config/configstore/firebase-tools.json');
const config = JSON.parse(readFileSync(configPath, 'utf8'));
const refreshToken = config.tokens?.refresh_token;

if (!refreshToken) {
  console.error('Token Firebase CLI tidak ditemukan. Jalankan: firebase login');
  process.exit(1);
}

// Tukar refresh token → access token
async function getAccessToken() {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com',
      client_secret: 'j9iVZfS8kkCEFUPaAeJV0sAi',
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error('Gagal mendapatkan access token: ' + JSON.stringify(data));
  return data.access_token;
}

const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

async function listAllDocs(token) {
  const docs = [];
  let pageToken = null;

  do {
    const url = new URL(`${BASE}/visitor_logs`);
    url.searchParams.set('pageSize', '300');
    if (pageToken) url.searchParams.set('pageToken', pageToken);

    const res = await fetch(url.toString(), {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const data = await res.json();

    if (data.documents) docs.push(...data.documents);
    pageToken = data.nextPageToken || null;
  } while (pageToken);

  return docs;
}

function extractField(doc, field) {
  const f = doc.fields?.[field];
  if (!f) return undefined;
  if ('stringValue' in f) return f.stringValue;
  if ('integerValue' in f) return Number(f.integerValue);
  if ('arrayValue' in f) {
    return (f.arrayValue.values || []).map(v => v.stringValue || v.integerValue || '');
  }
  return undefined;
}

async function deleteDoc(token, name) {
  const res = await fetch(`https://firestore.googleapis.com/v1/${name}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${token}` },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gagal hapus ${name}: ${err}`);
  }
}

const TIKET_MASUK = 'TIKET_MASUK';

async function main() {
  console.log(`Project: ${PROJECT_ID}`);
  console.log('Mengambil access token...');
  const token = await getAccessToken();
  console.log('Membaca koleksi visitor_logs...\n');

  const allDocs = await listAllDocs(token);
  console.log(`Total dokumen visitor_logs: ${allDocs.length}`);

  const toDelete = [];
  const toKeep = [];

  allDocs.forEach(doc => {
    const id = doc.name.split('/').pop();
    const services = extractField(doc, 'serviceTypes') || [];
    const hasTicket = Array.isArray(services) && services.includes(TIKET_MASUK);

    const info = {
      name: doc.name,
      id,
      date: extractField(doc, 'date') || '-',
      originRegion: extractField(doc, 'originRegion') || '-',
      paxTotal: extractField(doc, 'paxTotal') || 0,
      serviceTypes: services,
      source: extractField(doc, 'source') || 'manual',
    };

    if (hasTicket) toKeep.push(info);
    else toDelete.push(info);
  });

  console.log(`Dokumen yang BUKAN dari Tiket Masuk: ${toDelete.length}`);
  console.log(`Dokumen yang tetap dipertahankan:    ${toKeep.length}\n`);

  if (toDelete.length === 0) {
    console.log('✓ Tidak ada dokumen yang perlu dihapus.');
    if (toKeep.length > 0) {
      console.log('\nDokumen yang dipertahankan:');
      toKeep.forEach((d, i) => {
        console.log(`  ${i+1}. ${d.id} | ${(d.date||'').slice(0,10)} | ${d.paxTotal} pax | [${(d.serviceTypes||[]).join(', ')}]`);
      });
    }
    return;
  }

  // Tampilkan rincian
  console.log('Daftar yang akan dihapus:');
  console.log('─'.repeat(100));
  toDelete.forEach((d, i) => {
    console.log(
      `  ${String(i + 1).padStart(3)}. ${d.id}  |  ${(d.date || '').slice(0, 10)}  |  ` +
      `${(d.originRegion || '-').toString().padEnd(20)}  |  ${d.paxTotal} pax  |  ` +
      `[${(d.serviceTypes || []).join(', ') || 'kosong'}]  |  ${d.source}`
    );
  });
  console.log('─'.repeat(100));

  if (!apply) {
    console.log('\n⚠  Mode laporan saja. Jalankan ulang dengan --apply untuk menghapus:');
    console.log('   node scripts/cleanup-non-ticket-visitors.mjs --apply');
    return;
  }

  console.log('\nMenghapus...');
  let deleted = 0;
  for (const d of toDelete) {
    await deleteDoc(token, d.name);
    deleted++;
    if (deleted % 10 === 0 || deleted === toDelete.length) {
      console.log(`  Terhapus ${deleted} / ${toDelete.length}`);
    }
  }

  console.log(`\n✓ Selesai. ${deleted} dokumen dihapus dari visitor_logs.`);
}

main().catch(err => {
  console.error('Gagal:', err.message || err);
  process.exit(1);
});
