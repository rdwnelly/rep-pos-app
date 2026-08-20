import { Transaction, StoreSettings } from '../types';


// Simple ESC/POS Encoder Utility
export class EscPosEncoder {
    private buffer: number[] = [];

    constructor() {
        this.initialize();
    }

    private addBytes(bytes: number[]) {
        this.buffer.push(...bytes);
    }

    public initialize() {
        this.addBytes([0x1B, 0x40]); // ESC @
        return this;
    }

    public alignLeft() {
        this.addBytes([0x1B, 0x61, 0x00]); // ESC a 0
        return this;
    }

    public alignCenter() {
        this.addBytes([0x1B, 0x61, 0x01]); // ESC a 1
        return this;
    }

    public alignRight() {
        this.addBytes([0x1B, 0x61, 0x02]); // ESC a 2
        return this;
    }

    public bold(enable: boolean) {
        this.addBytes([0x1B, 0x45, enable ? 0x01 : 0x00]); // ESC E n
        return this;
    }

    public text(text: string) {
        // Basic ASCII encoding. For full support, a proper CP437 or similar encoder is needed,
        // but for basic Indonesian text, standard char codes are usually fine.
        for (let i = 0; i < text.length; i++) {
            this.buffer.push(text.charCodeAt(i));
        }
        return this;
    }

    public newline(count: number = 1) {
        for (let i = 0; i < count; i++) {
            this.addBytes([0x0A]); // LF
        }
        return this;
    }

    public textLine(text: string) {
        this.text(text).newline();
        return this;
    }

    public line(char: string = '-', length: number = 32) {
        this.text(char.repeat(length)).newline();
        return this;
    }

    public cut() {
        this.addBytes([0x1D, 0x56, 0x42, 0x00]); // GS V 66 0 (Cut)
        return this;
    }

    // Buka cash drawer via port RJ11
    // ESC p m t1 t2 — kirim pulse ke pin connector
    // m=0: pin 2 (drawer 1), m=1: pin 5 (drawer 2)
    // t1: durasi ON (n × 2ms), t2: durasi OFF (n × 2ms)
    public openCashDrawer(pin: 0 | 1 = 0) {
        // ESC p 0 25 250 → pulse 50ms ON, 500ms OFF (standar untuk kebanyakan cash drawer)
        this.addBytes([0x1B, 0x70, pin, 0x19, 0xFA]);
        return this;
    }

    public getBuffer(): Uint8Array {
        return new Uint8Array(this.buffer);
    }

    // Helper for formatting two columns (e.g., Name .... Price)
    public tableRow(left: string, right: string, width: number = 32) {
        const spaceLength = width - left.length - right.length;
        if (spaceLength > 0) {
            this.textLine(left + ' '.repeat(spaceLength) + right);
        } else {
            // If it exceeds width, print left on one line, right on next
            this.textLine(left);
            this.alignRight().textLine(right).alignLeft();
        }
        return this;
    }
}

const formatDateWithTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const datePart = date.toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
    const timePart = date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false });
    return `${datePart} ${timePart}`;
};

const formatNumber = (val: number) => {
    return val.toLocaleString('id-ID');
};

const formatIDR = (val: number) => {
    return 'Rp ' + formatNumber(val);
};

export const generateESCPOSReceipt = (tx: Transaction, settings: StoreSettings): Uint8Array => {
    const encoder = new EscPosEncoder();
    const width = settings.printerType === '80mm' ? 48 : 32;

    encoder.initialize()
        .alignCenter()
        .bold(true)
        .textLine(settings.name || 'Toko')
        .bold(false);

    if (settings.showAddress !== false && settings.address) {
        // Address might contain multiple lines or we can just print as is
        settings.address.split('\n').forEach(line => encoder.textLine(line));
    }
    if (settings.showPhone !== false && settings.phone) {
        encoder.textLine(`WA: ${settings.phone}`);
    }
    if (settings.showInstagram !== false && settings.instagram) {
        encoder.textLine(`IG: ${settings.instagram}`);
    }
    if (settings.showTiktok !== false && settings.tiktok) {
        encoder.textLine(`TikTok: ${settings.tiktok}`);
    }
    
    encoder.line('-', width)
        .alignLeft()
        .textLine(`Tgl  : ${formatDateWithTime(tx.date)}`)
        .textLine(`No   : ${tx.invoiceNumber || tx.id.substring(0, 8)}`)
        .textLine(`Kasir: ${tx.cashierName}`)
        .textLine(`Plg  : ${tx.customerName && tx.customerName !== 'Pelanggan Umum' ? tx.customerName : 'Pelanggan Umum (walk-in)'}`)
        .textLine(`HP   : ${tx.customerPhone || '-'}`)
        .textLine(`Meja : ${tx.tableNumber || '-'}`)
        .textLine(`Note : ${tx.paymentNote || '-'}`);
        
    encoder.line('-', width);

    // Items
    tx.items.forEach(item => {
        encoder.textLine(item.name);
        const qtyStr = `${item.qty} ${item.unit || 'x'} ${formatNumber(item.finalPrice)}`;
        const subtotalStr = formatNumber(item.finalPrice * item.qty);
        encoder.tableRow(qtyStr, subtotalStr, width);
    });

    encoder.line('-', width);

    // Totals
    const discountAmount = tx.discountAmount || 0;
    const subTotal = tx.totalAmount + discountAmount;

    encoder.tableRow('Subtotal', formatIDR(subTotal), width);
    if (discountAmount > 0) {
        encoder.tableRow('Diskon', `-${formatIDR(discountAmount)}`, width);
    }
    encoder.bold(true).tableRow('TOTAL', formatIDR(tx.totalAmount), width).bold(false);
    
    const methodLabel = ((tx.paymentMethod as string) === 'TEMPO' || tx.paymentMethod === 'BON') ? 'BON' : tx.paymentMethod;
    encoder.tableRow(`Bayar (${methodLabel})`, formatIDR(tx.amountPaid), width);
    
    if (tx.change >= 0) {
        encoder.tableRow('Kembalian', formatIDR(tx.change), width);
    } else {
        encoder.tableRow('Sisa Utang', formatIDR(Math.abs(tx.change)), width);
    }

    encoder.newline()
        .alignCenter();
    
    if (settings.showJargon && settings.jargon) {
        encoder.textLine(settings.jargon);
    }
    if (settings.footerMessage) {
        encoder.textLine(settings.footerMessage);
    }

    // Buka cash drawer jika diaktifkan di settings
    if (settings.openCashDrawer) {
        encoder.openCashDrawer(0); // Pin 2 (drawer 1)
        // Beberapa cash drawer menggunakan pin 5, kirim juga untuk kompatibilitas
        encoder.openCashDrawer(1); // Pin 5 (drawer 2)
    }

    // Add minimal newlines for clean cut without wasting paper
    encoder.newline(1)
        .cut();

    return encoder.getBuffer();
};
