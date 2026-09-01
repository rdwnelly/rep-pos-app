import React, { useEffect, useRef, useState, useMemo } from 'react';
import QRCode from 'qrcode';
import { BankAccount } from '../../types';
import { formatIDR } from '../../utils';
import { QrCode, Copy, Check, Download, AlertTriangle } from 'lucide-react';

interface PaymentQRCodeProps {
  amount: number;
  bank: BankAccount;
  storeName?: string;
  size?: number;
}

// ==========================================
// QRIS (Quick Response Code Indonesian Standard)
// EMV QR Code Merchant Presented Mode (MPM)
// ==========================================

/** Parse a QRIS/EMV TLV string into an array of { tag, value } */
function parseTLV(data: string): { tag: string; value: string }[] {
  const result: { tag: string; value: string }[] = [];
  let i = 0;
  while (i + 4 <= data.length) {
    const tag = data.substring(i, i + 2);
    const len = parseInt(data.substring(i + 2, i + 4), 10);
    if (isNaN(len) || i + 4 + len > data.length) break;
    const value = data.substring(i + 4, i + 4 + len);
    result.push({ tag, value });
    i += 4 + len;
  }
  return result;
}

/** Encode a TLV element */
function encodeTLV(tag: string, value: string): string {
  return `${tag}${value.length.toString().padStart(2, '0')}${value}`;
}

/** CRC-16/CCITT-FALSE calculation for QRIS */
function calculateCRC16(data: string): string {
  let crc = 0xFFFF;
  for (let i = 0; i < data.length; i++) {
    crc ^= data.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if (crc & 0x8000) {
        crc = (crc << 1) ^ 0x1021;
      } else {
        crc <<= 1;
      }
      crc &= 0xFFFF;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/**
 * Convert a QRIS static code to dynamic with a specific amount.
 * - Changes Point of Initiation (tag 01) from "11" (static) to "12" (dynamic)
 * - Adds/updates Transaction Amount (tag 54)
 * - Recalculates CRC (tag 63)
 */
function generateDynamicQRIS(staticQris: string, amount: number): string {
  const elements = parseTLV(staticQris);

  // Rebuild the QRIS string
  let result = '';

  // Track which tags we've processed
  let hasTag54 = false;

  for (const el of elements) {
    // Skip CRC - we'll recalculate
    if (el.tag === '63') continue;

    if (el.tag === '01') {
      result += encodeTLV('01', '12'); // Change to dynamic
    } else if (el.tag === '54') {
      result += encodeTLV('54', amount.toString());
    } else {
      result += encodeTLV(el.tag, el.value);
    }

    // Inject 54 right after 53 if it didn't exist
    if (el.tag === '53' && !hasTag54) {
      result += encodeTLV('54', amount.toString());
      hasTag54 = true;
    }
  }

  // Fallback if 53 was somehow missing too
  if (!hasTag54) {
    result += encodeTLV('54', amount.toString());
  }

  const crcPlaceholder = result + '6304';
  const crc = calculateCRC16(crcPlaceholder);
  return crcPlaceholder + crc;
}

/** Validate if a string looks like a valid QRIS code */
function isValidQRIS(code: string): boolean {
  if (!code || code.length < 20) return false;
  // QRIS always starts with "000201" (Payload Format Indicator = "01")
  if (!code.startsWith('000201')) return false;
  // Should contain tag 63 (CRC)
  if (!code.includes('6304')) return false;
  return true;
}

export const PaymentQRCode: React.FC<PaymentQRCodeProps> = ({ amount, bank, storeName, size = 220 }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [copied, setCopied] = useState(false);
  const [isGenerated, setIsGenerated] = useState(false);

  const hasQris = bank.qrisCode && isValidQRIS(bank.qrisCode.trim());

  // Generate the QR payload
  const qrPayload = useMemo(() => {
    if (hasQris && bank.qrisCode) {
      // Generate dynamic QRIS with the transaction amount
      return generateDynamicQRIS(bank.qrisCode.trim(), amount);
    }
    // Fallback: show bank transfer info as text
    return `Transfer ${bank.bankName}\nNo. Rek: ${bank.accountNumber}\na.n. ${bank.holderName}\nJumlah: ${formatIDR(amount)}`;
  }, [hasQris, bank.qrisCode, bank.bankName, bank.accountNumber, bank.holderName, amount]);

  useEffect(() => {
    if (canvasRef.current) {
      setIsGenerated(false);
      QRCode.toCanvas(canvasRef.current, qrPayload, {
        width: size,
        margin: 2,
        color: {
          dark: '#1e293b',
          light: '#ffffff',
        },
        errorCorrectionLevel: hasQris ? 'M' : 'L',
      }, (error) => {
        if (error) {
          console.error('QR Code generation error:', error);
        } else {
          setIsGenerated(true);
        }
      });
    }
  }, [qrPayload, hasQris, size]);

  const handleCopyAccount = async () => {
    try {
      await navigator.clipboard.writeText(bank.accountNumber);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      const textArea = document.createElement('textarea');
      textArea.value = bank.accountNumber;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownloadQR = () => {
    if (canvasRef.current) {
      const link = document.createElement('a');
      link.download = `qr-payment-${bank.bankName}-${amount}.png`;
      link.href = canvasRef.current.toDataURL('image/png');
      link.click();
    }
  };

  return (
    <div className="qr-payment-container">
      {/* QR Code Card */}
      <div className="relative bg-gradient-to-br from-slate-50 to-blue-50/50 rounded-xl border border-slate-200/80 p-4 overflow-hidden">
        {/* Decorative pattern */}
        <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-primary/5 to-transparent rounded-bl-full" />
        <div className="absolute bottom-0 left-0 w-16 h-16 bg-gradient-to-tr from-blue-500/5 to-transparent rounded-tr-full" />

        {/* Header */}
        <div className="flex items-center gap-2 mb-3 relative">
          <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${hasQris ? 'bg-primary/10' : 'bg-amber-100'}`}>
            <QrCode size={16} className={hasQris ? 'text-primary' : 'text-amber-600'} />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-700">
              {hasQris ? 'QRIS Pembayaran' : 'QR Info Transfer'}
            </p>
            <p className="text-[10px] text-slate-400">
              {hasQris ? 'Scan dengan aplikasi bank / e-wallet' : 'Info rekening transfer'}
            </p>
          </div>
        </div>

        {/* Warning if no QRIS */}
        {!hasQris && (
          <div className="mb-3 p-2.5 bg-amber-50 rounded-lg border border-amber-200/80 relative">
            <div className="flex items-start gap-2">
              <AlertTriangle size={14} className="text-amber-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-[11px] text-amber-700 font-medium leading-snug">
                  Kode QRIS belum diatur untuk rekening ini.
                </p>
                <p className="text-[10px] text-amber-500 mt-0.5 leading-snug">
                  Tambahkan kode QRIS di Pengaturan → Rekening Bank agar QR bisa di-scan langsung oleh aplikasi bank.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* QR Code */}
        <div className="flex flex-col items-center relative">
          <div className={`bg-white rounded-xl p-3 shadow-sm border border-slate-100 transition-all duration-500 ${isGenerated ? 'scale-100 opacity-100' : 'scale-90 opacity-0'}`}>
            <canvas ref={canvasRef} className="rounded-lg" />
          </div>

          {/* Amount Badge */}
          <div className="mt-3 px-4 py-1.5 bg-gradient-to-r from-primary to-blue-600 text-white rounded-full shadow-lg shadow-primary/20">
            <p className="text-sm font-bold tracking-wide">{formatIDR(amount)}</p>
          </div>

          {/* QRIS Badge */}
          {hasQris && (
            <div className="mt-2 flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
              <p className="text-[10px] font-semibold text-green-600 uppercase tracking-wider">QRIS Aktif</p>
            </div>
          )}
        </div>

        {/* Bank Info */}
        <div className="mt-3 space-y-2 relative">
          <div className="bg-white/80 backdrop-blur-sm rounded-lg p-3 border border-slate-100">
            <div className="flex items-center justify-between">
              <div className="min-w-0 flex-1">
                <p className="text-[10px] uppercase tracking-wider text-slate-400 font-medium">Bank / E-Wallet</p>
                <p className="text-sm font-bold text-slate-800 truncate">{bank.bankName}</p>
              </div>
            </div>
          </div>

          <div className="bg-white/80 backdrop-blur-sm rounded-lg p-3 border border-slate-100">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-[10px] uppercase tracking-wider text-slate-400 font-medium">Nomor Rekening</p>
                <p className="text-sm font-bold text-slate-800 font-mono tracking-wider">{bank.accountNumber}</p>
              </div>
              <button
                onClick={handleCopyAccount}
                className={`shrink-0 p-2 rounded-lg transition-all duration-300 ${
                  copied
                    ? 'bg-green-100 text-green-600 scale-110'
                    : 'bg-slate-100 text-slate-400 hover:bg-primary/10 hover:text-primary active:scale-95'
                }`}
                title="Salin nomor rekening"
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
              </button>
            </div>
          </div>

          <div className="bg-white/80 backdrop-blur-sm rounded-lg p-3 border border-slate-100">
            <p className="text-[10px] uppercase tracking-wider text-slate-400 font-medium">Atas Nama</p>
            <p className="text-sm font-bold text-slate-800">{bank.holderName}</p>
          </div>
        </div>

        {/* Download Button */}
        <button
          onClick={handleDownloadQR}
          className="mt-3 w-full flex items-center justify-center gap-2 py-2 px-3 bg-white/80 backdrop-blur-sm border border-slate-200 rounded-lg text-xs font-medium text-slate-600 hover:bg-primary/5 hover:text-primary hover:border-primary/30 transition-all duration-200 active:scale-[0.98]"
        >
          <Download size={14} />
          Download QR Code
        </button>
      </div>

      <style>{`
        .qr-payment-container {
          animation: qrSlideUp 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
        }
        @keyframes qrSlideUp {
          from {
            opacity: 0;
            transform: translateY(12px) scale(0.97);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
      `}</style>
    </div>
  );
};
