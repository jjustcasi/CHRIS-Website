# CHRIS Website - Windows Server Deployment

This website is currently a static HTML/JS site with local authentication.
The project now includes a minimal Node.js backend for Google authentication and a path toward future database integration.

## What was added

- `server.js` — lightweight Express server that serves the site and verifies Google Sign-In tokens.
- `package.json` — Node dependencies and start script.
- `data/users.json` — initial local user store for prototype users.
- `config.js` — client-side configuration file for the Google client ID.

## Setup for Windows Server 2022

1. Install Node.js on the server (Node 18+ recommended).
2. Copy the project folder to the server.
3. Open PowerShell in the project root and run:

   ```powershell
   npm install
   ```

4. Create a `.env` file in the project root or set environment variables directly.

   Copy `.env.example` to `.env` and update the values, or set these values in PowerShell:

   ```powershell
   $env:GOOGLE_CLIENT_ID = 'YOUR_GOOGLE_CLIENT_ID'
   $env:DB_HOST = 'localhost'
   $env:DB_PORT = '3306'
   $env:DB_USER = 'your_mysql_user'
   $env:DB_PASSWORD = 'your_mysql_password'
   $env:DB_NAME = 'chris_website'
   ```

5. Create the MySQL database and users table using `db-schema.sql`:

   ```powershell
   mysql -u your_mysql_user -p < db-schema.sql
   ```

6. Start the backend:

   ```powershell
   npm start
   ```

The backend exposes `/config.js` dynamically, so `login.html` will load the correct Google client ID when the server is running.

7. Open the site in a browser at:

   ```text
   http://localhost:3000/login.html
   ```

## Google OAuth setup

- Create OAuth credentials in Google Cloud Console.
- Configure the authorized origin to the URL that will host the site.
- Use the created client ID in `config.js`.

## Current database integration

The backend now stores users in MySQL using `mysql2`.
The app loads environment variables from `.env` via `dotenv`, but you can also set them directly in Windows Server.

- `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` are required for MySQL.
- `GOOGLE_CLIENT_ID` is required for Google authentication.
- The database schema is provided in `db-schema.sql`.

## Future data improvements

- store other app data such as leaves, trainings, attendance, and announcements in database tables
- add server-side sessions or JWTs instead of browser-only session storage
- secure the app with HTTPS in production

## Notes

- This is a prototype backend for authentication only.
- The current site still uses local session tracking in the browser.
- For production, use a real database and secure session/cookie handling.
