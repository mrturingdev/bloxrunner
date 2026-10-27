# Bloxrunner

An endless runner: sprint across the dunes, dodge obstacles, collect coins, unlock skins.

```
bloxrunner/
├── index.php         PHP entrypoint
├── launchgame.html   launcher page
├── README.md
├── api/              PHP + SQLite API for the 3D build
├── logo/             logo and icon (PNG + SVG)
├── 2d/               original 2D version (canvas only, works offline)
├── 3d/               the main game (three.js)
└── admin/            3D game plus a testing panel (separate saved data)
    each folder has:  index.html, css/style.css, js/game.js
```

## Run it
Open `launchgame.html` in a browser (or serve `index.php`). There is no build step.
The 3D and admin versions load three.js r128 from cdnjs.cloudflare.com, so they need an internet connection.

## Controls
- Jump: Space / Up / W / tap. Tap again in the air for a double jump.
- Duck: Down / S, or swipe down (swipe left in rotated landscape).
- Skin power: E / Shift, or the round button (recharges every 90 s).
- Mute: M. Admin panel (admin build): backtick (`) or the Admin button.

## Game design (3D and admin builds)
- **Levels** last about 45 seconds. Speed ramps gently up to a cap; obstacle spacing stays fair.
- **Obstacles:** cacti, rocks, low and high birds, triple cacti, combos, and giant cacti / crystal spires that need a double jump.
- **Coins** float above 1 in 4 ground obstacles. Spend them in the skin shop.
- **Skins** give extra lives and/or a power you trigger yourself: speed boost (Comet, Aurora) or slow time (Frost).
- **Power-ups** on the road: speed boost (smash through obstacles) and slow time.
- **Road** bends left and right; a day/night cycle moves the sun and moon.
- **Weather by level:** L2 icy road, L3 muddy road, L4 thunderstorm (tap to dodge lightning), L5 dust storm (hardest).
- Window, portrait-fullscreen and landscape-fullscreen modes; music and sound effects are synthesized in the browser.

## Notes
- The 3D build keeps player name, coins, skins, best score and the leaderboard on the server (see Data). The 2D and admin builds save progress in localStorage with their own keys.
- In the 3D builds the 2D canvas is only the HUD drawn over the three.js scene.
- Game logic and rendering live together in `js/game.js` in each folder.

## Data
- The 3D build talks to `api/index.php` (PHP 7.4+ with pdo_sqlite). The SQLite file is `$HOME/bloxrunner-data/bloxrunner.sqlite`, outside the docroot; set `BLOXRUNNER_DB` to use another path.
- The directory, file and tables are created automatically on the first request. Back up that file (it also has `-wal` and `-shm` siblings while running).
- A player is a unique name plus a secret device token kept in localStorage (`bloxrunner-token`) and sent as the `X-Player-Token` header.
- Known limits: run checks are only plausibility caps, so a determined cheater can forge plausible runs (up to ~4 coins/s per open run, at most 2 open runs); registration has no rate limit.
- Tests: `php tests/api_test.php` (starts its own `php -S` server on a free port with a temp database).

## Deploy to cPanel
Static site, no build step. Publish with cPanel's built-in Git Version Control:

Before the first deploy, confirm cPanel > MultiPHP Manager runs PHP 7.4+ with pdo_sqlite for the domain. If `~/bloxrunner-data` cannot be created automatically, create it yourself with `chmod 700`.

1. `.cpanel.yml` deploys to `$HOME/bloxrunner.mrturingdev.com/`, the subdomain's document root.
2. cPanel > **Git Version Control** > **Create**: clone `https://github.com/mrturingdev/bloxrunner.git` (public repo, no credentials needed).
3. Tick **Automatic Deployment**, then **Update from Remote** once. Every push to `main` now redeploys to the subdomain.

`admin/` is published too; add `--exclude=admin` to the rsync line if it should stay private.
No Git Version Control in your plan? Use an FTP deploy action (e.g. `SamKirkland/FTP-Deploy-Action`) with FTP credentials from cPanel > FTP Accounts instead.

### Alternative: GitHub Actions via cPanel API
Inbound SSH from CI is blocked by this host (TCP 22 opens, no SSH banner), so `.github/workflows/deploy.yml` deploys over HTTPS instead: it asks cPanel to run the repo's deployment. Repository secrets:

| Secret | Value |
|---|---|
| `CPANEL_HOST` | server hostname or domain (e.g. `mrturingdev.com`) |
| `CPANEL_USER` | cPanel username |
| `CPANEL_TOKEN` | API token: cPanel > Security > **Manage API Tokens** > Create |
| `CPANEL_REPO` | `/home/<user>/repositories/bloxrunner` (Repository Path from Git Version Control) |
| `CPANEL_PORT` | optional, defaults to `2083` |

Requires the repository to already exist in cPanel's Git Version Control. The job queues `VersionControlDeployment/create`; the deploy log is server-side at the returned `log_path`.
