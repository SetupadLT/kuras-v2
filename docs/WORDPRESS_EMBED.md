# WordPress embed without a plugin

The fuel application remains built and updated from GitHub, while visitors see
it inside the existing WordPress page. WordPress stores no fuel prices and runs
no importer.

## One-time WordPress setup

1. Open the WordPress page that should display the fuel application.
2. Choose a full-width page template and hide the page title if the theme allows it.
3. Add one **Custom HTML** block.
4. Paste the snippet below and update the host only if production uses a host
   other than the GitHub Pages review address.

```html
<style>
body:has(#kuras-pricer-embed) .wp-block-post-title,
body:has(#kuras-pricer-embed) .wp-site-blocks > header,
body:has(#kuras-pricer-embed) header.wp-block-template-part {
  display:none!important;
}
body:has(#kuras-pricer-embed) main,
body:has(#kuras-pricer-embed) .wp-block-post-content {
  margin:0!important;
  padding:0!important;
  max-width:none!important;
}
</style>
<div id="kuras-pricer-embed" style="position:relative;isolation:isolate;z-index:1;width:100vw;max-width:none;margin-left:calc(50% - 50vw);pointer-events:auto!important">
  <iframe
    id="kuras-pricer-frame"
    src="https://setupadlt.github.io/kuras-v2/?embed=1"
    title="Degalų kainos Lietuvoje"
    loading="eager"
    scrolling="no"
    allow="geolocation"
    style="position:relative;z-index:1;display:block;width:100%;height:900px;min-height:0;border:0;pointer-events:auto!important;touch-action:auto"
  ></iframe>
</div>
<script>
(function () {
  var frame = document.getElementById('kuras-pricer-frame');
  var allowedOrigin = 'https://setupadlt.github.io';
  var routes = ['kainos', 'degalines', 'zemelapis', 'reitingai'];
  function currentRoute() {
    var route = window.location.hash.replace(/^#/, '');
    return routes.indexOf(route) >= 0 ? route : 'kainos';
  }
  function sendRoute() {
    frame.contentWindow.postMessage({
      type: 'kuras-pricer:set-route',
      route: currentRoute()
    }, allowedOrigin);
  }
  frame.style.setProperty('pointer-events', 'auto', 'important');
  frame.style.touchAction = 'auto';
  frame.style.minHeight = '0';
  frame.addEventListener('load', sendRoute);
  window.addEventListener('hashchange', sendRoute);
  window.addEventListener('message', function (event) {
    if (event.origin !== allowedOrigin || event.source !== frame.contentWindow) return;
    if (!event.data) return;
    if (event.data.type === 'kuras-pricer:height') {
      var height = Math.max(520, Math.min(12000, Number(event.data.height) || 0));
      frame.style.height = height + 'px';
    }
    if (event.data.type === 'kuras-pricer:route' && routes.indexOf(event.data.route) >= 0) {
      var nextHash = event.data.route === 'kainos' ? '' : '#' + event.data.route;
      if (window.location.hash !== nextHash) window.history.pushState(null, '', window.location.pathname + window.location.search + nextHash);
    }
  });
}());
</script>
```

The `?embed=1` mode hides the duplicate static header and footer. The normal
WordPress header, navigation and footer remain visible around the full fuel
application. The parent validates the message origin before accepting automatic
height and route changes. Each main section gets a shareable URL such as
`#degalines`, `#zemelapis`, or `#reitingai`; refreshing and browser back/forward
navigation keep the selected section open.

## Operational boundary

- GitHub owns code, LEA ingestion, validation and publishing.
- WordPress owns only the page URL, navigation, surrounding theme and editorial copy.
- A failed import leaves the last successful embedded application online.
- Changing the application later requires no WordPress plugin update.
