import { NextRequest, NextResponse } from 'next/server';
import { GET as genericGET, PUT as genericPUT } from '../../[model]/[id]/route';
import { sequelize } from '@/src/lib/db';
import * as models from '@/src/lib/models';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return genericGET(req, { params: Promise.resolve({ model: 'transactions', id }) });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const t = await sequelize.transaction();
  try {
    const { id } = await params;
    const updateData = await req.json();

    const Transaction = models.Transaction;
    const Product = models.Product;
    const CashFlow = models.CashFlow;

    // 1. Find existing transaction
    const oldTx: any = await Transaction.findByPk(id, { transaction: t });
    if (!oldTx) {
      await t.rollback();
      return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });
    }

    // 2. Adjust Stock differences if items are updated
    if (updateData.items && Array.isArray(updateData.items)) {
      const oldItems: any[] = oldTx.items || [];
      const newItems: any[] = updateData.items;

      // Revert old items stock
      for (const oldItem of oldItems) {
        const prod: any = await Product.findByPk(oldItem.id, { transaction: t });
        if (prod) {
          if (oldTx.type === 'RETURN') {
            await prod.decrement('stock', { by: oldItem.qty, transaction: t });
          } else {
            await prod.increment('stock', { by: oldItem.qty, transaction: t });
          }
        }
      }

      // Deduct new items stock
      for (const newItem of newItems) {
        const prod: any = await Product.findByPk(newItem.id, { transaction: t });
        if (prod) {
          if ((updateData.type || oldTx.type) === 'RETURN') {
            await prod.increment('stock', { by: newItem.qty, transaction: t });
          } else {
            await prod.decrement('stock', { by: newItem.qty, transaction: t });
          }
        }
      }
    }

    // 3. Update Transaction record
    await oldTx.update(updateData, { transaction: t });

    // 4. Update associated CashFlow entry if amountPaid or totalAmount changed
    if (updateData.amountPaid !== undefined || updateData.totalAmount !== undefined) {
      const cf: any = await CashFlow.findOne({ where: { referenceId: id }, transaction: t });
      if (cf) {
        const isReturn = (updateData.type || oldTx.type) === 'RETURN';
        const newPaid = updateData.amountPaid !== undefined ? updateData.amountPaid : oldTx.amountPaid;
        const newTotal = updateData.totalAmount !== undefined ? updateData.totalAmount : oldTx.totalAmount;
        const newAmount = isReturn ? Math.abs(newPaid) : (newPaid > 0 ? newPaid : newTotal);

        await cf.update({
          amount: newAmount,
          description: `Penjualan ${updateData.invoiceNumber || oldTx.invoiceNumber || id} (Disunting)`
        }, { transaction: t });
      }
    }

    await t.commit();
    const updatedTx = await Transaction.findByPk(id);
    return NextResponse.json(updatedTx);
  } catch (error: any) {
    await t.rollback();
    console.error('Update Transaction Error:', error);
    return NextResponse.json({ error: error.message || String(error) }, { status: 500 });
  }
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
