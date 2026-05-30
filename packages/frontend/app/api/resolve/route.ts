import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const name = request.nextUrl.searchParams.get('name');
  if (!name) {
    return NextResponse.json({ error: 'name query parameter is required' }, { status: 400 });
  }
  return NextResponse.json({ error: 'Not implemented' }, { status: 501 });
}
