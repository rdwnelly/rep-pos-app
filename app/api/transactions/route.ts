import { NextRequest, NextResponse } from 'next/server';
import { GET as genericGET } from '../[model]/route';
import { sequelize } from '@/src/lib/db';
import * as models from '@/src/lib/models';
import { randomUUID } from 'crypto';
import { generateInvoiceNumber } from '@/src/lib/utils-backend';

export async function GET(req: NextRequest) {
  return genericGET(req, { params: Promise.resolve({ model: 'transactions' }) });
}

export async function POST(req: NextRequest) {
  const t = await sequelize.transaction();
  try {
    const txData = await req.json();
    const userId = req.headers.get('x-user-id');
    const username = req.headers.get('x-user-username');

    if (!txData.id) txData.id = randomUUID();

    const Transaction = models.Transaction;
    const Product = models.Product;
    const CashFlow = models.CashFlow;
    const BankAccount = models.BankAccount;

    // 1. Create Transaction
    if (userId) {
      if (!txData.cashierId) txData.cashierId = userId;
      if (!txData.cashierName) txData.cashierName = username;
    }

    if (!txData.invoiceNumber) {
      txData.invoiceNumber = await generateInvoiceNumber(Transaction, 'SALE');
    }

    const transaction = await Transaction.create(txData, { transaction: t });

    // 2. Update Stock
    if (txData.items && Array.isArray(txData.items)) {
      for (const item of txData.items) {
        const product: any = await Product.findByPk(item.id, { transaction: t });
        if (product) {
          let newStock = product.stock;
          if (txData.type === 'RETURN') {
            newStock += item.qty;
          } else {
            newStock -= item.qty;
          }
          await product.update({ stock: newStock }, { transaction: t });
        }
      }
    }

    // 3. Create CashFlow (Automated)
    if (!txData.skipCashFlow && (txData.amountPaid > 0 || (txData.type === 'RETURN' && txData.totalAmount < 0))) {
      const isReturn = txData.type === 'RETURN';

      let cfAmount = 0;
      if (isReturn) {
        cfAmount = Math.abs(txData.amountPaid);
      } else {
        const paid = parseFloat(txData.amountPaid) || 0;
        const change = parseFloat(txData.change) || 0;
        if (change < 0) {
          cfAmount = paid;
        } else {
          cfAmount = paid - change;
        }
      }

      if (cfAmount > 0) {
        const cfType = isReturn ? 'KELUAR' : 'MASUK';
        const category = isReturn ? 'Retur Penjualan' : 'Penjualan';

        let bankInfo = '';
        if (txData.bankId) {
          const bank: any = await BankAccount.findByPk(txData.bankId, { transaction: t });
          if (bank) {
            bankInfo = ` (via ${bank.bankName} - ${bank.accountNumber})`;
          }
        }

        const description = isReturn
          ? `Refund Retur Transaksi (Invoice: ${txData.invoiceNumber || txData.id.substring(0, 6)})${bankInfo}`
          : `Penjualan ke ${txData.customerName || 'Umum'} (Invoice: ${txData.invoiceNumber || txData.id.substring(0, 6)})${bankInfo}`;

        const cfPaymentMethod = txData.bankId ? 'TRANSFER' : 'CASH';

        await CashFlow.create({
          id: Date.now().toString(),
          date: txData.date,
          type: cfType,
          amount: cfAmount,
          category: category,
          description: description,
          paymentMethod: cfPaymentMethod,
          bankId: txData.bankId,
          bankName: txData.bankName,
          referenceId: txData.id,
          userId: userId,
          userName: username
        }, { transaction: t });
      }
    }

    await t.commit();
    return NextResponse.json(transaction);
  } catch (error: any) {
    await t.rollback();
    console.error('Transaction Error:', error);
    return NextResponse.json({ error: error.message || String(error) }, { status: 500 });
  }
}
