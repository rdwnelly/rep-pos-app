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
        .textLine('YAYASAN RUMAH ETNIK PAPUA')
        .bold(false);

    encoder.textLine('Jl. Baru Aimas - Klamono Km. 21');
    encoder.textLine('Malawili, Kec. Aimas, Sorong');
    encoder.textLine('Papua Barat Daya');
    encoder.textLine('WA: 0821-9986-7918');
    encoder.textLine('IG: @rumah_etnik_papua');
    encoder.textLine('TikTok: Rumah Etnik Papua');
    
    encoder.line('-', width)
        .alignLeft()
        .textLine(`Tgl  : ${formatDateWithTime(tx.date)}`)
        .textLine(`No   : ${tx.invoiceNumber || tx.id.substring(0, 8)}`)
        .textLine(`Kasir: ${tx.cashierName}`)
        .textLine(`Plg  : ${tx.customerName || '-'}`)
        .line('-', width);

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
    
    encoder.newline();
    encoder.tableRow(`Bayar (${tx.paymentMethod})`, formatIDR(tx.amountPaid), width);
    
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

    // Add extra newlines so it can be torn properly
    encoder.newline(3)
        .cut();

    return encoder.getBuffer();
};
