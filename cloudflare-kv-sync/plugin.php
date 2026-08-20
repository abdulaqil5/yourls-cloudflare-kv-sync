<?php
/*
Plugin Name: Cloudflare KV Sync for YOURLS
Plugin URI: https://abdulaqil.com
Description: Syncs YOURLS links with a Cloudflare KV Namespace for edge redirects.
Version: 1.2
Author: ABDUL AQIL
*/

if( !defined( 'YOURLS_ABSPATH' ) ) die();

// --- Hooks ---
yourls_add_action( 'add_new_link', 'cf_kv_sync_on_add' );
yourls_add_action( 'edit_link', 'cf_kv_sync_on_edit', 10, 4 ); // Accept 4 arguments to catch renamed keywords
yourls_add_action( 'delete_link', 'cf_kv_sync_on_delete' );

// --- Callback Functions ---

// 1. Hook for adding a new link
function cf_kv_sync_on_add( $args ) {
    if ( isset( $args['url']['keyword'] ) && isset( $args['url']['url'] ) ) {
        $shorturl = $args['url']['keyword'];
        $longurl  = $args['url']['url'];

        if ( !empty($shorturl) && !empty($longurl) ) {
            cf_kv_api_request( $shorturl, 'PUT', $longurl );
        }
    }
}

// 2. Hook for editing a link (removes old keyword from KV if renamed)
function cf_kv_sync_on_edit( $return, $url, $old_keyword, $new_keyword ) {
    if ( isset($return['status']) && $return['status'] === 'success' ) {
        // If the keyword itself changed, delete the old one from KV
        if ( $old_keyword !== $new_keyword ) {
            cf_kv_api_request( $old_keyword, 'DELETE' );
        }
        // Save the updated target URL under the active keyword
        cf_kv_api_request( $new_keyword, 'PUT', $url );
    }
}

// 3. Hook for deleting a link (hybrid support for different YOURLS argument formats)
function cf_kv_sync_on_delete( $args ) {
    $keyword = '';

    // If arguments are wrapped in an array
    if ( is_array( $args ) ) {
        $keyword = isset($args[0]) ? $args[0] : '';
    } 
    // If the argument is passed directly as a string
    elseif ( is_string( $args ) ) {
        $keyword = $args;
    }

    if ( !empty($keyword) ) {
        cf_kv_api_request( $keyword, 'DELETE' );
    }
}

// --- Helper: Cloudflare KV API Handler ---
function cf_kv_api_request( $shorturl, $method = 'PUT', $longurl = '' ) {
    if ( !defined('CF_ACCOUNT_ID') || !defined('CF_KV_NAMESPACE_ID') || !defined('CF_API_TOKEN') ) {
        error_log("YOURLS KV Sync Error: Missing Cloudflare credentials in config.");
        return;
    }

    $url = sprintf(
        "https://api.cloudflare.com/client/v4/accounts/%s/storage/kv/namespaces/%s/values/%s",
        CF_ACCOUNT_ID,
        CF_KV_NAMESPACE_ID,
        rawurlencode( $shorturl )
    );

    $ch = curl_init();
    curl_setopt( $ch, CURLOPT_URL, $url );
    curl_setopt( $ch, CURLOPT_RETURNTRANSFER, true );
    curl_setopt( $ch, CURLOPT_CUSTOMREQUEST, $method );
    curl_setopt( $ch, CURLOPT_TIMEOUT, 5 ); 
    curl_setopt( $ch, CURLOPT_CONNECTTIMEOUT, 3 );
    
    if ($method === 'PUT') {
        curl_setopt( $ch, CURLOPT_POSTFIELDS, $longurl );
    }

    $headers = [
        "Authorization: Bearer " . CF_API_TOKEN,
        "Content-Type: text/plain"
    ];
    curl_setopt( $ch, CURLOPT_HTTPHEADER, $headers );

    $response = curl_exec( $ch );
    $http_code = curl_getinfo( $ch, CURLINFO_HTTP_CODE );
    
    // Log network issues
    if ( curl_errno( $ch ) ) {
        error_log( "YOURLS KV Sync Network Error: " . curl_error( $ch ) );
    } 
    // Log Cloudflare API response errors
    elseif ( $http_code >= 400 ) {
        error_log( "YOURLS KV Sync API Error ($http_code): " . $response );
    }
    
    curl_close( $ch );
}

