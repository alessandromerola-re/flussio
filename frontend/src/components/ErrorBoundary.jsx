import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      message: error?.message || 'Unexpected application error',
    };
  }

  componentDidCatch(error, info) {
    console.error('Unhandled UI error:', error, info);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <main className="auth-container">
          <section className="card" role="alert" aria-live="assertive">
            <h1>Errore applicazione</h1>
            <p className="muted">Si è verificato un errore inatteso nel frontend.</p>
            <p className="error">{this.state.message}</p>
            <button type="button" onClick={this.handleReload}>
              Ricarica pagina
            </button>
          </section>
        </main>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
