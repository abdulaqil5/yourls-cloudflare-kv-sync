<?php
/**
 * Cron Batch Processor for Buffered Clicks (YOURLS Queue System)
 *
 * Runs once every minute via cron job.
 * Groups click counts in memory and inserts bulk logs into MySQL.
 *
 * Usage:
 * CLI (cPanel Cron): php /path/to/yourls/process-clicks.php
 * HTTP (Web Cron):  https://yourdomain.com/process-clicks.php?secret=YOUR_LOGGING_SECRET_KEY
 */

require_once __DIR__ . '/user/config.php';

// Strict Execution Check: CLI only, or verified HTTP secret key
$is_cli = (php_sapi_name() === 'cli');
$has_valid_secret = isset($_GET['secret']) && defined('LOGGING_SECRET_KEY') && hash_equals(LOGGING_SECRET_KEY, (string)$_GET['secret']);

if (!$is_cli && !$has_valid_secret) {
    http_response_code(403);
    die('Forbidden: Access Denied');
}

$buffer_dir      = __DIR__ . '/cf-clicks';
$buffer_file     = $buffer_dir . '/click_buffer.log';
$processing_file = $buffer_dir . '/click_processing_' . time() . '.log';

// Exit if no clicks are waiting
if (!file_exists($buffer_file) || filesize($buffer_file) === 0) {
    exit(0);
}

// Atomically move the buffer file to processing
if (!@rename($buffer_file, $processing_file)) {
    exit(0);
}

// Load YOURLS DB
require_once __DIR__ . '/includes/load-yourls.php';
global $ydb;

$lines = file($processing_file, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
if (empty($lines)) {
    @unlink($processing_file);
    exit(0);
}

$click_counts = [];
$log_entries = [];

foreach ($lines as $line) {
    $data = json_decode($line);
    if (!$data || !isset($data->shortcode)) continue;

    $shortcode = yourls_sanitize_keyword((string)$data->shortcode);
    $ip        = yourls_sanitize_ip((string)($data->ip ?? '0.0.0.0'));
    $referrer  = (!empty($data->referrer)) ? yourls_sanitize_url((string)$data->referrer) : 'direct';
    $ua        = substr(yourls_sanitize_string((string)($data->userAgent ?? '')), 0, 254);
    $country   = substr(yourls_sanitize_string((string)($data->country ?? 'XX')), 0, 2);
    $time      = isset($data->time) && is_numeric($data->time) ? date('Y-m-d H:i:s', (int)$data->time) : date('Y-m-d H:i:s');

    // 1. Group click counts to prevent MySQL row locks
    if (!isset($click_counts[$shortcode])) {
        $click_counts[$shortcode] = 0;
    }
    $click_counts[$shortcode]++;

    // 2. Queue for bulk insert
    $log_entries[] = [
        'time'  => $time,
        'short' => $shortcode,
        'ref'   => $referrer,
        'ua'    => $ua,
        'ip'    => $ip,
        'cc'    => $country
    ];
}

// A. Aggregate Update: 1 single query per shortcode
foreach ($click_counts as $keyword => $count) {
    $update_sql = "UPDATE `" . YOURLS_DB_TABLE_URL . "` SET `clicks` = `clicks` + :count WHERE `keyword` = :keyword";
    $ydb->fetchAffected($update_sql, ['count' => $count, 'keyword' => $keyword]);
}

// B. Bulk Multi-Row Insert in batches of 500
$chunks = array_chunk($log_entries, 500);
foreach ($chunks as $chunk) {
    $values = [];
    $params = [];
    foreach ($chunk as $i => $row) {
        $values[] = "(:time{$i}, :short{$i}, :ref{$i}, :ua{$i}, :ip{$i}, :cc{$i})";
        $params["time{$i}"]  = $row['time'];
        $params["short{$i}"] = $row['short'];
        $params["ref{$i}"]   = $row['ref'];
        $params["ua{$i}"]    = $row['ua'];
        $params["ip{$i}"]    = $row['ip'];
        $params["cc{$i}"]    = $row['cc'];
    }

    $insert_sql = "INSERT INTO `" . YOURLS_DB_TABLE_LOG . "` 
                  (click_time, shorturl, referrer, user_agent, ip_address, country_code) 
                  VALUES " . implode(', ', $values);

    $ydb->fetchAffected($insert_sql, $params);
}

// Cleanup processed file
@unlink($processing_file);
echo "Successfully processed " . count($lines) . " clicks." . PHP_EOL;
