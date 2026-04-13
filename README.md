# Rooming

Rooming is a shared household management app for roommates. It helps a house coordinate expenses, chores, shopping, schedules, participants, announcements, and settings from one dashboard.

## Features

- Google sign-in with Firebase Authentication
- House onboarding flow (create a house or join via invite code)
- Role-based household profiles (`admin` and `member`)
- Unified dashboard with tabs for:
  - Overview
  - Announcements
  - Expenses
  - Chores
  - Participants
  - Shopping
  - Calendar
  - Settings
- Real-time data with Firebase Firestore
- Mobile-friendly layout with sidebar + sheet navigation
- Light/dark mode toggle with local preference persistence

## Tech Stack

- React + TypeScript
- Vite
- Firebase (Auth + Firestore)
- Tailwind CSS
- shadcn/ui components

## Getting Started

### Prerequisites

- Node.js 18+ (recommended)
- npm
- A Firebase project with Auth and Firestore enabled

### Installation

```bash
npm install
```

### Environment Variables

Create a local env file from the example:

```bash
cp .env.example .env.local
```

Set values in `.env.local`:

- `GEMINI_API_KEY` - required for Gemini-powered features
- `APP_URL` - app base URL for hosted environments

### Firebase Configuration

This project reads Firebase app config from `firebase-applet-config.json`.
Update this file with your Firebase project settings if you are running outside the original environment.

### Run Locally

```bash
npm run dev
```

App runs on `http://localhost:3000`.

## Scripts

- `npm run dev` - start local dev server
- `npm run build` - create production build
- `npm run preview` - preview production build
- `npm run lint` - type-check (`tsc --noEmit`)
- `npm run clean` - remove `dist`

## Project Structure

- `src/components/` - UI pages and dashboard tabs
- `src/contexts/` - app state and house/user context
- `src/services/` - service integrations (including Gemini)
- `src/firebase.ts` - Firebase initialization and helpers
- `firestore.rules` - Firestore security rules

## Deployment

The app can be deployed as a static frontend plus Firebase backend services.
For production, ensure:

- Firebase Auth providers are configured
- Firestore indexes/rules are applied
- Environment variables are set in your hosting provider

## License

Apache-2.0
