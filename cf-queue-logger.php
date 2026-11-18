<?php
/**
 * Cloudflare Fast File-Buffer Click Logger for YOURLS (Queue System)
 * 
 * Non-blocking file append buffer that defers MySQL writes to a scheduled cron job (e.g. every 5 minutes).
 * Drops origin server wall time from ~150 ms down to < 0.5 ms.
 *
 * Copy this file to your YOURLS root folder (next to yourls-loader.php).
 */

ignore_user_abort(true);
set_time_limit(5);

// =========================================================================
// MASTER LOGGING SWITCH
// Set to false to instantly drop all click logging with zero disk/buffer overhead
// =========================================================================
const ENABLE_LOG_CLICK = true;

if (!ENABLE_LOG_CLICK) {
    http_response_code(200); // Return 200 so Cloudflare Worker isolate cleanly resolves
    exit('Logging is currently disabled.');
}
// =========================================================================

// 1. Enforce strict POST method
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    http_response_code(405);
    exit('Method Not Allowed');
}

// 2. Fast header presence check
if (!isset($_SERVER['HTTP_X_AUTH_KEY'])) {
    http_response_code(401);
    exit('Unauthorized');
}

require_once __DIR__ . '/user/config.php';

// 3. Timing-attack-safe authentication
if (!defined('LOGGING_SECRET_KEY') || !hash_equals(LOGGING_SECRET_KEY, (string)$_SERVER['HTTP_X_AUTH_KEY'])) {
    http_response_code(401);
    exit('Unauthorized');
}

// 4. Read raw input with payload size limit (max 2 KB to prevent disk-filling attacks)
$input = file_get_contents('php://input');
if (empty($input) || strlen($input) > 2048) {
    http_response_code(400);
    exit('Bad Request');
}

// 5. Basic JSON validation to ensure only valid data enters the buffer
$data = json_decode($input);
if (!$data || !isset($data->shortcode) || !is_string($data->shortcode)) {
    http_response_code(400);
    exit('Bad Request');
}

// Write to the protected cf-clicks folder
$buffer_dir  = __DIR__ . '/cf-clicks';
$buffer_file = $buffer_dir . '/click_buffer.log';

// Auto-create directory with safe permissions if not existing
if (!is_dir($buffer_dir)) {
    @mkdir($buffer_dir, 0750, true);
}

// Ensure .htaccess protection exists inside cf-clicks
$htaccess = $buffer_dir . '/.htaccess';
if (!file_exists($htaccess)) {
    @file_put_contents(
        $htaccess,
        "# Block direct HTTP access to log files\n" .
        "<IfModule !mod_authz_core.c>\n    Order deny,allow\n    Deny from all\n</IfModule>\n" .
        "<IfModule mod_authz_core.c>\n    Require all denied\n</IfModule>\n"
    );
}

// Use POSIX atomic append without LOCK_EX (safe for payloads under 4 KB, eliminates lock-wait queuing)
file_put_contents($buffer_file, $input . PHP_EOL, FILE_APPEND);

http_response_code(200);
echo 'OK';
