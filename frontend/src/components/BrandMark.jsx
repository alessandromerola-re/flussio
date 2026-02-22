const BrandMark = ({ logoUrl = '', alt = 'Flussio' }) => {
  if (logoUrl) {
    return <img src={logoUrl} className="brand-logo" alt={alt} />;
  }

  return <span className="brand-text">Flussio</span>;
};

export default BrandMark;
