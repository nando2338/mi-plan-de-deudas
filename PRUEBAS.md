# Comprobaciones de transferencia

Fuente revisada: versión 12 publicada del sitio, commit de origen `b881ea8fd30a58779f9eadeeee690ba1ef595f29`.

Resultados de esta revisión, con datos ficticios:

- Sintaxis: `node --check` en todos los archivos JavaScript de `dist/`: aprobado.
- Integridad: referencias locales del HTML, recursos del service worker y los íconos del manifiesto: presentes.
- Pruebas automatizadas de cálculos financieros y comparación de estrategias: aprobadas.
- Pruebas automatizadas de selector de moneda y ayudas educativas: aprobadas con DOM simulado.
- Pruebas automatizadas de recordatorios y su interfaz: aprobadas con DOM simulado.
- Pruebas automatizadas de validación, respaldo, restauración, cuota, recuperación y conflicto simulado: aprobadas.
- Revisión por patrones de credenciales y datos personales en los archivos transferidos: no se encontraron secretos conocidos. Esta revisión no garantiza una ausencia absoluta.

Las pruebas automatizadas de esta revisión se ejecutaron desde el entorno de desarrollo original; sus archivos de prueba auxiliares no forman parte de la versión publicada transferida. No se ejecutaron pruebas en dispositivos físicos ni pruebas reales de concurrencia entre pestañas durante esta transferencia. Utiliza una sola pestaña para evitar el riesgo conocido de sobrescritura simultánea.
