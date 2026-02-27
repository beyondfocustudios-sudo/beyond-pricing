import React from 'react';
import { motion } from 'framer-motion';

const Card = ({ children }) => {
    return (
        <motion.div 
            initial={{ opacity: 0, y: 8 }} 
            animate={{ opacity: 1, y: 0 }} 
            transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }} 
            className="bg-bg-secondary rounded-xl border border-border-subtle p-5 hover:border-border-default transition-colors duration-200"
        >
            {children}
        </motion.div>
    );
};

export default Card;