# Analiza zależności zmiennych — full-stack app (React + FastAPI + R)

To repo zawiera działający przykład aplikacji do analizy zależności zmiennych z wykorzystaniem R (ggplot2, stats) wywoływanego przez Python/rpy2. Stos technologiczny zgodny z wymaganiem: React (frontend), Tailwind (CDN), Plot/obrazki z R, FastAPI (backend), rpy2, Pandas/Numpy.

Struktura:
- backend/ — kod FastAPI (Python)
- r_scripts/ — skrypt R wykonujący testy i generujący wykresy
- frontend/ — aplikacja React (Vite)
- Dockerfile — opcjonalny kontener dla backendu

Wymagania lokalne:
- Python 3.10+ z pip
- R (np. R 4.x) z pakietami ggplot2, corrplot, psych (skrypt instaluje wymagane pakiety, jeśli uruchamiasz Dockerfile)
- Node.js 18+ (do uruchomienia frontendu)

Instalacja i uruchomienie (sposób 1 — lokalnie, bez Dockera):

1) Backend (lokalnie)
- Utwórz i aktywuj virtualenv:
  python3 -m venv .venv
  source .venv/bin/activate
- Zainstaluj wymagania:
  pip install -r backend/requirements.txt
- Upewnij się, że R jest zainstalowane w systemie i pakiety ggplot2, corrplot, psych są dostępne.
  W R: install.packages(c("ggplot2","corrplot","psych"), repos="https://cloud.r-project.org")
- Uruchom backend:
  uvicorn backend.main:app --reload --port 8000

2) Frontend
- Przejdź do folderu frontend:
  cd frontend
- Zainstaluj zależności:
  npm install
- Uruchom dev server:
  npm run dev
- Domyślnie frontend będzie dostępny pod http://localhost:5173 a backend pod http://localhost:8000

Sposób 2 — Docker (tylko backend)
- Zbuduj obraz:
  docker build -t dep-analysis-backend .
- Uruchom kontener:
  docker run -p 8000:8000 dep-analysis-backend

Uwaga: w kontenerze backendu instalowane jest R oraz wymagane R-packages. Frontend można uruchomić lokalnie (npm run dev) lub zbudować i serwować statycznie.

Jak używać aplikacji:
1. Na stronie frontend: prześlij plik CSV (kolumny z nagłówkami).
2. Po wczytaniu wybierz dwie kolumny (X i Y) i kliknij "Analizuj".
3. Backend wykona testy (R przez rpy2), zwróci rekomendowany test oraz link do wygenerowanego wykresu. Frontend wyświetli wynik i podświetli odpowiedni węzeł na diagramie decyzyjnym.

