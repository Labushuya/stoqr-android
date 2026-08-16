export * from './schema'

// Der Postgres-Client (./client) wird BEWUSST NICHT aus dem Haupt-Barrel
// re-exportiert: er ruft beim Import postgres(connectionString) auf und zieht
// den nativen 'postgres'-Treiber (perf_hooks etc.) mit. Das wuerde den
// App-Bundle (Browser/WebView, adapter-static) brechen. Wer die Pi-DB-Instanz
// braucht, importiert sie gezielt via '@stoqr/db/client' (auf dem App-Target
// per Vite-Alias durch einen Browser-Stub ersetzt).

// Reine Werkszustands-Seed-Daten (ohne die runSeed()-Funktionen, die das globale
// db binden) — damit der Werksreset sie in seiner eigenen Transaktion neu
// einspielen kann, ohne die Daten zu duplizieren.
export { categorySeeds } from '../seeds/categories'
export { nutrientTypeSeeds } from '../seeds/nutrient-types'

