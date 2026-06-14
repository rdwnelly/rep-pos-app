import { NextResponse } from 'next/server';
import * as models from '@/src/lib/models';

export async function DELETE() {
  try {
    await models.StockAdjustment.destroy({ where: {}, truncate: false });
    return new NextResponse(null, { status: 204 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || String(error) }, { status: 500 });
  }
}
