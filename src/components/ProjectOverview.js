import React from 'react';
import { motion } from 'framer-motion';
import Image from 'next/image';

const ProjectOverview = ({ project }) => {
    return (
        <motion.div className='project-overview bg-bg-secondary p-4 rounded-lg'>
            <h2 className='text-primary text-lg font-bold'>{project.title}</h2>
            <p className='text-text-secondary'>{project.description}</p>
            <div className='map-overview mt-3'>
                <Image src={project.mapImage} alt='Map overview' layout='responsive' width={800} height={600} />
            </div>
            <div className='route-details mt-4'>
                <h3>Route Details</h3>
                <ul>
                    {project.routeDetails.map(route => (
                        <li key={route.id} className='route-item'>
                            {route.location} - {route.time}
                        </li>
                    ))}
                </ul>
            </div>
        </motion.div>
    );
};

export default ProjectOverview;