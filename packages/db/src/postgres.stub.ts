// Browser-Stub fuer den 'postgres'-Treiber (App-Target). Wird nie aufgerufen —
// der App-Target nutzt On-Device-SQLite. Existiert nur, damit ein etwaiger
// transitiver Import von 'postgres' den SPA-Bundle nicht mit node:perf_hooks/
// net/tls bricht (adapter-static faehrt auch einen SSR-Shell-Pass).
export default function postgres() {
  throw new Error('[stoqr] postgres()-Treiber im App-Target aufgerufen — nicht vorgesehen (On-Device-SQLite).')
}
