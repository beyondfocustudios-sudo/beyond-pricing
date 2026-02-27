import { NextResponse } from 'next/server';

const milestones = [
  { id: 1, name: 'Budget Planning', date: '2026-04-15' },
  { id: 2, name: 'Design Phase', date: '2026-05-01' },
  { id: 3, name: 'Development', date: '2026-06-10' },
];

export async function GET() {
  return NextResponse.json(milestones);
}
