<?php
/**
 * Cloudflare Fast Click Logging Bridge for YOURLS
 * Place this file in your YOURLS root directory (next to yourls-loader.php).
 */

if ( !isset( $_SERVER['HTTP_X_AUTH_KEY'] ) ) {
    header("HTTP/1.1 401 Unauthorized");
    die('Unauthorized');
}

require_once( dirname( __FILE__ ) . '/user/config.php' );

// Verify secret key from config.php
if ( $_SERVER['HTTP_X_AUTH_KEY'] !== LOGGING_SECRET_KEY ) {
    header("HTTP/1.1 401 Unauthorized");
    die('Unauthorized');
}

// Load YOURLS DB core only
require_once( dirname( __FILE__ ) . '/includes/load-yourls.php' );
global $ydb;

$json = file_get_contents('php://input');
$data = json_decode($json);

if ( !$data || !isset($data->shortcode) ) {
    header("HTTP/1.1 400 Bad Request");
    die('Bad Request');
}

// Sanitize and Truncate to prevent DB errors
$shortcode  = yourls_sanitize_keyword($data->shortcode);
$ip         = yourls_sanitize_ip($data->ip);
$referrer   = (!empty($data->referrer)) ? yourls_sanitize_url($data->referrer) : 'direct';
$user_agent = substr(yourls_sanitize_string($data->userAgent), 0, 254);
$country    = substr(yourls_sanitize_string($data->country), 0, 2);
$timestamp  = date('Y-m-d H:i:s');

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

header("HTTP/1.1 200 OK");
echo "OK";
