import { NextRequest, NextResponse } from 'next/server';
import { GET as genericGET, PUT as genericPUT } from '../../[model]/[id]/route';
import { sequelize } from '@/src/lib/db';
import * as models from '@/src/lib/models';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return genericGET(req, { params: Promise.resolve({ model: 'transactions', id }) });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return genericPUT(req, { params: Promise.resolve({ model: 'transactions', id }) });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const t = await sequelize.transaction();
  try {
    const { id } = await params;
    const userRole = req.headers.get('x-user-role');

    // RBAC Check
    if (userRole !== 'SUPERADMIN' && userRole !== 'OWNER') {
      await t.rollback();
      return NextResponse.json({ error: 'Access denied. Only Owner/Admin can delete financial data.' }, { status: 403 });
    }

    const Transaction = models.Transaction;
    const CashFlow = models.CashFlow;
    const Product = models.Product;

    // 1. Find the transaction
    const transaction: any = await Transaction.findByPk(id, { transaction: t });
    if (!transaction) {
      await t.rollback();
      return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });
    }

    // 2. Find and delete associated CashFlow
    await CashFlow.destroy({
      where: { referenceId: id },
      transaction: t
    });

    // 3. Find child transactions (Returns)
    const returns: any[] = await Transaction.findAll({
      where: { originalTransactionId: id },
      transaction: t
    });

    for (const ret of returns) {
      // Revert Stock for Return Transaction
      if (ret.items && Array.isArray(ret.items)) {
        for (const item of ret.items) {
          const product: any = await Product.findByPk(item.id, { transaction: t });
          if (product) {
            await product.decrement('stock', { by: item.qty, transaction: t });
          }
        }
      }
      // Delete CashFlow for return
      await CashFlow.destroy({
        where: { referenceId: ret.id },
        transaction: t
      });
      await ret.destroy({ transaction: t });
    }

    // 4. Revert Stock for Main Transaction
    if (transaction.items && Array.isArray(transaction.items)) {
      for (const item of transaction.items) {
        const product: any = await Product.findByPk(item.id, { transaction: t });
        if (product) {
          if (transaction.type === 'RETURN') {
            await product.decrement('stock', { by: item.qty, transaction: t });
          } else {
            await product.increment('stock', { by: item.qty, transaction: t });
          }
        }
      }
    }

    // 5. Delete the transaction itself
    await transaction.destroy({ transaction: t });

    await t.commit();
    return new NextResponse(null, { status: 204 });
  } catch (error: any) {
    await t.rollback();
    console.error('Delete Transaction Error:', error);
    return NextResponse.json({ error: error.message || String(error) }, { status: 500 });
  }
}
