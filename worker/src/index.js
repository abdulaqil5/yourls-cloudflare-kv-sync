/**
 * YOURLS edge redirect + KV cache + optional click logging.
 * KV binding: YOURLS_LINKS (see wrangler.toml). Secret: LOGGING_SECRET_KEY (same as user/config.php).
 */
const BOT_CATEGORY_DENYLIST = new Set([
  "Monitoring & Analytics",
  "Security Scanner",
  "Advertising",
]);
const STATIC_ASSETS = /\.(png|jpg|jpeg|gif|ico|css|js|woff2?|svg)$/i;

const CUSTOM_404_HTML = `
<!DOCTYPE html> <html lang="en">
    <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="X-UA-Compatible" content="ie=edge">
    <meta name="theme-color" content="#FFFFFF" media="(prefers-color-scheme: light)"/>
    <meta name="theme-color" content="#000000" media="(prefers-color-scheme: dark)"/>
    <meta name="title" property="og:title" content="Page Not Found | ABDUL AQIL">

<meta property="og:image" content="https://cdn.abdulaqil.com/assets/favicon/icon.svg">

<meta property="og:description" content="The page you are looking for might have been removed had its name changed or is temporarily unavailable.">
    <link rel="icon" href="https://cdn.abdulaqil.com/assets/favicon/icon-new.svg" type="image/svg+xml">
     <link rel="apple-touch-icon" sizes="180x180" href="https://cdn.abdulaqil.com/assets/favicon/apple-touch-icon.png">
    <link rel="icon" type="image/png" sizes="32x32" href="https://cdn.abdulaqil.com/assets/favicon/favicon-32x32.png">
    <link rel="icon" type="image/png" sizes="16x16" href="https://cdn.abdulaqil.com/assets/favicon/favicon-16x16.png">
    <link rel="mask-icon" href="https://cdn.abdulaqil.com/assets/favicon/safari-pinned-tab.svg" color="#ff0000">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&display=swap" rel="stylesheet">
     <link rel="preconnect" href="https://cdn2.abdulaqil.com" crossorigin>
    <meta name="msapplication-TileColor" content="#da532c">
    <meta name="theme-color" content="#ffffff">
    <title>Page Not Found | ABDUL AQIL</title>
     <!-- Google tag (gtag.js) -->
    <script async src="https://www.googletagmanager.com/gtag/js?id=G-6QGNQD3QDR"></script>
    <script>
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      gtag("js", new Date());
    
      gtag("config", "G-6QGNQD3QDR");
    </script>

    <script type="text/javascript">
    (function(c,l,a,r,i,t,y){
        c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
        t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
        y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
    })(window, document, "clarity", "script", "o87an1o9ys");
    </script>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: "Inter", sans-serif;
            background-color: #fff;
            color: #000;
            height: 100vh;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            text-align: center;
            padding: 20px;
        }
        
        html, body{
            overflow:hidden;
            
        }

        .logo {
            position: absolute;
            top: 60px;
            left: 50%;
            transform: translateX(-50%);
        }

        .logo img {
            width: 40px;
            height: auto;
        }

        .logo svg {
            width: 40px;
            height: auto;
            display: block;
        }

        h1 {
            font-size: 130px;
            margin-bottom: 20px;
        }

        h2 {
            font-size: 30px;
            margin-bottom: 30px;
        }

        .back-link {
            font-size: 20px;
            font-weight: 500;
        }

        .back-link p {
            margin: 0;
            color: grey;
        }

        .back-link a {
            color: black;
            text-decoration: none;
            background-image: linear-gradient(black, black);
            background-size: 0% 0.1em;
            background-position-y: 100%;
            background-position-x: 0%;
            background-repeat: no-repeat;
            transition: background-size 0.2s ease-in-out;
        }

        .back-link a:hover,
        .back-link a:focus,
        .back-link a:active {
            background-size: 100% 0.1em;
        }

        footer {
            position: absolute;
            bottom: 60px;
            font-size: 13px;
        }
        
        footer a {
            text-decoration: none;
            color: #000;
        }

        @media (max-width: 768px) {
            h1 {
                font-size: 130px;
            }

            h2 {
                font-size: 30px;
            }

            .back-link {
                font-size: 20px;
            }
        }

        @media (max-width: 480px) {
            h1 {
                font-size: 90px;
                
            }

            h2 {
                font-size: 22px;
            }

            .back-link {
                font-size: 18px;
            }
        }
        
        /* Dark mode styles */
        @media (prefers-color-scheme: dark) {
            body {
                background-color: #000;
                color: #fff;
            }

            .back-link p {
                color: lightgray;
            }

            .back-link a {
                color: white;
                background-image: linear-gradient(white, white);
            }

            .logo svg path {
                fill: #fff !important;
            }

            footer {
                color: white;
            }

            footer a {
                color: white;
            }
        }
    </style>
</head>

<body>
    <div class="logo">
        <a href="https://abdulaqil.com/">
            <svg id="Layer_1" data-name="Layer 1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 441.8 328.7"
                width="40" aria-label="AA Logo">
                <path
                    d="M158.8,293.3h-1.8c-5.3,4.5-10.4,8.7-15.2,12.5s-10.9,7.6-18.2,11.3c-6.4,3.3-13.1,6.1-20.2,8.3-7.1,2.2-14.9,3.3-23.4,3.3-26.5,0-46.5-7.8-59.9-23.4S0,268.4,0,241.3s3.7-40.4,11.2-58.6c7.5-18.3,17.4-34.3,29.9-48.1,12.7-13.7,27.5-24.6,44.5-32.6,17.7-8.3,36.9-12.2,56.4-11.9,12.4.2,23.3,1.8,32.8,4.8,10.3,3.2,18.7,7.5,25.3,13l70.1-14.4,3.2,3.7-33.6,140.4c-1.2,4.7-2.5,10.6-3.9,17.7s-2.1,12.4-2.1,16.1c0,8.7,2,14.7,5.9,17.9,4,3.3,10.8,4.9,20.6,4.9s9.4-.7,15.4-2.5c9.5-2.9,26.7-13,29.1-14l-20.6,29.1c-.6.9-1.5,1.6-2.5,2-14.3,5.6-25.9,10-34.6,13-9.1,3.1-19.5,4.7-31.4,4.7s-28.2-3.1-37.5-9.2c-9.4-6.2-15.9-14.1-19.5-23.9h0ZM186,148.5c0-3.3-.5-7.3-1.4-11.9-.9-4.6-2.5-8.4-4.8-11.6-2.7-4-6.3-7-10.7-9-4.4-2.1-9.9-3.1-16.5-3.1-10.1,0-19.3,3.6-27.8,10.8s-16,16.8-22.5,28.9c-6.4,11.9-11.4,25.7-15.1,41.4s-5.5,31.8-5.5,48.2.6,14.4,1.7,20.8,3,11.8,5.6,16.2c2.7,4.7,6.4,8.4,11.1,11,4.7,2.6,10.5,3.9,17.5,3.9s14.1-2.1,20.7-6.3c6.6-4.2,12.8-9.3,18.4-15.4l29.2-123.8h.1Z" />
                <path d="M337.4,32.7l104.4,296h-63.6L275.3,0l62.1,32.7h0Z" />
            </svg>
        </a>
    </div>
    <h1>404</h1>
    <h2>Page Not Found</h2>

    <div class="back-link">
        <p><span>Go back </span><a href="https://abdulaqil.com">home</a><span>.</span></p>
    </div>

    <footer>Made with ❤️ By <a href="https://abdulaqil.com"><b>ABDUL AQIL</b></a></footer>

</body>

</html>
`;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (
      path === "/" ||
      path.startsWith("/admin") ||
      path.includes("yourls-api.php") ||
      STATIC_ASSETS.test(path)
    ) {
      return fetch(request);
    }

    const shortcode = path.substring(1).replace(/\/$/, "");
    if (!shortcode) return fetch(request);

    const isStatsRequest = shortcode.endsWith("+");
    const actualShortcode = isStatsRequest ? shortcode.slice(0, -1) : shortcode;

    const longUrl = await env.YOURLS_LINKS.get(actualShortcode);

    if (longUrl) {
      if (isStatsRequest) return fetch(request);

      const botInfo = request.cf?.botManagement;
      const isDeniedBot =
        botInfo?.verifiedBot && BOT_CATEGORY_DENYLIST.has(botInfo?.category);
      if (!isDeniedBot) {
        ctx.waitUntil(logClickToOrigin(request, actualShortcode, env));
      }

      return new Response(null, {
        status: 301,
        headers: {
          Location: longUrl,
          "Cache-Control": "public, max-age=3600",
          "X-Robots-Tag": "noindex",
        },
      });
    }

    const originResponse = await fetch(request);

    if (originResponse.status === 404) {
      return new Response(CUSTOM_404_HTML, {
        status: 404,
        headers: { "Content-Type": "text/html;charset=UTF-8" },
      });
    }

    return originResponse;
  },
};

async function logClickToOrigin(request, shortcode, env) {
  const urlObj = new URL(request.url);
  const logUrl = `https://${urlObj.hostname}/log-click.php`;
  const body = JSON.stringify({
    shortcode,
    ip: request.headers.get("CF-Connecting-IP"),
    userAgent: request.headers.get("User-Agent"),
    referrer: request.headers.get("Referer"),
    country: request.headers.get("CF-IPCountry"),
  });

  try {
    await fetch(logUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Auth-Key": env.LOGGING_SECRET_KEY,
      },
      body,
    });
  } catch {
    // Non-blocking
  }
}
