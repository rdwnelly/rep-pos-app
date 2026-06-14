import { NextRequest, NextResponse } from 'next/server';
import { GET as genericGET } from '../[model]/route';
import { sequelize } from '@/src/lib/db';
import * as models from '@/src/lib/models';
import { randomUUID } from 'crypto';
import { generateInvoiceNumber } from '@/src/lib/utils-backend';

export async function GET(req: NextRequest) {
  return genericGET(req, { params: Promise.resolve({ model: 'purchases' }) });
}

export async function POST(req: NextRequest) {
  const t = await sequelize.transaction();
  try {
    const purchaseData = await req.json();
    const userId = req.headers.get('x-user-id');
    const username = req.headers.get('x-user-username');

    const Purchase = models.Purchase;
    const Product = models.Product;
    const CashFlow = models.CashFlow;
    const BankAccount = models.BankAccount;

    if (!purchaseData.id) purchaseData.id = randomUUID();

    // 1. Create Purchase
    if (userId) {
      purchaseData.userId = userId;
      purchaseData.userName = username;
    }

    if (!purchaseData.invoiceNumber) {
      purchaseData.invoiceNumber = await generateInvoiceNumber(Purchase, 'PURCHASE');
    }

    const purchase: any = await Purchase.create(purchaseData, { transaction: t });

    // 2. Update Stock
    if (purchaseData.items && Array.isArray(purchaseData.items)) {
      for (const item of purchaseData.items) {
        const product: any = await Product.findByPk(item.id, { transaction: t });
        if (product) {
          let newStock = product.stock;
          if (purchaseData.type === 'RETURN') {
            newStock -= item.qty;
          } else {
            newStock += item.qty;
          }
          await product.update({ stock: newStock }, { transaction: t });
        }
      }
    }

    // 3. Create CashFlow
    if (!purchaseData.skipCashFlow && (purchaseData.amountPaid > 0 || (purchaseData.type === 'RETURN' && purchaseData.totalAmount < 0))) {
      const isReturn = purchaseData.type === 'RETURN';
      const amount = Math.abs(purchaseData.amountPaid);

      if (amount > 0) {
        const cfType = isReturn ? 'MASUK' : 'KELUAR';
        const category = isReturn ? 'Retur Pembelian' : 'Pembelian Stok';

        let bankInfo = '';
        if (purchaseData.bankId) {
          const bank: any = await BankAccount.findByPk(purchaseData.bankId, { transaction: t });
          if (bank) {
            bankInfo = ` (via ${bank.bankName} - ${bank.accountNumber})`;
          }
        }

        const description = isReturn
          ? `Refund Retur Pembelian dari ${purchaseData.supplierName} (Invoice: ${purchaseData.invoiceNumber || '- '})${bankInfo}`
          : `Pembelian dari ${purchaseData.supplierName} (Invoice: ${purchaseData.invoiceNumber || '-'}): ${purchaseData.description}${bankInfo}`;

        const cfPaymentMethod = purchaseData.bankId ? 'TRANSFER' : 'CASH';

        await CashFlow.create({
          id: Date.now().toString(),
          date: purchaseData.date,
          type: cfType,
          amount: amount,
          category: category,
          description: description,
          paymentMethod: cfPaymentMethod,
          bankId: purchaseData.bankId,
          bankName: purchaseData.bankName,
          referenceId: purchase.id,
          userId: userId,
          userName: username
        }, { transaction: t });
      }
    }

    await t.commit();
    return NextResponse.json(purchase);
  } catch (error: any) {
    await t.rollback();
    console.error('Purchase Error:', error);
    return NextResponse.json({ error: error.message || String(error) }, { status: 500 });
  }
}
