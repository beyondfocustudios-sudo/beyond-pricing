export const fetchMilestones = async () => {
    const response = await fetch('/api/milestones');
    if (!response.ok) {
        throw new Error('Failed to fetch milestones');
    }
    return await response.json();
};