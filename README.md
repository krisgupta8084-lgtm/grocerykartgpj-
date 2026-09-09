# GroceryKart Full Stack

## Run locally
1. Install Node.js 20+.
2. Extract this folder.
3. Copy `.env.example` to `.env` and change `JWT_SECRET`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD`.
4. `npm install`
5. `npm start`
6. Open `http://localhost:3000`

## Important
The included customer authentication, SQLite database, products, stock, orders, and admin APIs are real server-side functionality.

For production, add HTTPS, secure cookie/session strategy or short-lived access/refresh tokens, rate limiting, validation, CSRF protection if cookies are used, email/SMS verification, backups, logging, and a real payment gateway. Online payment is not enabled by default because merchant credentials are required.

### Create admin
After first start, create a normal account through the UI. To create the first admin, run:
`node -e "require('better-sqlite3')('grocerykart.db').prepare('UPDATE users SET role=\'admin\' WHERE phone=?').run('YOUR_PHONE')"`
Then login through Admin Login. The admin password is the same password used for that account.

Do not expose `.env` or `grocerykart.db` publicly.
