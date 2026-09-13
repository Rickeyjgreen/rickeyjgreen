const path = window.location.pathname.toLowerCase();

if (path === '/' || path === '/scrape-it' || path.startsWith('/scrape-it/')) {
  import('./scrape-it/bootstrap.jsx');
} else {
  import('./main.jsx');
}
