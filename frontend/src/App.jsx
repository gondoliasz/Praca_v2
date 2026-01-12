import React from "react";
import AnalyzePanel from "./components/AnalyzePanel.jsx";
import "bootstrap/dist/css/bootstrap.min.css"; // optional but recommended
import "./App.css"; // global styles

function App() {
  return (
    <div className="App">
      <header className="py-4 text-center bg-light mb-4">
        <h1 className="m-0">Analiza zależności zmiennych</h1>
      </header>

      <main className="container">
        <AnalyzePanel />
      </main>

      <footer className="text-center text-muted py-4">
        <small>Twoja aplikacja • Lokalny serwer</small>
      </footer>
    </div>
  );
}

export default App;