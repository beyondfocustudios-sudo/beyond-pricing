import React from 'react';

function Calendar() {
    const milestones = [
        { name: 'Budget Planning', date: '2026-01-01' },
        { name: 'Decision Request', date: '2026-02-15' },
        { name: 'This is a very long milestone name', date: '2026-02-20' },
        { name: 'Yet Another Milestone', date: '2026-03-01' },
    ];

    return (
        <div className="calendar-container">
            <header className="calendar-header">
                <h2>Golden Garden</h2>
                <div className="navigation">
                    <button>Year</button>
                    <button>Week</button>
                    <button>Day</button>
                </div>
            </header>
            <div className="timeline">
                {milestones.map((milestone, index) => (
                    <div key={index} className="milestone">
                        <span className="icon">🏁</span>
                        <span>{milestone.name}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

export default Calendar;