import React, { useState, useEffect } from 'react';
import { fetchMilestones } from '@/lib/api';
import { CheckCircle } from 'lucide-react';
import { motion } from 'framer-motion';

interface Milestone {
    id: number;
    name: string;
    date: string;
}

const Calendar = () => {
    const [milestones, setMilestones] = useState<Milestone[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedMilestone, setSelectedMilestone] = useState<Milestone | null>(null);

    useEffect(() => {
        const getMilestones = async () => {
            const data = await fetchMilestones();
            setMilestones(data);
            setLoading(false);
        };
        getMilestones();
    }, []);

    if (loading) {
        return <div className="flex justify-center items-center h-full">Loading...</div>;
    }

    return (
        <div className="flex flex-col p-6 bg-gray-50">
            <h1 className="text-3xl font-bold text-gray-800">Golden Garden Milestones</h1>
            <div className="timeline my-4">
                {milestones.map((milestone) => (
                    <motion.div
                        key={milestone.id}
                        className="milestone flex items-center p-4 bg-white border-b border-gray-300 hover:bg-gray-100"
                        onClick={() => setSelectedMilestone(milestone)}
                        whileHover={{ scale: 1.02 }}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.3 }}
                    >
                        <CheckCircle className="w-6 h-6 text-green-600" />
                        <div className="ml-4">
                            <span className="font-semibold text-gray-900">{milestone.name}</span>
                            <span className="block text-gray-500 text-sm">{milestone.date}</span>
                        </div>
                    </motion.div>
                ))}
            </div>

            {selectedMilestone && (
                <motion.div
                    className="details bg-gray-100 p-4 rounded-lg shadow mt-4"
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                >
                    <h2 className="text-2xl font-semibold text-gray-800">{selectedMilestone.name}</h2>
                    <p className="text-gray-700 mb-2">This is a detailed description of the milestone.</p>
                    <button className="btn btn-primary mt-4 bg-blue-600 text-white p-2 rounded-lg hover:bg-blue-700">Update Status</button>
                </motion.div>
            )}
        </div>
    );
};

export default Calendar;