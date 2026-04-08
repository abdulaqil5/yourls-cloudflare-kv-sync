<?php
/*
Plugin Name: Cloudflare KV Sync for YOURLS
Plugin URI: https://github.com/abdulaqil/yourls-cloudflare-kv-sync
Description: Syncs YOURLS links with a Cloudflare KV Namespace for edge redirects.
Version: 1.1
Author: Abdul Aqil
*/

if( !defined( 'YOURLS_ABSPATH' ) ) die();

// Hooks
yourls_add_action( 'add_new_link', 'cf_kv_sync_on_add_update' );
yourls_add_action( 'edit_link', 'cf_kv_sync_on_add_update' );
yourls_add_action( 'delete_link', 'cf_kv_sync_on_delete' );

function cf_kv_sync_on_add_update( $args ) {
    if ( isset( $args['url']['keyword'] ) && isset( $args['url']['url'] ) ) {
        $shorturl = $args['url']['keyword'];
        $longurl  = $args['url']['url'];

        if ( !empty($shorturl) && !empty($longurl) ) {
            cf_kv_api_request( $shorturl, 'PUT', $longurl );
        }
    }
}

function cf_kv_sync_on_delete( $args ) {
    $shortcode = $args[0];
    cf_kv_api_request( $shortcode, 'DELETE' );
}

function cf_kv_api_request( $shorturl, $method = 'PUT', $longurl = '' ) {
    if ( !defined('CF_ACCOUNT_ID') || !defined('CF_KV_NAMESPACE_ID') || !defined('CF_API_TOKEN') ) {
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
    curl_setopt( $ch, CURLOPT_TIMEOUT, 3 );
    curl_setopt( $ch, CURLOPT_CONNECTTIMEOUT, 2 );

    if ( $method === 'PUT' ) {
        curl_setopt( $ch, CURLOPT_POSTFIELDS, $longurl );
    }

    $headers = [
        "Authorization: Bearer " . CF_API_TOKEN,
        "Content-Type: text/plain"
    ];
    curl_setopt( $ch, CURLOPT_HTTPHEADER, $headers );

    curl_exec( $ch );
    curl_close( $ch );
}
