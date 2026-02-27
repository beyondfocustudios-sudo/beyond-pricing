import React from 'react';
import { motion } from 'framer-motion';
import Image from 'next/image';

const CalendarNew = () => {
    return (
        <div className='calendar bg-primary p-4 rounded-lg'>
            <motion.div className='milestones mb-4' whileHover={{ scale: 1.02 }}>
                <h3 className='text-primary text-lg font-bold'>Milestones</h3>
                <motion.div className='milestone bg-tertiary p-3 mb-2 rounded-lg' transition={{ duration: 0.3 }}>
                    <div className='milestone-indicator'>Projeto em Andamento</div>
                    <div className='milestone-date'>
                        <span>25/02/2026</span>
                        <p>Continuando o progresso...</p>
                    </div>
                </motion.div>
                <motion.div className='milestone bg-tertiary p-3 mb-2 rounded-lg' transition={{ duration: 0.3 }}>
                    <div className='milestone-indicator'>Próxima Fase</div>
                    <div className='milestone-date'>
                        <span>01/03/2026</span>
                        <p>Data prevista para revisão.</p>
                    </div>
                </motion.div>
                <motion.div className='milestone bg-tertiary p-3 rounded-lg' transition={{ duration: 0.3 }}>
                    <div className='milestone-indicator'>Feedback</div>
                    <div className='milestone-date'>
                        <span>05/03/2026</span>
                        <p>Aguardar feedback do cliente.</p>
                    </div>
                </motion.div>
            </motion.div>
            <motion.div className='project-info mb-4'>
                <h3 className='text-primary text-lg font-bold'>Informações do Projeto</h3>
                <p>Detalhes completos sobre o projeto, incluindo descrições, etapas e objetivos.</p>
            </motion.div>
            <motion.div className='inbox'>
                <h3 className='text-primary text-lg font-bold'>Inbox</h3>
                <motion.div className='inbox-message bg-secondary p-2 mb-2 rounded-lg' whileHover={{ scale: 1.02 }}>
                    <span>Nova Mensagem: Discussão sobre Milestones.</span>
                </motion.div>
                <motion.div className='inbox-message bg-secondary p-2 rounded-lg' whileHover={{ scale: 1.02 }}>
                    <span>Nova Mensagem: Atualização sobre a próxima reunião.</span>
                </motion.div>
            </motion.div>
        </div>
    );
};

export default CalendarNew;