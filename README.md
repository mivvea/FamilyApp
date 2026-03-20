# FamilyApp

FamilyApp is a GitHub Pages frontend for the public FamilyApi backend. TEST

## Stack
- HTML + CSS + Vanilla JavaScript
- Hash-based routing that works on GitHub Pages
- `fetch` for backend communication

## Build
1. `npm install`
2. `npm run build`

The build output is written to `dist/`.

## Deployment
The repository is configured for GitHub Pages through GitHub Actions. Make sure the repository setting is:
- **Settings → Pages → Source = GitHub Actions**

Default application URL:
- `https://mivvea.github.io/FamilyApp/`

## API integration
This frontend is aligned with the public `mivvea/FamilyApi` repository.

Supported backend functions in the UI:
- `POST /User/register`
- `POST /User/login`
- `GET /User/Photo`
- `GET /Video`
- `GET /Dishes`
- `GET /Dishes/my`
- `GET /Dishes/random`
- `POST /Dishes`
- `DELETE /Dishes/{id}`
- `GET /Movies`
- `GET /Movies/my`
- `GET /Movies/random`
- `POST /Movies`
- `DELETE /Movies/{id}`

## Notes
- The home page greets logged-in users with `Hi, user!`, shows the welcome video first, and then renders the logged-in user photo using a `data:image/png;base64,` prefix when `/User/Photo` returns an inline base64 string.
- The frontend now explicitly calls `video.play()` after render to maximize the chance of autoplay, although some browsers may still require a user gesture for unmuted playback.
- The app now uses the current lowercase `/my` routes from `FamilyApi`.
- Edit is implemented in the frontend as a replace flow: delete the owned item and create the updated version with the new values.
- Delete and edit actions are shown only for items owned by the logged-in user.
