import React from 'react';

interface KnoweiaLogoProps {
  className?: string;
  alt?: string;
}

const logoUrl = new URL('../assets/logo.svg', import.meta.url).href;

const KnoweiaLogo: React.FC<KnoweiaLogoProps> = ({ className = '', alt = 'Knoweia logo' }) => {
  return <img src={logoUrl} alt={alt} className={className} draggable={false} />;
};

export default KnoweiaLogo;
