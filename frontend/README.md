# Synaptech HMS

Synaptech HMS is a hardware management system for Synaptech that helps the club track and organize its equipment. The platform is designed to support both an admin experience and a user experience so inventory can be managed efficiently while members can check out hardware when needed.

## Features

- Admin-side dashboard for managing hardware inventory and club operations
- User-side experience for browsing available equipment and requesting checkouts
- Centralized views for inventory status and actions
- Simple API-backed frontend for rapid development and iteration

## Project Structure

- `backend/` contains the Express API server
- `frontend/` contains the React + Vite client application

## Tech Stack

- Frontend: React, TypeScript, Vite
- Backend: Express, TypeScript
- Styling: custom CSS in the frontend

## Getting Started

### Prerequisites

- Node.js
- npm

### Install dependencies

```bash
cd backend
npm install

cd ../frontend
npm install
```

### Run the backend

```bash
cd backend
npm run dev
```

### Run the frontend

```bash
cd frontend
npm run dev
```

The frontend is configured to proxy API requests to the backend during local development.

## Development Notes

- The backend serves mock and structured data for dashboard and action endpoints.
- The frontend currently focuses on the admin dashboard experience, with room to expand into full user workflows.

## License

This project is for Synaptech club use and is intended for internal development and demonstration.
