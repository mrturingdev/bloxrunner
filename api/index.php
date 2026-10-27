<?php
// Bloxrunner API: SQLite via PDO, JSON in/out. See README "Data". PHP 7.4+.
const SKINS = ['dune' => 0, 'ember' => 100, 'comet' => 250, 'frost' => 400, 'aurora' => 700]; // keep in sync with SKINS in 3d/js/game.js
ini_set('display_errors', '0'); header('Content-Type: application/json'); header('Cache-Control: no-store');

function out($data, $status = 200) { http_response_code($status); echo json_encode($data); exit; }
function fail($code, $status) { out(['error' => $code], $status); }
set_exception_handler(function ($e) { error_log('bloxrunner: ' . $e); if (!headers_sent()) { header('Content-Type: application/json'); header('Cache-Control: no-store'); } fail('server_error', 500); });

function db() {
  $path = getenv('BLOXRUNNER_DB') ?: dirname(__DIR__, 2) . '/bloxrunner-data/bloxrunner.sqlite';
  $d = dirname($path);
  if (!is_dir($d) && !@mkdir($d, 0700, true) && !is_dir($d)) throw new RuntimeException('cannot create ' . $d);
  $db = new PDO('sqlite:' . $path, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
  $db->exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL');
  $db->exec("CREATE TABLE IF NOT EXISTS players(id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE COLLATE NOCASE, token_hash TEXT NOT NULL UNIQUE, coins INTEGER NOT NULL DEFAULT 0 CHECK(coins >= 0), skin TEXT NOT NULL DEFAULT 'dune', best_score INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS owned_skins(player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE, skin TEXT NOT NULL, PRIMARY KEY(player_id, skin));
    CREATE TABLE IF NOT EXISTS runs(id TEXT PRIMARY KEY, player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE, started_at REAL NOT NULL, finished_at REAL, score INTEGER, coins INTEGER);
    CREATE INDEX IF NOT EXISTS players_best ON players(best_score DESC, id)");
  return $db;
}
function q($db, $sql, $args = []) { $s = $db->prepare($sql); $s->execute($args); return $s; } // note: execute() binds as text, so CAST ? in arithmetic/compare
function level($score) { return 1 + intdiv($score, 300); }
function authed($db) { // player row or null
  $t = isset($_SERVER['HTTP_X_PLAYER_TOKEN']) ? $_SERVER['HTTP_X_PLAYER_TOKEN'] : '';
  return $t === '' ? null : (q($db, 'SELECT * FROM players WHERE token_hash = ?', [hash('sha256', $t)])->fetch() ?: null);
}
function player($db, $id) {
  $p = q($db, 'SELECT * FROM players WHERE id = ?', [$id])->fetch();
  $own = q($db, 'SELECT skin FROM owned_skins WHERE player_id = ?', [$id])->fetchAll(PDO::FETCH_COLUMN);
  return ['name' => $p['name'], 'coins' => (int)$p['coins'], 'skin' => $p['skin'], 'owned' => array_values(array_filter(array_keys(SKINS), function ($s) use ($own) { return in_array($s, $own, true); })), 'best_score' => (int)$p['best_score'], 'best_level' => level((int)$p['best_score'])];
}
function rank($db, $score) { return 1 + (int)q($db, 'SELECT COUNT(*) FROM players WHERE best_score > CAST(? AS INTEGER)', [$score])->fetchColumn(); }
function body() {
  $raw = file_get_contents('php://input');
  if (trim($raw) === '') return [];
  $b = json_decode($raw, true);
  if (!is_array($b)) fail('bad_request', 400);
  return $b;
}
function str($b, $k) { if (!isset($b[$k]) || !is_string($b[$k])) fail('bad_request', 400); return $b[$k]; }
function uint($b, $k) { if (!isset($b[$k]) || !is_int($b[$k]) || $b[$k] < 0) fail('bad_request', 400); return $b[$k]; }

$action = isset($_GET['action']) ? (string)$_GET['action'] : '';
$methods = ['register' => 'POST', 'me' => 'GET', 'run_start' => 'POST', 'run_finish' => 'POST', 'buy' => 'POST', 'equip' => 'POST', 'leaderboard' => 'GET'];
if (!isset($methods[$action])) fail('unknown_action', 404);
if ($_SERVER['REQUEST_METHOD'] !== $methods[$action]) fail('method_not_allowed', 405);

$db = db();
$me = authed($db);
if (!$me && !in_array($action, ['register', 'leaderboard'], true)) fail('unauthorized', 401);
$b = $methods[$action] === 'POST' ? body() : [];

if ($action === 'register') {
  $name = trim(str($b, 'name'));
  if (!preg_match('/^[A-Za-z0-9_]{3,16}$/', $name)) fail('invalid_name', 400);
  $token = bin2hex(random_bytes(32));
  $db->exec('BEGIN IMMEDIATE');
  if (q($db, 'SELECT 1 FROM players WHERE name = ?', [$name])->fetch()) { $db->exec('ROLLBACK'); fail('name_taken', 409); }
  q($db, 'INSERT INTO players(name, token_hash, created_at) VALUES(?, ?, ?)', [$name, hash('sha256', $token), time()]);
  $id = (int)$db->lastInsertId();
  q($db, "INSERT INTO owned_skins(player_id, skin) VALUES(?, 'dune')", [$id]);
  $db->exec('COMMIT');
  out(['token' => $token, 'player' => player($db, $id)], 201);
}

if ($action === 'me') out(['player' => player($db, $me['id'])]);

if ($action === 'run_start') {
  // ponytail: caps open runs at 2 per player, but a scripted client can still claim up to ~4 coins/s per open run; server-side replay checks if that matters
  $id = bin2hex(random_bytes(16)); $now = microtime(true);
  $db->exec('BEGIN IMMEDIATE');
  q($db, 'DELETE FROM runs WHERE player_id = ? AND finished_at IS NOT NULL AND finished_at < ?', [$me['id'], $now - 86400]);
  q($db, 'INSERT INTO runs(id, player_id, started_at) VALUES(?, ?, ?)', [$id, $me['id'], $now]);
  q($db, 'DELETE FROM runs WHERE player_id = ? AND finished_at IS NULL AND id NOT IN (SELECT id FROM runs WHERE player_id = ? AND finished_at IS NULL ORDER BY started_at DESC, rowid DESC LIMIT 2)', [$me['id'], $me['id']]);
  $db->exec('COMMIT');
  out(['run_id' => $id]);
}

if ($action === 'run_finish') {
  $rid = str($b, 'run_id'); $score = uint($b, 'score'); $coins = uint($b, 'coins');
  $run = q($db, 'SELECT * FROM runs WHERE id = ? AND player_id = ?', [$rid, $me['id']])->fetch();
  if (!$run) fail('run_not_found', 404);
  if ($run['finished_at'] !== null) fail('run_finished', 409);
  $now = microtime(true); $elapsed = $now - $run['started_at'];
  $plausible = $score <= floor($elapsed * 20) + min(60, floor($elapsed * 10)) && $coins <= floor($elapsed * 4) + min(4, floor($elapsed)); // boost doubles 300/45 per s, +10 per obstacle smashed while boosted
  $db->exec('BEGIN IMMEDIATE');
  if (!q($db, 'UPDATE runs SET finished_at = ?, score = ?, coins = ? WHERE id = ? AND finished_at IS NULL', [$now, $plausible ? $score : null, $plausible ? $coins : null, $rid])->rowCount()) { $db->exec('ROLLBACK'); fail('run_finished', 409); }
  if ($plausible) q($db, 'UPDATE players SET coins = coins + CAST(? AS INTEGER), best_score = max(best_score, CAST(? AS INTEGER)) WHERE id = ?', [$coins, $score, $me['id']]);
  $db->exec('COMMIT');
  if (!$plausible) fail('implausible_run', 422);
  $p = player($db, $me['id']);
  out(['player' => $p, 'rank' => rank($db, $p['best_score'])]);
}

if ($action === 'buy' || $action === 'equip') {
  $skin = str($b, 'skin');
  if (!isset(SKINS[$skin])) fail('unknown_skin', 422);
  if ($action === 'equip') {
    if (!q($db, 'SELECT 1 FROM owned_skins WHERE player_id = ? AND skin = ?', [$me['id'], $skin])->fetch()) fail('skin_not_owned', 422);
    q($db, 'UPDATE players SET skin = ? WHERE id = ?', [$skin, $me['id']]);
    out(['player' => player($db, $me['id'])]);
  }
  $db->exec('BEGIN IMMEDIATE');
  if (q($db, 'SELECT 1 FROM owned_skins WHERE player_id = ? AND skin = ?', [$me['id'], $skin])->fetch()) { $db->exec('ROLLBACK'); fail('already_owned', 409); }
  if (!q($db, 'UPDATE players SET coins = coins - CAST(? AS INTEGER), skin = ? WHERE id = ? AND coins >= CAST(? AS INTEGER)', [SKINS[$skin], $skin, $me['id'], SKINS[$skin]])->rowCount()) { $db->exec('ROLLBACK'); fail('not_enough_coins', 422); }
  q($db, 'INSERT INTO owned_skins(player_id, skin) VALUES(?, ?)', [$me['id'], $skin]);
  $db->exec('COMMIT');
  out(['player' => player($db, $me['id'])]);
}

// leaderboard
$row = function ($p) use ($db) { return ['rank' => rank($db, (int)$p['best_score']), 'name' => $p['name'], 'best_score' => (int)$p['best_score'], 'best_level' => level((int)$p['best_score'])]; };
$top = array_map($row, q($db, 'SELECT name, best_score FROM players WHERE best_score > 0 ORDER BY best_score DESC, id ASC LIMIT 20')->fetchAll());
out(['top' => $top, 'me' => $me && $me['best_score'] > 0 ? $row($me) : null]);
