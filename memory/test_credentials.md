# Test Credentials — TradinX preview

Auth is **fully mocked client-side** in this preview (the upstream Express API isn't running).

- **Login route**: `/login`
- **Demo email**: `trader@tradinx.io`
- **Demo password**: anything (any value advances to `/dashboard`)
- **Guest mode**: a `CONTINUE AS GUEST` button on `/login` also lands on the dashboard

A "Sign out" action sends the user back to `/login` but immediately re-authenticates on next visit (mock session).

## Mock account IDs (already seeded into `/data/accounts`)
- `acc-xm-345636702` — XM Global, MT5 login `345636702`, $25,000 starting balance, 78 trades
- `acc-icmarkets-441288` — IC Markets, MT5 login `441288`, $10,000 starting balance, 42 trades
