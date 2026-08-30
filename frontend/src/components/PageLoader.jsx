const PageLoader = ({ label = 'Caricamento pagina…' }) => (
  <div className="page-loader" role="status" aria-live="polite">
    <span className="page-loader-spinner" aria-hidden="true" />
    <span>{label}</span>
  </div>
);

export default PageLoader;
