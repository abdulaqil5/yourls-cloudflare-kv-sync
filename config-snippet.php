<?php
/**
 * Add these lines to user/config.php (after the main YOURLS defines).
 * Replace placeholder values with your real Cloudflare credentials.
 *
 * Never commit user/config.php with real secrets to a public repository.
 */

/** Cloudflare API — used by the cloudflare-kv-sync plugin to write keys to KV */
define( 'CF_ACCOUNT_ID', 'your_cloudflare_account_id' );
define( 'CF_KV_NAMESPACE_ID', 'your_kv_namespace_id' );
define( 'CF_API_TOKEN', 'token_with_edit_permission_on_this_kv_namespace' );

/** Shared secret: must match Worker secret LOGGING_SECRET (wrangler secret put LOGGING_SECRET) */
define( 'LOGGING_SECRET_KEY', 'generate_a_long_random_string' );
