import { NextApiRequest, NextApiResponse } from 'next';

const milestones = [
    { id: 1, name: 'Budget Planning', date: '2026-04-15' },
    { id: 2, name: 'Design Phase', date: '2026-05-01' },
    { id: 3, name: 'Development', date: '2026-06-10' },
];

export default function handler(req: NextApiRequest, res: NextApiResponse) {
    res.status(200).json(milestones);
}