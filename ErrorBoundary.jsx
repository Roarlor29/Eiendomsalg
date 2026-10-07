import { Component } from 'react'

// Fanger opp feil i beregningen slik at siden viser en lesbar norsk melding
// i stedet for å bli helt blank. Ingen data lagres av dette, så det er alltid
// trygt å laste siden på nytt.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }
  static getDerivedStateFromError(error) {
    return { error }
  }
  componentDidCatch(error, info) {
    // Safari: Utvikle-meny → Vis JavaScript-konsoll
    console.error('Eiendomsalg-kalkulator feilet:', error, info)
  }
  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
            maxWidth: 640,
            margin: '60px auto',
            padding: '24px 28px',
            background: '#fff',
            border: '1px solid #dcd6c8',
            borderRadius: 10,
            color: '#1c2b3a',
          }}
        >
          <h2 style={{ marginTop: 0 }}>Noe gikk galt i beregningen</h2>
          <p style={{ lineHeight: 1.5 }}>
            Kalkulatoren støtte på en verdi den ikke klarte å regne på — sannsynligvis en
            ugyldig kombinasjon av tall eller dato i et av feltene. Det er trygt å laste
            siden på nytt og prøve igjen.
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: 8,
              padding: '8px 16px',
              fontSize: 14,
              borderRadius: 6,
              border: '1px solid #2f6f5e',
              background: '#2f6f5e',
              color: '#fff',
              cursor: 'pointer',
            }}
          >
            Last siden på nytt
          </button>
          <p style={{ fontSize: 11.5, color: '#8a8271', marginTop: 18 }}>
            Teknisk detalj: {String(this.state.error && this.state.error.message)}
          </p>
        </div>
      )
    }
    return this.props.children
  }
}
