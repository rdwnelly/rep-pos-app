import { NextRequest, NextResponse } from 'next/server';
import * as models from '@/src/lib/models';
import { randomUUID } from 'crypto';
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

export async function GET(req: NextRequest, { params }: { params: Promise<{ model: string }> }) {
  try {
    const { model } = await params;
    const modelInfo = getModel(model);
    
    if (!modelInfo) {
      return NextResponse.json({ error: 'Model not found' }, { status: 404 });
    }

    const { modelName, Model } = modelInfo;
    const userRole = req.headers.get('x-user-role');
    const userId = req.headers.get('x-user-id');

    // RBAC: Only SUPERADMIN can view user list
    if (modelName === 'User' && userRole !== 'SUPERADMIN') {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const options: any = {};
    if (modelName === 'User') {
      options.attributes = { exclude: ['password'] };
    }

    // Filter for Cashier/Warehouse: Only show their own financial data
    if (userRole === 'CASHIER' || userRole === 'GUDANG') {
      if (modelName === 'Transaction') {
        options.where = { cashierId: userId };
      } else if (modelName === 'Purchase' || modelName === 'CashFlow') {
        options.where = { userId: userId };
      }
    }

    const items = await Model.findAll(options);
    return NextResponse.json(items);
  } catch (error: any) {
    console.error(`Error fetching:`, error);
    return NextResponse.json({ error: error.message || String(error) }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ model: string }> }) {
  try {
    const { model } = await params;
    
    // Support for /batch endpoint logic, we need to check if the route URL ends with /batch
    // Or we handle /batch differently. Wait, Next.js params will catch /api/products/batch as [model]/[id] if batch is considered id.
    // If the URL is /api/products/batch, it goes to [model]/[id]/route.ts ? Yes, if batch is id.
    // Let's handle batch in [model]/batch/route.ts if needed, or check if body is array here instead.
    // In Express: router.post('/batch', ...) and router.post('/', ...).
    // Let's allow POST /api/[model] to accept an array for bulkCreate, or single object.
    
    const body = await req.json();
    const modelInfo = getModel(model);
    
    if (!modelInfo) {
      return NextResponse.json({ error: 'Model not found' }, { status: 404 });
    }

    const { modelName, Model } = modelInfo;
    const userRole = req.headers.get('x-user-role');

    // BATCH PROCESSING
    if (Array.isArray(body)) {
       // RBAC: Cashiers/Warehouse cannot perform batch operations on restricted resources
       if (userRole === 'CASHIER' || userRole === 'GUDANG') {
           const restrictedModels = ['Product', 'Category', 'Customer', 'Supplier', 'User', 'StoreSettings'];
           if (restrictedModels.includes(modelName)) {
               return NextResponse.json({ error: 'Access denied' }, { status: 403 });
           }
       }
       const result = await Model.bulkCreate(body, {
           updateOnDuplicate: Object.keys(Model.rawAttributes)
       });
       return NextResponse.json(result);
    }

    // SINGLE PROCESSING
    if (!body.id) {
      body.id = randomUUID();
    }

    // RBAC: Only SUPERADMIN can create users
    if (modelName === 'User' && userRole !== 'SUPERADMIN') {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // RBAC: Cashiers and Warehouse cannot create master data
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

    const item: any = await Model.create(body);
    let responseItem = item.toJSON();

    if (modelName === 'User') {
      delete responseItem.password;
    }

    return NextResponse.json(responseItem);
  } catch (error: any) {
    console.error(`Error creating:`, error);
    return NextResponse.json({ error: error.message || String(error) }, { status: 500 });
  }
}
