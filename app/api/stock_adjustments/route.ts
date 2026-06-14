import { NextRequest, NextResponse } from 'next/server';
import { GET as genericGET } from '../[model]/route';
import { sequelize } from '@/src/lib/db';
import * as models from '@/src/lib/models';

export async function GET(req: NextRequest) {
  return genericGET(req, { params: Promise.resolve({ model: 'stock_adjustments' }) });
}

export async function POST(req: NextRequest) {
  const t = await sequelize.transaction();
  try {
    const adjustmentData = await req.json();
    const userId = req.headers.get('x-user-id');
    const username = req.headers.get('x-user-username');

    const StockAdjustment = models.StockAdjustment;
    const Product = models.Product;

    const product: any = await Product.findByPk(adjustmentData.productId, { transaction: t });
    if (!product) {
      await t.rollback();
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    // Calculate stocks
    const previousStock = product.stock;
    let currentStock = previousStock;
    const qty = parseInt(adjustmentData.qty);

    if (adjustmentData.type === 'INCREASE') {
      currentStock += qty;
    } else if (adjustmentData.type === 'DECREASE') {
      currentStock -= qty;
    }

    if (!adjustmentData.id) adjustmentData.id = Date.now().toString();

    const adjustment = await StockAdjustment.create({
      ...adjustmentData,
      previousStock,
      currentStock,
      productName: product.name,
      userId: userId,
      userName: username
    }, { transaction: t });

    // Update Product Stock
    await product.update({ stock: currentStock }, { transaction: t });

    await t.commit();
    return NextResponse.json(adjustment);
  } catch (error: any) {
    await t.rollback();
    console.error('Stock Adjustment Error:', error);
    return NextResponse.json({ error: error.message || String(error) }, { status: 500 });
  }
}
