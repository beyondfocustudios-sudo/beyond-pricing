import React from 'react';

const Input = ({ placeholder }) => {
    return (
        <input 
            className="w-full px-3.5 py-2.5 bg-bg-primary rounded-lg border border-border-default text-text-primary text-sm placeholder:text-text-tertiary focus:outline-none focus:border-accent-primary focus:ring-1 focus:ring-accent-glow transition-all duration-150" 
            placeholder={placeholder} 
        />
    );
};

export default Input;