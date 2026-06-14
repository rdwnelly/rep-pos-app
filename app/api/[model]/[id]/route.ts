import { NextRequest, NextResponse } from 'next/server';
import * as models from '@/src/lib/models';
import bcrypt from 'bcryptjs';

const modelMap: Record<string, string> = {
  products: 'Product',
  categories: 'Category',
  customers: 'Customer',
  suppliers: 'Supplier',
  transactions: 'Transaction',
  purchases: 'Purchase',
  cashflow: 'CashFlow',
  users: 'User',
  banks: 'BankAccount',
  store_settings: 'StoreSettings',
  stock_adjustments: 'StockAdjustment'
};

const getModel = (routeParam: string) => {
  const modelName = modelMap[routeParam];
  if (!modelName) return null;
  return { modelName, Model: (models as any)[modelName] };
};

export async function GET(req: NextRequest, { params }: { params: Promise<{ model: string, id: string }> }) {
  try {
    const { model, id } = await params;
    const modelInfo = getModel(model);
    
    if (!modelInfo) {
      return NextResponse.json({ error: 'Model not found' }, { status: 404 });
    }

    const { modelName, Model } = modelInfo;
    const userRole = req.headers.get('x-user-role');
    const userId = req.headers.get('x-user-id');

    // Handle "batch" requests that might fall into this route handler
    if (id === 'batch') {
      return NextResponse.json({ error: 'GET /batch not supported' }, { status: 400 });
    }

    // RBAC: Only SUPERADMIN can view user details (except self)
    if (modelName === 'User' && userRole !== 'SUPERADMIN') {
      if (id !== userId) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 });
      }
    }

    const options: any = { where: { id } };
    if (modelName === 'User') {
      options.attributes = { exclude: ['password'] };
    }

    // Filter for Cashier/Warehouse
    if (userRole === 'CASHIER' || userRole === 'GUDANG') {
      if (modelName === 'Transaction') {
        options.where.cashierId = userId;
      } else if (modelName === 'Purchase' || modelName === 'CashFlow') {
        options.where.userId = userId;
      }
    }

    const item = await Model.findOne(options);

    if (item) {
      return NextResponse.json(item);
    } else {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
  } catch (error: any) {
    return NextResponse.json({ error: error.message || String(error) }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ model: string, id: string }> }) {
  try {
    const { model, id } = await params;
    const body = await req.json();
    const modelInfo = getModel(model);
    
    if (!modelInfo) {
      return NextResponse.json({ error: 'Model not found' }, { status: 404 });
    }

    const { modelName, Model } = modelInfo;
    const userRole = req.headers.get('x-user-role');

    // RBAC: Only SUPERADMIN can update users
    if (modelName === 'User' && userRole !== 'SUPERADMIN') {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // RBAC: Cashiers and Warehouse cannot modify master data
    if (userRole === 'CASHIER' || userRole === 'GUDANG') {
      const restrictedModels = ['Product', 'Category', 'Customer', 'Supplier', 'User', 'StoreSettings'];
      if (restrictedModels.includes(modelName)) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 });
      }
    }

    // Hash password for User model
    if (modelName === 'User' && body.password) {
      body.password = await bcrypt.hash(body.password, 10);
    }

    const [updated] = await Model.update(body, {
      where: { id }
    });

    if (updated) {
      const updatedItem = await Model.findByPk(id);
      return NextResponse.json(updatedItem);
    } else {
      const existing = await Model.findByPk(id);
      if (!existing) {
        // Upsert behavior requested by frontend
        const newItem: any = await Model.create({ ...body, id });
        let responseItem = newItem.toJSON();
        if (modelName === 'User') {
          delete responseItem.password;
        }
        return NextResponse.json(responseItem);
      } else {
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
      }
    }
  } catch (error: any) {
    return NextResponse.json({ error: error.message || String(error) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ model: string, id: string }> }) {
  try {
    const { model, id } = await params;
    const modelInfo = getModel(model);
    
    if (!modelInfo) {
      return NextResponse.json({ error: 'Model not found' }, { status: 404 });
    }

    const { modelName, Model } = modelInfo;
    const userRole = req.headers.get('x-user-role');

    // RBAC: Only SUPERADMIN can delete users
    if (modelName === 'User' && userRole !== 'SUPERADMIN') {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // RBAC: Only SUPERADMIN and OWNER can delete financial data
    // NOTE: Custom delete logic for Transactions and Purchases should be handled 
    // in their own specific routes before reaching this generic one.
    if (['Transaction', 'Purchase', 'CashFlow'].includes(modelName)) {
      if (!['SUPERADMIN', 'OWNER'].includes(userRole || '')) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 });
      }
    }

    // RBAC: Cashiers and Warehouse cannot delete master data
    if (userRole === 'CASHIER' || userRole === 'GUDANG') {
      const restrictedModels = ['Product', 'Category', 'Customer', 'Supplier', 'User', 'StoreSettings', 'BankAccount'];
      if (restrictedModels.includes(modelName)) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 });
      }
    }

    const deleted = await Model.destroy({
      where: { id }
    });

    if (deleted) {
      return new NextResponse(null, { status: 204 });
    } else {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
  } catch (error: any) {
    return NextResponse.json({ error: error.message || String(error) }, { status: 500 });
  }
}
