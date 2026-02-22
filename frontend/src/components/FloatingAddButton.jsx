const FloatingAddButton = ({ onClick, label = 'Nuovo' }) => (
  <button type="button" className="floating-add-button" onClick={onClick} aria-label={label}>
    +
  </button>
);

export default FloatingAddButton;
