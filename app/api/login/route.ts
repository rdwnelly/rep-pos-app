import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { User } from '@/src/lib/models';
import { cookies } from 'next/headers';

// Rate limiting map (simple in-memory for this example, could use Redis for production)
const rateLimitMap = new Map<string, { count: number; timestamp: number }>();

export async function POST(req: NextRequest) {
  try {
    // Basic IP-based rate limiting for login
    const ip = req.headers.get('x-forwarded-for') || 'unknown';
    const now = Date.now();
    const limitWindow = 15 * 60 * 1000; // 15 minutes
    
    const rateLimitData = rateLimitMap.get(ip);
    if (rateLimitData && now - rateLimitData.timestamp < limitWindow) {
      if (rateLimitData.count >= 5) {
        return NextResponse.json(
          { error: 'Too many login attempts from this IP, please try again after 15 minutes' },
          { status: 429 }
        );
      }
      rateLimitData.count += 1;
    } else {
      rateLimitMap.set(ip, { count: 1, timestamp: now });
    }

    const { username, password } = await req.json();

    const user: any = await User.findOne({ where: { username } });

    if (!user) {
      return NextResponse.json({ error: 'Invalid username or password' }, { status: 401 });
    }

    // Check password
    let validPassword = false;
    if (user.password.startsWith('$2')) {
      validPassword = await bcrypt.compare(password, user.password);
    }

    if (!validPassword) {
      return NextResponse.json({ error: 'Username atau password salah' }, { status: 401 });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      process.env.JWT_SECRET || 'fallback_secret',
      { expiresIn: '24h' }
    );

    const userWithoutPassword = user.toJSON();
    delete userWithoutPassword.password;

    // Set HttpOnly Cookie
    const cookieStore = await cookies();
    cookieStore.set('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
      maxAge: 24 * 60 * 60, // 24 hours in seconds
      path: '/',
    });

    // Reset rate limit on success
    rateLimitMap.delete(ip);

    return NextResponse.json({ user: userWithoutPassword });
  } catch (error: any) {
    console.error('Login error:', error);
    const errorMessage = process.env.NODE_ENV === 'production' 
      ? 'An unexpected error occurred. Please contact support.' 
      : error.message || String(error);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
