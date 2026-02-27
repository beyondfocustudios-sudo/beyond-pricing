import React from 'react';

function Calendar() {
    return (
        <div className="calendar-layout">
            <header className="calendar-header">
                <h2>Golden Garden</h2>
                <div className="navigation">
                    <button>Year</button>
                    <button>Week</button>
                    <button>Day</button>
                </div>
            </header>
            <div className="timeline">
                {/* Implementação da linha do tempo */}
                <div className="milestone">
                    <span className="milestone-icon">🎮</span>
                    <span>Budget Planning</span>
                </div>
                <div className="milestone">
                    <span className="milestone-icon">📝</span>
                    <span>This is a very long milestone name</span>
                </div>
                <div className="milestone">
                    <span className="milestone-icon">📅</span>
                    <span>Yet Another Milestone</span>
                </div>
            </div>
            <footer className="version-info">
                <p><small>Version: 1.0.0</small></p>
            </footer>
        </div>
    );
}

export default Calendar;