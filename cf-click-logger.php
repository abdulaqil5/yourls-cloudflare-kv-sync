<?php
/**
 * Cloudflare Fast Click Logging Bridge for YOURLS (Direct Database Mode)
 *
 * Synchronous direct database logger. Use this if you cannot run a cron job
 * for the high-performance Queue System (cf-queue-logger.php + process-clicks.php).
 *
 * Place this file in your YOURLS root directory (next to yourls-loader.php).
 */

ignore_user_abort(true);
set_time_limit(10);

// =========================================================================
// MASTER LOGGING SWITCH
// Set to false to instantly drop all click logging with zero DB overhead
// =========================================================================
const ENABLE_LOG_CLICK = true;

if (!ENABLE_LOG_CLICK) {
    http_response_code(200);
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

// 4. Read raw input with payload size limit (max 2 KB)
$input = file_get_contents('php://input');
if (empty($input) || strlen($input) > 2048) {
    http_response_code(400);
    exit('Bad Request');
}

// Load YOURLS DB core only
require_once __DIR__ . '/includes/load-yourls.php';
global $ydb;

$data = json_decode($input);
if (!$data || !isset($data->shortcode) || !is_string($data->shortcode)) {
    http_response_code(400);
    exit('Bad Request');
}

// Sanitize and Truncate to prevent DB errors
$shortcode  = yourls_sanitize_keyword($data->shortcode);
$ip         = yourls_sanitize_ip((string)($data->ip ?? '0.0.0.0'));
$referrer   = (!empty($data->referrer)) ? yourls_sanitize_url((string)$data->referrer) : 'direct';
$user_agent = substr(yourls_sanitize_string((string)($data->userAgent ?? '')), 0, 254);
$country    = substr(yourls_sanitize_string((string)($data->country ?? 'XX')), 0, 2);
$timestamp  = isset($data->time) && is_numeric($data->time) ? date('Y-m-d H:i:s', (int)$data->time) : date('Y-m-d H:i:s');

// 1. Increment Clicks
$update_sql = "UPDATE `" . YOURLS_DB_TABLE_URL . "` SET `clicks` = clicks + 1 WHERE `keyword` = :keyword";
$ydb->fetchAffected($update_sql, ['keyword' => $shortcode]);

// 2. Insert Log Entry
$insert_sql = "INSERT INTO `" . YOURLS_DB_TABLE_LOG . "` (click_time, shorturl, referrer, user_agent, ip_address, country_code) 
               VALUES (:time, :short, :ref, :ua, :ip, :cc)";
$ydb->fetchAffected($insert_sql, [
    'time'  => $timestamp,
    'short' => $shortcode,
    'ref'   => $referrer,
    'ua'    => $user_agent,
    'ip'    => $ip,
    'cc'    => $country
]);

http_response_code(200);
echo "OK";
