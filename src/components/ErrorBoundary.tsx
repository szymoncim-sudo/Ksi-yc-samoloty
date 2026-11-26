import { Component, type ReactNode } from 'react';
import { getDict } from '../i18n';

export class ErrorBoundary extends Component<{ children: ReactNode; name?: string }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error(`[${this.props.name ?? 'screen'}]`, error);
  }

  render() {
    if (this.state.error) {
      const t = getDict();
      return (
        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeContent: 'center', padding: 30, textAlign: 'center' }}>
          <h2 className="h1">{t.errors.title}</h2>
          <p className="lead">{t.errors.text}</p>
          <div style={{ marginTop: 18 }}>
            <button className="btn" onClick={() => this.setState({ error: null })}>
              {t.errors.retry}
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
