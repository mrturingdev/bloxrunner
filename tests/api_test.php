<?php
// Run: php tests/api_test.php  (starts its own php -S on a free port with a temp DB)
$root = dirname(__DIR__);
$db = sys_get_temp_dir() . '/bloxrunner-test-' . bin2hex(random_bytes(4)) . '.sqlite';
$s = stream_socket_server('tcp://127.0.0.1:0'); $port = (int)substr(strrchr(stream_socket_get_name($s, false), ':'), 1); fclose($s);
$proc = proc_open([PHP_BINARY, '-S', "127.0.0.1:$port", '-t', $root], [['pipe', 'r'], ['file', '/dev/null', 'w'], ['file', '/dev/null', 'w']], $pipes, $root, array_merge($_ENV, ['BLOXRUNNER_DB' => $db]) + ['PATH' => getenv('PATH')]);
function cleanup() { global $proc, $db; if ($proc) proc_terminate($proc); foreach ([$db, "$db-wal", "$db-shm"] as $f) @unlink($f); }
register_shutdown_function('cleanup');
for ($i = 0, $up = false; $i < 100 && !$up; $i++) { $up = @fsockopen('127.0.0.1', $port); if (!$up) usleep(100000); }
if (!$up) { echo "server did not start\n"; exit(1); }

$pass = 0; $fail = 0;
function req($method, $action, $body = null, $token = null, $raw = null) {
  global $port;
  $h = "Content-Type: application/json\r\n" . ($token ? "X-Player-Token: $token\r\n" : '');
  $ctx = stream_context_create(['http' => ['method' => $method, 'header' => $h, 'content' => $raw !== null ? $raw : ($body !== null ? json_encode($body) : ''), 'ignore_errors' => true]]);
  $out = file_get_contents("http://127.0.0.1:$port/api/index.php?action=$action", false, $ctx);
  preg_match('#HTTP/\S+ (\d+)#', $http_response_header[0], $m);
  return [(int)$m[1], json_decode($out, true), $http_response_header];
}
function check($name, $ok) { global $pass, $fail; if ($ok) $pass++; else { $fail++; echo "FAIL: $name\n"; } }
function expect($name, $res, $status, $err = null) { check("$name (got {$res[0]} " . json_encode($res[1]) . ")", $res[0] === $status && ($err === null || ($res[1]['error'] ?? null) === $err)); }
function reg($name) { $r = req('POST', 'register', ['name' => $name]); return [$r[1]['token'] ?? '', $r]; }

// headers + routing
$r = req('GET', 'nope'); expect('unknown action', $r, 404, 'unknown_action');
check('json content type', stripos(implode("\n", $r[2]), 'Content-Type: application/json') !== false);
check('no-store', stripos(implode("\n", $r[2]), 'Cache-Control: no-store') !== false);
expect('register wrong method', req('GET', 'register'), 405, 'method_not_allowed');
expect('me wrong method', req('POST', 'me'), 405, 'method_not_allowed');

// register
foreach (['ab', 'has space', 'waytoolongname12345', 'bad-char', ''] as $n) expect("invalid name '$n'", req('POST', 'register', ['name' => $n]), 400, 'invalid_name');
expect('register malformed json', req('POST', 'register', null, null, '{nope'), 400, 'bad_request');
expect('register name not string', req('POST', 'register', ['name' => 5]), 400, 'bad_request');
list($tokA, $r) = reg('  Alice_1 ');
expect('register ok', $r, 201);
check('token is 64 hex', preg_match('/^[0-9a-f]{64}$/', $tokA) === 1);
check('player shape', $r[1]['player'] === ['name' => 'Alice_1', 'coins' => 0, 'skin' => 'dune', 'owned' => ['dune'], 'best_score' => 0, 'best_level' => 1]);
expect('name taken (case-insensitive)', req('POST', 'register', ['name' => 'ALICE_1']), 409, 'name_taken');
list($tokB) = reg('Bob_2');

// me / auth
expect('me ok', $r = req('GET', 'me', null, $tokA), 200); check('me name', $r[1]['player']['name'] === 'Alice_1');
expect('me no token', req('GET', 'me'), 401, 'unauthorized');
expect('me bad token', req('GET', 'me', null, str_repeat('0', 64)), 401, 'unauthorized');
expect('run_start no token', req('POST', 'run_start'), 401, 'unauthorized');
expect('buy no token', req('POST', 'buy', ['skin' => 'ember']), 401, 'unauthorized');

// runs
$r = req('POST', 'run_start', null, $tokA); expect('run_start', $r, 200); $run = $r[1]['run_id'];
check('run id 32 hex', preg_match('/^[0-9a-f]{32}$/', $run) === 1);
foreach ([['score' => '10', 'coins' => 4], ['score' => 10, 'coins' => 4.5], ['score' => -1, 'coins' => 0], ['score' => 10], ['run_id' => $run, 'score' => 10, 'coins' => '4']] as $i => $b)
  expect("run_finish bad fields #$i", req('POST', 'run_finish', $b + ['run_id' => $run], $tokA), 400, 'bad_request');
expect('run_finish unknown run', req('POST', 'run_finish', ['run_id' => 'deadbeef', 'score' => 1, 'coins' => 0], $tokA), 404, 'run_not_found');
expect('run_finish other player', req('POST', 'run_finish', ['run_id' => $run, 'score' => 1, 'coins' => 0], $tokB), 404, 'run_not_found');
$r = req('POST', 'run_finish', ['run_id' => $run, 'score' => 10, 'coins' => 4], $tokA); expect('run_finish ok', $r, 200);
check('wallet + best updated', $r[1]['player']['coins'] === 4 && $r[1]['player']['best_score'] === 10 && $r[1]['player']['best_level'] === 1 && $r[1]['rank'] === 1);
expect('run_finish twice', req('POST', 'run_finish', ['run_id' => $run, 'score' => 1, 'coins' => 0], $tokA), 409, 'run_finished');
$run = req('POST', 'run_start', null, $tokA)[1]['run_id'];
expect('run_finish implausible', req('POST', 'run_finish', ['run_id' => $run, 'score' => 5000, 'coins' => 0], $tokA), 422, 'implausible_run');
expect('implausible run is closed', req('POST', 'run_finish', ['run_id' => $run, 'score' => 1, 'coins' => 0], $tokA), 409, 'run_finished');
$run = req('POST', 'run_start', null, $tokA)[1]['run_id'];
expect('implausible coins', req('POST', 'run_finish', ['run_id' => $run, 'score' => 1, 'coins' => 500], $tokA), 422, 'implausible_run');
$run = req('POST', 'run_start', null, $tokA)[1]['run_id'];
$r = req('POST', 'run_finish', ['run_id' => $run, 'score' => 3, 'coins' => 1], $tokA);
check('best score keeps max, coins accumulate', $r[1]['player']['best_score'] === 10 && $r[1]['player']['coins'] === 5);

// shop
$pdo = new PDO("sqlite:$db"); $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
$pdo->exec("UPDATE players SET coins = 500 WHERE name = 'Alice_1'");
expect('buy unknown skin', req('POST', 'buy', ['skin' => 'gold'], $tokA), 422, 'unknown_skin');
expect('buy owned', req('POST', 'buy', ['skin' => 'dune'], $tokA), 409, 'already_owned');
expect('buy too poor', req('POST', 'buy', ['skin' => 'aurora'], $tokA), 422, 'not_enough_coins');
$r = req('POST', 'buy', ['skin' => 'comet'], $tokA); expect('buy ok', $r, 200);
check('buy deducts + equips', $r[1]['player']['coins'] === 250 && $r[1]['player']['skin'] === 'comet' && $r[1]['player']['owned'] === ['dune', 'comet']);
$r = req('POST', 'buy', ['skin' => 'ember'], $tokA);
check('owned follows SKINS order', $r[1]['player']['owned'] === ['dune', 'ember', 'comet'] && $r[1]['player']['coins'] === 150);
expect('equip unknown', req('POST', 'equip', ['skin' => 'gold'], $tokA), 422, 'unknown_skin');
expect('equip unowned', req('POST', 'equip', ['skin' => 'frost'], $tokA), 422, 'skin_not_owned');
$r = req('POST', 'equip', ['skin' => 'dune'], $tokA); expect('equip ok', $r, 200); check('equipped', $r[1]['player']['skin'] === 'dune');
expect('buy without coins', req('POST', 'buy', ['skin' => 'ember'], $tokB), 422, 'not_enough_coins');
expect('buy bad field', req('POST', 'buy', ['skin' => 5], $tokA), 400, 'bad_request');

// leaderboard: Alice 10; add Carol 10 (tie), Dave 650, Erin 0
$mk = $pdo->prepare("INSERT INTO players(name, token_hash, best_score, created_at) VALUES(?, ?, ?, 0)");
foreach ([['Carol', 10], ['Dave', 650], ['Erin', 0]] as $i => $p) $mk->execute([$p[0], "h$i", $p[1]]);
$r = req('GET', 'leaderboard'); expect('leaderboard anon', $r, 200);
check('order + ranks + levels', $r[1]['top'] === [
  ['rank' => 1, 'name' => 'Dave', 'best_score' => 650, 'best_level' => 3],
  ['rank' => 2, 'name' => 'Alice_1', 'best_score' => 10, 'best_level' => 1],
  ['rank' => 2, 'name' => 'Carol', 'best_score' => 10, 'best_level' => 1]]);
check('me null when anon', $r[1]['me'] === null);
$r = req('GET', 'leaderboard', null, $tokA); check('me present', $r[1]['me'] === ['rank' => 2, 'name' => 'Alice_1', 'best_score' => 10, 'best_level' => 1]);
$r = req('GET', 'leaderboard', null, $tokB); check('me null at zero score', $r[1]['me'] === null);
$r = req('GET', 'leaderboard', null, 'badtoken'); expect('leaderboard ignores bad token', $r, 200); check('me null bad token', $r[1]['me'] === null);
expect('leaderboard wrong method', req('POST', 'leaderboard'), 405, 'method_not_allowed');

// top 20 cap
for ($i = 0; $i < 25; $i++) $mk->execute(["P$i", "x$i", 1000 + $i]);
check('top capped at 20', count(req('GET', 'leaderboard')[1]['top']) === 20);

// stale unfinished runs are purged on run_start
$pid = $pdo->query("SELECT id FROM players WHERE name = 'Bob_2'")->fetchColumn();
$pdo->prepare("INSERT INTO runs(id, player_id, started_at) VALUES('stale', ?, ?)")->execute([$pid, microtime(true) - 90000]);
req('POST', 'run_start', null, $tokB);
check('stale run deleted', (int)$pdo->query("SELECT COUNT(*) FROM runs WHERE id = 'stale'")->fetchColumn() === 0);

echo $fail ? "FAILED: $fail failed, $pass passed\n" : "OK: $pass passed\n";
exit($fail ? 1 : 0);
