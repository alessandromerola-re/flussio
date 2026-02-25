const FloatingAddButton = ({ onClick, ariaLabel = 'Nuovo' }) => (
  <button
    type="button"
    className="floating-add-button"
    onClick={onClick}
    aria-label={ariaLabel}
    title={ariaLabel}
  >
    +
  </button>
);

export default FloatingAddButton;
