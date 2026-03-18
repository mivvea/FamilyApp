# FamilyApp

FamilyApp to statyczny frontend hostowany na GitHub Pages i komunikujący się z backendem FamilyApi.

## Stack
- HTML + CSS + Vanilla JavaScript
- Hash routing kompatybilny z GitHub Pages
- Fetch API do komunikacji z backendem

## Build
1. `npm install`
2. `npm run build`

Wynik builda trafia do katalogu `dist/`.

## Deployment
Repo jest skonfigurowane pod GitHub Pages przez GitHub Actions. Aby publikacja zadziałała, w ustawieniach repozytorium ustaw:
- **Settings → Pages → Source = GitHub Actions**

Domyślny adres aplikacji:
- `https://mivvea.github.io/FamilyApp/`

## API
Frontend korzysta z:
- `https://mivvea.runasp.net/api`
