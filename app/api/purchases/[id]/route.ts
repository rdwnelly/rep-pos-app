import { NextRequest, NextResponse } from 'next/server';
import { GET as genericGET, PUT as genericPUT } from '../../[model]/[id]/route';
import { sequelize } from '@/src/lib/db';
import * as models from '@/src/lib/models';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return genericGET(req, { params: Promise.resolve({ model: 'purchases', id }) });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return genericPUT(req, { params: Promise.resolve({ model: 'purchases', id }) });
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

    const Purchase = models.Purchase;
    const CashFlow = models.CashFlow;
    const Product = models.Product;

    // 1. Find the purchase
    const purchase: any = await Purchase.findByPk(id, { transaction: t });
    if (!purchase) {
      await t.rollback();
      return NextResponse.json({ error: 'Purchase not found' }, { status: 404 });
    }

    // 2. Find and delete associated CashFlow
    await CashFlow.destroy({
      where: { referenceId: id },
      transaction: t
    });

    // 3. Find child purchases (Returns)
    const returns: any[] = await Purchase.findAll({
      where: { originalPurchaseId: id },
      transaction: t
    });

    for (const ret of returns) {
      // Revert Stock for Return Purchase
      if (ret.items && Array.isArray(ret.items)) {
        for (const item of ret.items) {
          const product: any = await Product.findByPk(item.id, { transaction: t });
          if (product) {
            await product.increment('stock', { by: item.qty, transaction: t });
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

    // 4. Revert Stock for Main Purchase
    if (purchase.items && Array.isArray(purchase.items)) {
      for (const item of purchase.items) {
        const product: any = await Product.findByPk(item.id, { transaction: t });
        if (product) {
          if (purchase.type === 'RETURN') {
            await product.increment('stock', { by: item.qty, transaction: t });
          } else {
            await product.decrement('stock', { by: item.qty, transaction: t });
          }
        }
      }
    }

    // 5. Delete the purchase itself
    await purchase.destroy({ transaction: t });

    await t.commit();
    return new NextResponse(null, { status: 204 });
  } catch (error: any) {
    await t.rollback();
    console.error('Delete Purchase Error:', error);
    return NextResponse.json({ error: error.message || String(error) }, { status: 500 });
  }
}
