import { NextRequest, NextResponse } from 'next/server';
import { User } from '@/src/lib/models';

export async function GET(req: NextRequest) {
  try {
    const userId = req.headers.get('x-user-id');

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user: any = await User.findByPk(userId, {
      attributes: { exclude: ['password'] },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json(user);
  } catch (error: any) {
    console.error('Auth me error:', error);
    const errorMessage = process.env.NODE_ENV === 'production' 
      ? 'An unexpected error occurred. Please contact support.' 
      : error.message || String(error);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
